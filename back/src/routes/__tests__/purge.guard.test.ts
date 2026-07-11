// Unit tests de la purga de datos (crm-tenant-lifecycle-gate, WU6):
// POST /businesses/:id/purge — doble confirmación + separación total del lifecycle.
// Runner: node --import tsx --test
//
// Mismo patrón DI que lifecycle.operator.test.ts: BD doble en memoria, se
// ejercita el handler REAL sin BD real (NUNCA se toca una base de datos).
// Cubre las tres garantías del design §7:
//   1. Sin doble confirmación (confirm+echo coincidente) → 400 y CERO borrados.
//   2. Con doble confirmación → borrado ordenado (hijos→padres, negocio último).
//   3. Ningún camino de lifecycle puede invocar la purga (separación estructural).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { TenantLifecycle } from '../../lib/generated/prisma/client.js';
import {
  purgeBusinessHandler,
  buildPurgeOperatorRouter,
  type PurgeDb,
  type PurgeTx,
} from '../service-operator-purge.js';
import {
  putLifecycleHandler,
  buildLifecycleOperatorRouter,
  type LifecycleOperatorDb,
} from '../service-operator-lifecycle.js';

const BIZ_ID = 'biz-purge';
const BIZ_NAME = 'EDM San Blas';

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

/** Modelos con deleteMany en PurgeTx (todo menos `business`, que usa delete). */
const DELETE_MANY_MODELS = [
  'packageSession', 'bookingStatusHistory', 'saleLine', 'invoiceLine', 'pedidoLine',
  'employeeSchedule', 'openingHour', 'holiday', 'teamMember',
  'booking', 'customerPackage', 'visit', 'customerNote', 'reminder', 'contacto',
  'fichaje', 'workdayEvent', 'timeOffRequest', 'document', 'invoice', 'sale', 'pedido',
  'telegramMessage', 'notification', 'campaign', 'product',
  'package', 'service', 'resource', 'tag', 'team', 'customer', 'employee',
  'visitState', 'location', 'membership', 'oAuthCredential', 'tenantApiKey',
  'tenantSecret', 'tenantStateEvent', 'businessSetting',
] as const;

/**
 * Doble en memoria: registra CADA borrado en `deleteCalls` (en orden) y cuenta
 * las transacciones abiertas. Los conteos devueltos son fake (2 por tabla).
 */
function fakePurgeDb(opts: { businessExists?: boolean } = {}) {
  const deleteCalls: string[] = [];
  let transactions = 0;

  const tx = {} as Record<string, unknown>;
  for (const model of DELETE_MANY_MODELS) {
    tx[model] = {
      deleteMany: async () => {
        deleteCalls.push(model);
        return { count: 2 };
      },
    };
  }
  tx.business = {
    delete: async ({ where }: { where: { id: string } }) => {
      assert.equal(where.id, BIZ_ID, 'el delete final debe apuntar al negocio objetivo');
      deleteCalls.push('business');
      return {};
    },
  };

  const db: PurgeDb = {
    business: {
      findFirst: async ({ where }) =>
        opts.businessExists !== false && where.id === BIZ_ID ? { id: BIZ_ID, nombre: BIZ_NAME } : null,
    },
    $transaction: (fn) => {
      transactions += 1;
      return fn(tx as unknown as PurgeTx);
    },
  };

  return { db, deleteCalls, transactions: () => transactions };
}

async function purge(db: PurgeDb, body: unknown, id = BIZ_ID) {
  const res = mockRes();
  await purgeBusinessHandler(db, mockReq({ params: { id }, body }), res);
  return res;
}

function errorCode(res: { body?: unknown }): string {
  return (res.body as { error: { code: string } }).error.code;
}

