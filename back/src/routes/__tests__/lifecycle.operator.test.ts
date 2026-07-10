// Unit tests de la palanca del kill switch (crm-tenant-lifecycle-gate, WU3.2):
// PUT /businesses/:id/lifecycle + GET /businesses/:id/state-events.
// Runner: node --import tsx --test
//
// Mismo patrón DI que api-keys.operator.test.ts: BD inyectada como doble en memoria,
// se ejercitan los handlers REALES (con resolveTransition real) sin BD ni migración.
// El gate de token (requireOperatorToken) ya está cubierto en service-operator.test.ts.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { TenantLifecycle } from '../../lib/generated/prisma/client.js';
import {
  putLifecycleHandler,
  listStateEventsHandler,
  type LifecycleOperatorDb,
  type LifecycleOperatorTx,
} from '../service-operator-lifecycle.js';

const NOW = new Date('2026-07-10T12:00:00.000Z');
const FUTURE = new Date('2026-07-20T00:00:00.000Z');

function mockRes() {
  const res = { statusCode: 200 } as unknown as Response & {
    statusCode: number;
    body?: unknown;
    status(code: number): typeof res;
    json(body: unknown): typeof res;
  };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (body: unknown) => { res.body = body; return res; };
  return res;
}

function mockReq(opts: { params?: Record<string, string>; body?: unknown } = {}) {
  return { params: opts.params ?? {}, body: opts.body } as unknown as Request;
}

type BusinessRow = {
  id: string;
  lifecycle: TenantLifecycle;
  graceUntil: Date | null;
  suspendedAt: Date | null;
};

type EventRow = {
  businessId: string;
  fromState: TenantLifecycle;
  toState: TenantLifecycle;
  reason: string | null;
  actor: string;
  createdAt: Date;
};

