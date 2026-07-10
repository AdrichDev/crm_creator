// Unit tests del kill switch en el carril PÚBLICO (crm-tenant-lifecycle-gate, WU2.5).
// Runner: node --import tsx --test
//
// El carril /api/public es NO autenticado: el negocio viaja en el propio payload
// (`businessId` en body para POST leads/bookings, en query para GET availability).
// Se prueba en dos capas, sin BD real (patrón DI del repo, ver login-gate.test.ts):
//   1. WIRING: publicRouter monta `publicTenantResolver` + gate ANTES de los sub-routers.
//   2. COMPORTAMIENTO: resolver real → tenantGate real con BD doble, con las formas de
//      request reales del carril. businessIds únicos por test (cache del resolver global)
//      y con forma de cuid (el resolver descarta valores malformados a propósito).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Response, NextFunction } from 'express';
import { TenantLifecycle } from '../../../lib/generated/prisma/client.js';
import type { TenantStateDb } from '../../../lib/tenant-lifecycle/resolver.js';
import { tenantGate, GRACE_UNTIL_HEADER } from '../../../middleware/tenant-gate.js';
import type { AuthedRequest } from '../../../middleware/types.js';
import { publicRouter, publicTenantResolver } from '../index.js';

const FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000);

function mockRes() {
  const headers: Record<string, string> = {};
  const res = { statusCode: 200, headers } as unknown as Response & {
    statusCode: number;
    body?: unknown;
    headers: Record<string, string>;
    status(code: number): typeof res;
    json(body: unknown): typeof res;
    setHeader(name: string, value: string): typeof res;
  };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (body: unknown) => { res.body = body; return res; };
  res.setHeader = (name: string, value: string) => { headers[name] = value; return res; };
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

/** Request pública mínima: body (POST leads/bookings) o query (GET availability). */
function publicReq(shape: { body?: unknown; query?: Record<string, unknown> }): AuthedRequest {
  return { body: shape.body ?? {}, query: shape.query ?? {} } as unknown as AuthedRequest;
}

/** Ejecuta la MISMA secuencia que monta publicRouter: resolver → tenantGate(db). */
async function runLane(db: TenantStateDb, req: AuthedRequest) {
  const res = mockRes();
  let reachedHandler = false;
  let resolverPassed = false;
  publicTenantResolver(req, res, (() => { resolverPassed = true; }) as NextFunction);
  assert.ok(resolverPassed, 'el resolver siempre llama next()');
  await tenantGate({ db })(req, res, (() => { reachedHandler = true; }) as NextFunction);
  return { res, reachedHandler };
}

describe('carril público — wiring de publicRouter (WU2.5)', () => {
  test('publicTenantResolver está montado ANTES de los sub-routers de endpoints', () => {
    const stack = (publicRouter as unknown as {
      stack: Array<{ handle: { name?: string } }>;
    }).stack;
    const idxResolver = stack.findIndex((l) => l.handle === (publicTenantResolver as unknown));
    const idxFirstSubrouter = stack.findIndex((l) => l.handle.name === 'router');
    assert.ok(idxResolver >= 0, 'publicTenantResolver debe estar montado en publicRouter');
    assert.ok(idxFirstSubrouter > idxResolver, 'el resolver debe ir antes de los sub-routers');
    // El gate (middleware async anónimo) va justo después del resolver.
    const gateLayer = stack[idxResolver + 1];
    assert.ok(gateLayer, 'debe existir un middleware inmediatamente después del resolver');
    assert.notEqual(gateLayer.handle.name, 'router', 'el gate va entre el resolver y los sub-routers');
  });
});

describe('carril público — resolución de businessId por forma real de request', () => {
  test('POST body (bookings/leads): businessId del body se fija en req.tenantBusinessId', async () => {
    const req = publicReq({ body: { businessId: 'cpubbodyresolve0001' } });
    await runLane(dbWith({ lifecycle: TenantLifecycle.ACTIVE }), req);
    assert.equal(req.tenantBusinessId, 'cpubbodyresolve0001');
  });

  test('GET query (availability): businessId de la query se fija en req.tenantBusinessId', async () => {
    const req = publicReq({ query: { businessId: 'cpubqueryresolve001' } });
    await runLane(dbWith({ lifecycle: TenantLifecycle.ACTIVE }), req);
    assert.equal(req.tenantBusinessId, 'cpubqueryresolve001');
  });

  test('businessId malformado (no cuid) NO se fija → gate no-op y el handler valida (422 actual)', async () => {
    const req = publicReq({ body: { businessId: 'not-a-cuid' } });
    const { reachedHandler } = await runLane(dbWith({ lifecycle: TenantLifecycle.SUSPENDED }), req);
    assert.equal(req.tenantBusinessId, undefined, 'valor malformado no debe fijarse');
    assert.ok(reachedHandler, 'la petición sigue al handler (contrato 422 intacto)');
  });

  test('sin businessId en la petición → gate no-op (nunca 500)', async () => {
    const { res, reachedHandler } = await runLane(
      dbWith({ lifecycle: TenantLifecycle.SUSPENDED }),
      publicReq({}),
    );
    assert.ok(reachedHandler);
    assert.equal(res.statusCode, 200);
  });
});

describe('carril público — decisión del gate por estado del negocio', () => {
  test('ACTIVE → la reserva pública procede (llega al handler, sin cambio de contrato)', async () => {
    const { res, reachedHandler } = await runLane(
      dbWith({ lifecycle: TenantLifecycle.ACTIVE }),
      publicReq({ body: { businessId: 'cpubgateactive00001' } }),
    );
    assert.ok(reachedHandler, 'ACTIVE debe llegar al handler');
    assert.equal(res.statusCode, 200);
  });

  test('GRACE vigente → procede + header x-tenant-grace-until', async () => {
    const { res, reachedHandler } = await runLane(
      dbWith({ lifecycle: TenantLifecycle.GRACE, graceUntil: FUTURE }),
      publicReq({ body: { businessId: 'cpubgategrace000001' } }),
    );
    assert.ok(reachedHandler);
    assert.equal(res.headers[GRACE_UNTIL_HEADER], FUTURE.toISOString());
  });

  test('SUSPENDED → 423 tenant_suspended (la reserva NO llega al handler)', async () => {
    const { res, reachedHandler } = await runLane(
      dbWith({ lifecycle: TenantLifecycle.SUSPENDED }),
      publicReq({ body: { businessId: 'cpubgatesuspend0001' } }),
    );
    assert.ok(!reachedHandler, 'SUSPENDED no debe llegar al handler');
    assert.equal(res.statusCode, 423);
    assert.equal((res.body as { error: { code: string } }).error.code, 'tenant_suspended');
  });

  test('TERMINATED → 410 tenant_terminated', async () => {
    const { res, reachedHandler } = await runLane(
      dbWith({ lifecycle: TenantLifecycle.TERMINATED }),
      publicReq({ query: { businessId: 'cpubgateterminated1' } }),
    );
    assert.ok(!reachedHandler);
    assert.equal(res.statusCode, 410);
    assert.equal((res.body as { error: { code: string } }).error.code, 'tenant_terminated');
  });
});