describe('POST /businesses/:id/purge — doble confirmación obligatoria', () => {
  test('sin confirm → 400 purge_confirmation_required y CERO borrados', async () => {
    const { db, deleteCalls, transactions } = fakePurgeDb();
    const res = await purge(db, { echo: BIZ_ID });

    assert.equal(res.statusCode, 400);
    assert.equal(errorCode(res), 'purge_confirmation_required');
    assert.deepEqual(deleteCalls, [], 'no debe borrarse nada');
    assert.equal(transactions(), 0, 'no debe abrirse transacción');
  });

  test('sin echo → 400 purge_confirmation_required y CERO borrados', async () => {
    const { db, deleteCalls } = fakePurgeDb();
    const res = await purge(db, { confirm: true });

    assert.equal(res.statusCode, 400);
    assert.equal(errorCode(res), 'purge_confirmation_required');
    assert.deepEqual(deleteCalls, []);
  });

  test('confirm no estrictamente true (string "true") → 400 y CERO borrados', async () => {
    const { db, deleteCalls } = fakePurgeDb();
    const res = await purge(db, { confirm: 'true', echo: BIZ_ID });

    assert.equal(res.statusCode, 400);
    assert.equal(errorCode(res), 'purge_confirmation_required');
    assert.deepEqual(deleteCalls, []);
  });

  test('echo que NO coincide con id ni nombre → 400 purge_confirmation_mismatch y CERO borrados', async () => {
    const { db, deleteCalls } = fakePurgeDb();
    const res = await purge(db, { confirm: true, echo: 'otro-negocio' });

    assert.equal(res.statusCode, 400);
    assert.equal(errorCode(res), 'purge_confirmation_mismatch');
    assert.deepEqual(deleteCalls, []);
  });

  test('nombre con distinta capitalización NO vale (match exacto) → 400 mismatch', async () => {
    const { db, deleteCalls } = fakePurgeDb();
    const res = await purge(db, { confirm: true, echo: BIZ_NAME.toLowerCase() });

    assert.equal(res.statusCode, 400);
    assert.equal(errorCode(res), 'purge_confirmation_mismatch');
    assert.deepEqual(deleteCalls, []);
  });

  test('negocio inexistente → 404 business_not_found y CERO borrados', async () => {
    const { db, deleteCalls } = fakePurgeDb({ businessExists: false });
    const res = await purge(db, { confirm: true, echo: 'biz-ghost' }, 'biz-ghost');

    assert.equal(res.statusCode, 404);
    assert.equal(errorCode(res), 'business_not_found');
    assert.deepEqual(deleteCalls, []);
  });
});

describe('POST /businesses/:id/purge — doble confirmación completa ejecuta el borrado', () => {
  test('confirm:true + echo=id → 200 con conteos; borra TODAS las tablas y el negocio el ÚLTIMO', async () => {
    const { db, deleteCalls, transactions } = fakePurgeDb();
    const res = await purge(db, { confirm: true, echo: BIZ_ID });

    assert.equal(res.statusCode, 200);
    assert.equal(transactions(), 1, 'un único $transaction');
    // Todas las tablas + la fila de negocio.
    assert.equal(deleteCalls.length, DELETE_MANY_MODELS.length + 1);
    assert.equal(deleteCalls.at(-1), 'business', 'el negocio debe borrarse en último lugar');
    for (const model of DELETE_MANY_MODELS) {
      assert.ok(deleteCalls.includes(model), `falta el borrado de ${model}`);
    }
    // Resumen: conteos por tabla + total (40 tablas * 2 filas fake + fila negocio).
    const body = res.body as { id: string; nombre: string; deleted: Record<string, number>; totalRows: number };
    assert.equal(body.id, BIZ_ID);
    assert.equal(body.nombre, BIZ_NAME);
    assert.equal(Object.keys(body.deleted).length, DELETE_MANY_MODELS.length);
    assert.equal(body.totalRows, DELETE_MANY_MODELS.length * 2 + 1);
  });

  test('orden hijos→padres: los FKs RESTRICT reales nunca fallarían', async () => {
    const { db, deleteCalls } = fakePurgeDb();
    await purge(db, { confirm: true, echo: BIZ_ID });

    const pos = (m: string) => deleteCalls.indexOf(m);
    // reserva.sucursal_id / reserva.servicio_id → ON DELETE RESTRICT
    assert.ok(pos('booking') < pos('location'), 'booking debe borrarse antes que location');
    assert.ok(pos('booking') < pos('service'), 'booking debe borrarse antes que service');
    // paquete_cliente.paquete_id → ON DELETE RESTRICT
    assert.ok(pos('customerPackage') < pos('package'), 'customerPackage antes que package');
    // Nietos antes que sus padres directos.
    assert.ok(pos('saleLine') < pos('sale'));
    assert.ok(pos('invoiceLine') < pos('invoice'));
    assert.ok(pos('pedidoLine') < pos('pedido'));
    assert.ok(pos('packageSession') < pos('customerPackage'));
    assert.ok(pos('bookingStatusHistory') < pos('booking'));
    assert.ok(pos('employeeSchedule') < pos('employee'));
    assert.ok(pos('openingHour') < pos('location'));
    assert.ok(pos('holiday') < pos('location'));
    assert.ok(pos('teamMember') < pos('team'));
  });

  test('confirm:true + echo=nombre exacto también vale → 200', async () => {
    const { db, deleteCalls } = fakePurgeDb();
    const res = await purge(db, { confirm: true, echo: BIZ_NAME });

    assert.equal(res.statusCode, 200);
    assert.equal(deleteCalls.at(-1), 'business');
  });
});