/** Doble en memoria: un negocio + su histórico. SIN métodos de borrado (invariante). */
function fakeDb(seed?: Partial<BusinessRow>) {
  const business: BusinessRow = {
    id: 'biz-life',
    lifecycle: TenantLifecycle.ACTIVE,
    graceUntil: null,
    suspendedAt: null,
    ...seed,
  };
  const events: EventRow[] = [];
  let clock = 0; // createdAt creciente para poder verificar el orden desc

  const tx: LifecycleOperatorTx = {
    business: {
      update: async ({ where, data }) => {
        assert.equal(where.id, business.id);
        // Mimetiza Prisma: solo aplica las claves presentes (undefined = no tocar).
        business.lifecycle = data.lifecycle;
        if (data.graceUntil !== undefined) business.graceUntil = data.graceUntil;
        if (data.suspendedAt !== undefined) business.suspendedAt = data.suspendedAt;
        return { ...business };
      },
    },
    tenantStateEvent: {
      create: async ({ data }) => {
        events.push({ ...data, createdAt: new Date(NOW.getTime() + ++clock) });
        return { id: `evt-${clock}` };
      },
    },
  };

  const db: LifecycleOperatorDb = {
    business: {
      findFirst: async ({ where }) =>
        where.id === business.id ? { id: business.id, lifecycle: business.lifecycle } : null,
    },
    tenantStateEvent: {
      findMany: async ({ where }) =>
        events
          .filter((e) => e.businessId === where.businessId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    },
    $transaction: (fn) => fn(tx),
  };

  return { db, business, events };
}

async function put(db: LifecycleOperatorDb, body: unknown, opts?: { invalidateState?: (id: string) => void; id?: string }) {
  const res = mockRes();
  await putLifecycleHandler(
    db,
    mockReq({ params: { id: opts?.id ?? 'biz-life' }, body }),
    res,
    { now: NOW, invalidateState: opts?.invalidateState ?? (() => {}) },
  );
  return res;
}

describe('PUT /businesses/:id/lifecycle — fija el estado destino (sin 409)', () => {
  test('ACTIVE → SUSPENDED: fija suspendedAt, inserta evento e invalida el cache', async () => {
    const { db, business, events } = fakeDb();
    const invalidated: string[] = [];
    const res = await put(db, { state: 'SUSPENDED', reason: 'impago' }, { invalidateState: (id) => invalidated.push(id) });

    assert.equal(res.statusCode, 200);
    assert.equal(business.lifecycle, TenantLifecycle.SUSPENDED);
    assert.deepEqual(business.suspendedAt, NOW);
    assert.equal(events.length, 1);
    assert.deepEqual(
      { from: events[0].fromState, to: events[0].toState, reason: events[0].reason, actor: events[0].actor },
      { from: TenantLifecycle.ACTIVE, to: TenantLifecycle.SUSPENDED, reason: 'impago', actor: 'operator' },
    );
    assert.deepEqual(invalidated, ['biz-life'], 'debe invalidar el cache del resolver');
  });

  test('TERMINATED → ACTIVE (reactivación de primera clase): 200, sin 409, limpia gracia/suspensión', async () => {
    const { db, business, events } = fakeDb({
      lifecycle: TenantLifecycle.TERMINATED,
      suspendedAt: new Date('2026-06-01T00:00:00.000Z'),
      graceUntil: new Date('2026-05-01T00:00:00.000Z'),
    });
    const res = await put(db, { state: 'ACTIVE', reason: 'cliente vuelve' });

    assert.equal(res.statusCode, 200);
    assert.equal(business.lifecycle, TenantLifecycle.ACTIVE);
    assert.equal(business.graceUntil, null);
    assert.equal(business.suspendedAt, null);
    assert.equal(events[0].fromState, TenantLifecycle.TERMINATED);
    assert.equal(events[0].toState, TenantLifecycle.ACTIVE);
  });

  test('→ GRACE con graceUntil futuro: 200 y persiste la fecha', async () => {
    const { db, business } = fakeDb();
    const res = await put(db, { state: 'GRACE', graceUntil: FUTURE.toISOString() });

    assert.equal(res.statusCode, 200);
    assert.equal(business.lifecycle, TenantLifecycle.GRACE);
    assert.deepEqual(business.graceUntil, FUTURE);
  });

  test('cualquiera de los 4 estados es destino válido — jamás 409', async () => {
    for (const state of ['ACTIVE', 'GRACE', 'SUSPENDED', 'TERMINATED']) {
      const { db } = fakeDb({ lifecycle: TenantLifecycle.TERMINATED });
      const res = await put(db, { state, graceUntil: FUTURE.toISOString() });
      assert.equal(res.statusCode, 200, `fijar ${state} debe ser 200`);
      assert.notEqual(res.statusCode, 409);
    }
  });

  test('→ GRACE sin graceUntil → 400 grace_until_required; no escribe ni evento ni invalida', async () => {
    const { db, business, events } = fakeDb();
    const invalidated: string[] = [];
    const res = await put(db, { state: 'GRACE' }, { invalidateState: (id) => invalidated.push(id) });

    assert.equal(res.statusCode, 400);
    assert.equal((res.body as { error: { code: string } }).error.code, 'grace_until_required');
    assert.equal(business.lifecycle, TenantLifecycle.ACTIVE, 'el negocio no debe cambiar');
    assert.equal(events.length, 0, 'sin evento en payload inválido');
    assert.deepEqual(invalidated, [], 'sin invalidación en payload inválido');
  });

  test('estado desconocido → 400 unknown_state', async () => {
    const { db } = fakeDb();
    const res = await put(db, { state: 'DELETED' });
    assert.equal(res.statusCode, 400);
    assert.equal((res.body as { error: { code: string } }).error.code, 'unknown_state');
  });

  test('negocio inexistente → 404 business_not_found', async () => {
    const { db } = fakeDb();
    const res = await put(db, { state: 'SUSPENDED' }, { id: 'biz-ghost' });
    assert.equal(res.statusCode, 404);
    assert.equal((res.body as { error: { code: string } }).error.code, 'business_not_found');
  });
});

describe('GET /businesses/:id/state-events — histórico descendente', () => {
  test('lista los eventos (from,to,reason,actor,createdAt) en orden desc', async () => {
    const { db } = fakeDb();
    await put(db, { state: 'SUSPENDED', reason: 'impago' });
    await put(db, { state: 'ACTIVE', reason: 'pagado' });

    const res = mockRes();
    await listStateEventsHandler(db, mockReq({ params: { id: 'biz-life' } }), res);

    assert.equal(res.statusCode, 200);
    const body = res.body as { events: Array<Record<string, unknown>> };
    assert.equal(body.events.length, 2);
    // Desc: el último cambio (→ACTIVE) primero.
    assert.equal(body.events[0].toState, TenantLifecycle.ACTIVE);
    assert.equal(body.events[1].toState, TenantLifecycle.SUSPENDED);
    assert.deepEqual(
      Object.keys(body.events[0]).sort(),
      ['actor', 'createdAt', 'fromState', 'reason', 'toState'],
    );
  });

  test('negocio inexistente → 404', async () => {
    const { db } = fakeDb();
    const res = mockRes();
    await listStateEventsHandler(db, mockReq({ params: { id: 'biz-ghost' } }), res);
    assert.equal(res.statusCode, 404);
  });
});
