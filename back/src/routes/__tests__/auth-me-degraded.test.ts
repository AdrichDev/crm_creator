// Unit tests del bootstrap de identidad degradado (crm-tenant-block-scoping, tarea 1.3).
// Runner: node --import tsx --test
//
// GET /auth/me ya NO aplica el gate duro (423/410): la identidad siempre responde 200 y
// solo la config operable `business` se degrada a null cuando el lifecycle efectivo del
// negocio activo no es ACTIVE/GRACE. Patrón espejo de login-gate.test.ts: sin BD real
// (doble DI de TenantStateDb), se simula el flujo real de /me — `authenticate` fija la
// identidad → `resolveMeLifecycle` deja el estado en res.locals SIN cortar → el handler
// decide `business` con `isBusinessOperable`. businessIds únicos por test: el cache del
// resolver es global de módulo.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Response, NextFunction } from 'express';
import { TenantLifecycle } from '../../lib/generated/prisma/client.js';
import type { TenantStateDb } from '../../lib/tenant-lifecycle/resolver.js';
import { GRACE_UNTIL_HEADER } from '../../middleware/tenant-gate.js';
import { resolveMeLifecycle, isBusinessOperable } from '../auth.js';
import type { AuthedRequest } from '../../middleware/types.js';

const FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000);
const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000);

function mockRes() {
  const res = { statusCode: 200, locals: {} as Record<string, unknown>, headers: {} as Record<string, string> } as unknown as Response & {
    statusCode: number;
    body?: unknown;
    locals: Record<string, unknown>;
    headers: Record<string, string>;
    status(code: number): typeof res;
    json(body: unknown): typeof res;
    setHeader(name: string, value: string): typeof res;
  };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (body: unknown) => { res.body = body; return res; };
  res.setHeader = (name: string, value: string) => { res.headers[name] = value; return res; };
  return res;
}

/** BD doble del resolver: siempre devuelve la fila indicada. */
function dbWith(row: { lifecycle: TenantLifecycle; graceUntil?: Date | null }): TenantStateDb {
  return {
    business: {
      findUnique: async () => ({
        lifecycle: row.lifecycle,
        graceUntil: row.graceUntil ?? null,
        suspendedAt: null,
      }),
    },
  };
}

interface MePayload {
  user: { id: string };
  activeBusinessId: string;
  business: { id: string } | null;
  lifecycle: TenantLifecycle | null;
}

/**
 * Simula el flujo real de GET /auth/me con el MISMO orden que el wiring:
 * identidad resuelta (como haría `authenticate`) → resolveMeLifecycle REAL con BD
 * doble → handler que degrada `business` con `isBusinessOperable` (la misma decisión
 * exportada que usa el handler real).
 */
async function bootstrapMe(db: TenantStateDb, businessId: string) {
  const req = { headers: {} } as unknown as AuthedRequest;
  req.userId = 'user-1';
  req.businessId = businessId;

  const res = mockRes();
  let payload: MePayload | null = null;
  const next: NextFunction = () => {
    const lifecycle = (res.locals.tenantLifecycle ?? null) as TenantLifecycle | null;
    payload = {
      user: { id: req.userId! },
      activeBusinessId: businessId,
      business: isBusinessOperable(lifecycle) ? { id: businessId } : null,
      lifecycle,
    };
    res.json(payload);
  };
  await resolveMeLifecycle({ db })(req, res, next);
  return { res, payload: payload as MePayload | null };
}

describe('/auth/me degradado — identidad siempre alcanzable (crm-tenant-block-scoping)', () => {
  test('negocio SUSPENDED → 200 con business:null y lifecycle SUSPENDED (nunca 423)', async () => {
    const { res, payload } = await bootstrapMe(
      dbWith({ lifecycle: TenantLifecycle.SUSPENDED }),
      'me-degraded-suspended',
    );
    assert.equal(res.statusCode, 200, 'la identidad nunca se corta con 423');
    assert.ok(payload, 'el payload de identidad debe emitirse');
    assert.equal(payload.business, null, 'la config operable se degrada a null');
    assert.equal(payload.lifecycle, TenantLifecycle.SUSPENDED);
    assert.deepEqual(payload.user, { id: 'user-1' });
  });

  test('negocio TERMINATED → 200 con business:null y lifecycle TERMINATED (nunca 410)', async () => {
    const { res, payload } = await bootstrapMe(
      dbWith({ lifecycle: TenantLifecycle.TERMINATED }),
      'me-degraded-terminated',
    );
    assert.equal(res.statusCode, 200);
    assert.ok(payload);
    assert.equal(payload.business, null);
    assert.equal(payload.lifecycle, TenantLifecycle.TERMINATED);
  });

  test('GRACE expirada (perezosa) → 200 con business:null y lifecycle efectivo SUSPENDED', async () => {
    const { res, payload } = await bootstrapMe(
      dbWith({ lifecycle: TenantLifecycle.GRACE, graceUntil: PAST }),
      'me-degraded-grace-expired',
    );
    assert.equal(res.statusCode, 200);
    assert.ok(payload);
    assert.equal(payload.business, null);
    assert.equal(payload.lifecycle, TenantLifecycle.SUSPENDED, 'gracia expirada = suspendido efectivo');
  });

  test('negocio ACTIVE → business presente y lifecycle ACTIVE', async () => {
    const { res, payload } = await bootstrapMe(
      dbWith({ lifecycle: TenantLifecycle.ACTIVE }),
      'me-degraded-active',
    );
    assert.equal(res.statusCode, 200);
    assert.ok(payload);
    assert.deepEqual(payload.business, { id: 'me-degraded-active' });
    assert.equal(payload.lifecycle, TenantLifecycle.ACTIVE);
  });

  test('GRACE vigente → business presente + header x-tenant-grace-until preservado', async () => {
    const { res, payload } = await bootstrapMe(
      dbWith({ lifecycle: TenantLifecycle.GRACE, graceUntil: FUTURE }),
      'me-degraded-grace-ok',
    );
    assert.equal(res.statusCode, 200);
    assert.ok(payload);
    assert.deepEqual(payload.business, { id: 'me-degraded-grace-ok' });
    assert.equal(payload.lifecycle, TenantLifecycle.GRACE);
    assert.equal(res.headers[GRACE_UNTIL_HEADER], FUTURE.toISOString(), 'el header de gracia se conserva');
  });

  test('sin businessId resuelto → lifecycle null y business null (identidad igual servida)', async () => {
    const req = { headers: {} } as unknown as AuthedRequest;
    req.userId = 'user-1';
    // Sin req.businessId: el middleware no opina y no consulta BD.
    const res = mockRes();
    let reached = false;
    const next: NextFunction = () => { reached = true; };
    await resolveMeLifecycle({ db: dbWith({ lifecycle: TenantLifecycle.ACTIVE }) })(req, res, next);
    assert.equal(reached, true, 'next() siempre se llama');
    assert.equal(res.locals.tenantLifecycle, null);
    assert.equal(isBusinessOperable(null), false, 'sin lifecycle no se sirve business');
  });
});
