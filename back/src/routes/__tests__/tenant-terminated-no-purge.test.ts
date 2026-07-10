// Test de invariante (crm-tenant-lifecycle-gate, WU3.4 / design §2 y §7):
// TERMINATED corta el acceso pero JAMÁS destruye datos — reactivar (TERMINATED → ACTIVE)
// restaura el servicio con TODO el contenido del negocio intacto.
// Runner: node --import tsx --test
//
// El doble de BD contiene datos "del negocio" (clientes, facturas) además de la fila de
// Business; cualquier intento de borrado (delete/deleteMany en cualquier tabla) lanza.
// Se ejercita el handler REAL del operador contra ese doble.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { TenantLifecycle } from '../../lib/generated/prisma/client.js';
import {
  putLifecycleHandler,
  type LifecycleOperatorDb,
  type LifecycleOperatorTx,
} from '../service-operator-lifecycle.js';

const NOW = new Date('2026-07-10T12:00:00.000Z');

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

function mockReq(body: unknown) {
  return { params: { id: 'biz-keep' }, body } as unknown as Request;
}

/** Guardia anti-purga: si el kill switch tocara un método de borrado, el test revienta. */
const forbidPurge = () => {
  throw new Error('PURGA PROHIBIDA: ningún cambio de lifecycle puede borrar datos');
};

function makeWorld() {
  const business = {
    id: 'biz-keep',
    lifecycle: TenantLifecycle.ACTIVE as TenantLifecycle,
    graceUntil: null as Date | null,
    suspendedAt: null as Date | null,
  };
  // Datos "del negocio" que deben sobrevivir a TERMINATED y a la reactivación.
  const customers = [
    { id: 'c1', nombre: 'Ana', email: 'ana@example.com' },
    { id: 'c2', nombre: 'Luis', email: 'luis@example.com' },
  ];
  const invoices = [{ id: 'f1', numero: 'F00001', total: 120 }];
  const events: Array<{ businessId: string; fromState: TenantLifecycle; toState: TenantLifecycle; reason: string | null; actor: string; createdAt: Date }> = [];
  let clock = 0;

  const tx: LifecycleOperatorTx = {
    business: {
      update: async ({ data }) => {
        business.lifecycle = data.lifecycle;
        if (data.graceUntil !== undefined) business.graceUntil = data.graceUntil;
        if (data.suspendedAt !== undefined) business.suspendedAt = data.suspendedAt;
        return { ...business };
      },
    },
    tenantStateEvent: {
      create: async ({ data }) => {
        events.push({ ...data, createdAt: new Date(NOW.getTime() + ++clock) });
        return {};
      },
    },
  };

  // El doble expone TAMBIÉN métodos de borrado (fuera de la interfaz estrecha) que lanzan:
  // si la implementación del handler los alcanzara por cualquier vía, el test falla.
  const db = {
    business: {
      findFirst: async ({ where }: { where: { id: string; eliminadoEn: null } }) =>
        where.id === business.id ? { id: business.id, lifecycle: business.lifecycle } : null,
      delete: forbidPurge,
      deleteMany: forbidPurge,
    },
    customer: { delete: forbidPurge, deleteMany: forbidPurge },
    invoice: { delete: forbidPurge, deleteMany: forbidPurge },
    tenantStateEvent: {
      findMany: async () => events,
      delete: forbidPurge,
      deleteMany: forbidPurge,
    },
    $transaction: (fn: (t: LifecycleOperatorTx) => Promise<unknown>) => fn(tx),
  } as unknown as LifecycleOperatorDb;

  return { db, business, customers, invoices, events };
}

async function setState(db: LifecycleOperatorDb, body: unknown) {
  const res = mockRes();
  await putLifecycleHandler(db, mockReq(body), res, { now: NOW, invalidateState: () => {} });
  return res;
}

describe('TERMINATED conserva datos; reactivar restaura sin pérdida (WU3.4)', () => {
  test('ACTIVE → TERMINATED → ACTIVE: cero borrados, datos idénticos, servicio restaurado', async () => {
    const { db, business, customers, invoices, events } = makeWorld();
    const customersSnapshot = structuredClone(customers);
    const invoicesSnapshot = structuredClone(invoices);

    // 1) Corte total: TERMINATED.
    const resTerm = await setState(db, { state: 'TERMINATED', reason: 'baja del cliente' });
    assert.equal(resTerm.statusCode, 200);
    assert.equal(business.lifecycle, TenantLifecycle.TERMINATED);

    // Con el negocio TERMINATED, TODOS los datos siguen ahí (acceso cortado ≠ destrucción).
    assert.deepEqual(customers, customersSnapshot, 'clientes intactos bajo TERMINATED');
    assert.deepEqual(invoices, invoicesSnapshot, 'facturas intactas bajo TERMINATED');

    // 2) Reactivación de primera clase: TERMINATED → ACTIVE (sin 409).
    const resActive = await setState(db, { state: 'ACTIVE', reason: 'el cliente vuelve' });
    assert.equal(resActive.statusCode, 200);
    assert.equal(business.lifecycle, TenantLifecycle.ACTIVE);
    assert.equal(business.graceUntil, null, 'ACTIVE limpia la gracia');
    assert.equal(business.suspendedAt, null, 'ACTIVE limpia la suspensión');

    // Los datos nunca se fueron: el servicio se restaura COMPLETO.
    assert.deepEqual(customers, customersSnapshot, 'clientes intactos tras reactivar');
    assert.deepEqual(invoices, invoicesSnapshot, 'facturas intactas tras reactivar');

    // Toda transición dejó su evento de auditoría (ida y vuelta).
    assert.equal(events.length, 2);
    assert.deepEqual(
      events.map((e) => [e.fromState, e.toState]),
      [
        [TenantLifecycle.ACTIVE, TenantLifecycle.TERMINATED],
        [TenantLifecycle.TERMINATED, TenantLifecycle.ACTIVE],
      ],
    );
  });

  test('pasar por los 4 estados seguidos tampoco toca datos', async () => {
    const { db, customers, invoices } = makeWorld();
    const customersSnapshot = structuredClone(customers);
    const invoicesSnapshot = structuredClone(invoices);
    const future = new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

    for (const body of [
      { state: 'GRACE', graceUntil: future },
      { state: 'SUSPENDED' },
      { state: 'TERMINATED' },
      { state: 'ACTIVE' },
    ]) {
      const res = await setState(db, body);
      assert.equal(res.statusCode, 200, `fijar ${JSON.stringify(body.state)} debe ser 200`);
    }

    assert.deepEqual(customers, customersSnapshot);
    assert.deepEqual(invoices, invoicesSnapshot);
  });
});