describe('Separación lifecycle ↔ purge — ningún cambio de estado puede borrar', () => {
  test('el router de purga SOLO registra POST /businesses/:id/purge (sin PUT, sin lifecycle)', () => {
    const { db } = fakePurgeDb();
    const router = buildPurgeOperatorRouter(db);
    const routes = (router.stack as Array<{ route?: { path: string; methods: Record<string, boolean> } }>)
      .filter((l) => l.route)
      .map((l) => ({ path: l.route!.path, methods: Object.keys(l.route!.methods) }));

    assert.deepEqual(routes, [{ path: '/businesses/:id/purge', methods: ['post'] }]);
  });

  test('el router de lifecycle NO expone ninguna ruta de purga', () => {
    const db = lifecycleDbWithDeleteTraps().db;
    const router = buildLifecycleOperatorRouter(db);
    const paths = (router.stack as Array<{ route?: { path: string } }>)
      .filter((l) => l.route)
      .map((l) => l.route!.path);

    assert.ok(paths.length > 0);
    for (const path of paths) {
      assert.ok(!path.includes('purge'), `el router de lifecycle no debe registrar rutas de purga (${path})`);
    }
  });

  test('PUT lifecycle → TERMINATED con trampas de borrado armadas: 200 y NINGÚN delete invocado', async () => {
    // Doble de lifecycle cuyo objeto de BD lleva ADEMÁS métodos delete/deleteMany
    // que lanzan si alguien los toca: si resolveTransition o el handler llamaran
    // a cualquier borrado, el test explota. TERMINATED debe conservar los datos.
    const { db, deleteAttempts } = lifecycleDbWithDeleteTraps();

    for (const state of ['TERMINATED', 'SUSPENDED', 'ACTIVE'] as const) {
      const res = mockRes();
      await putLifecycleHandler(
        db,
        mockReq({ params: { id: BIZ_ID }, body: { state, reason: 'test separación' } }),
        res,
        { now: new Date('2026-07-10T12:00:00.000Z'), invalidateState: () => {} },
      );
      assert.equal(res.statusCode, 200, `fijar ${state} debe ser 200`);
    }
    assert.deepEqual(deleteAttempts, [], 'ningún camino de lifecycle debe invocar un borrado');
  });
});

/**
 * Doble de LifecycleOperatorDb + trampas: además de lo que la interfaz declara
 * (que NO incluye borrados — invariante estructural), el objeto runtime lleva
 * delete/deleteMany en todos los niveles, registrando y lanzando si se invocan.
 */
function lifecycleDbWithDeleteTraps() {
  const deleteAttempts: string[] = [];
  const trap = (name: string) => () => {
    deleteAttempts.push(name);
    throw new Error(`INVARIANTE ROTA: lifecycle intentó borrar via ${name}`);
  };

  let lifecycle: TenantLifecycle = TenantLifecycle.ACTIVE;

  const db = {
    business: {
      findFirst: async ({ where }: { where: { id: string } }) =>
        where.id === BIZ_ID ? { id: BIZ_ID, lifecycle } : null,
      delete: trap('business.delete'),
      deleteMany: trap('business.deleteMany'),
    },
    tenantStateEvent: {
      findMany: async () => [],
      delete: trap('tenantStateEvent.delete'),
      deleteMany: trap('tenantStateEvent.deleteMany'),
    },
    $transaction: <T>(fn: (tx: never) => Promise<T>) =>
      fn({
        business: {
          update: async ({ data }: { data: { lifecycle: TenantLifecycle } }) => {
            lifecycle = data.lifecycle;
            return { id: BIZ_ID, lifecycle, graceUntil: null, suspendedAt: null };
          },
          delete: trap('tx.business.delete'),
          deleteMany: trap('tx.business.deleteMany'),
        },
        tenantStateEvent: {
          create: async () => ({ id: 'evt-1' }),
          delete: trap('tx.tenantStateEvent.delete'),
          deleteMany: trap('tx.tenantStateEvent.deleteMany'),
        },
      } as never),
  } as unknown as LifecycleOperatorDb;

  return { db, deleteAttempts };
}
