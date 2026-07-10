// Unit tests del middleware tenantGate (crm-tenant-lifecycle-gate, WU2).
// Runner: node --import tsx --test
//
// Estrategia (patrón del repo, ver tenant-api-key.middleware.test.ts): la BD se inyecta como
// doble (DI), así que se ejercita la lógica REAL del gate + resolver sin BD ni migración
// aplicada. Cada test usa un businessId ÚNICO porque el cache del resolver es global al módulo.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Response, NextFunction } from 'express';
import { TenantLifecycle } from '../../lib/generated/prisma/client.js';
import type { TenantStateDb } from '../../lib/tenant-lifecycle/resolver.js';
import { tenantGate, GRACE_UNTIL_HEADER } from '../tenant-gate.js';
import type { AuthedRequest } from '../types.js';

const FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000); // gracia vigente (mañana)
const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000); // gracia expirada (ayer)

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

function mockReq(ids: { tenantBusinessId?: string; businessId?: string } = {}): AuthedRequest {
  return { headers: {}, ...ids } as unknown as AuthedRequest;
}

/** Doble de BD que siempre devuelve la misma fila de negocio. */
function dbWith(row: { lifecycle: TenantLifecycle; graceUntil?: Date | null } | null): TenantStateDb {
  return {
    business: {
      findUnique: async () =>
        row == null
          ? null
          : { lifecycle: row.lifecycle, graceUntil: row.graceUntil ?? null, suspendedAt: null },
    },
  };
}

async function run(db: TenantStateDb, req: AuthedRequest) {
  const res = mockRes();
  let nextCalled = false;
  const next: NextFunction = () => { nextCalled = true; };
  await tenantGate({ db })(req, res, next);
  return { res, nextCalled };
}

describe('tenantGate — decisión por estado efectivo', () => {
  test('ACTIVE → next()', async () => {
    const { res, nextCalled } = await run(
      dbWith({ lifecycle: TenantLifecycle.ACTIVE }),
      mockReq({ tenantBusinessId: 'gate-active' }),
    );
    assert.ok(nextCalled, 'next debe llamarse');
    assert.equal(res.statusCode, 200);
  });

  test('GRACE vigente → next() + header x-tenant-grace-until', async () => {
    const { res, nextCalled } = await run(
      dbWith({ lifecycle: TenantLifecycle.GRACE, graceUntil: FUTURE }),
      mockReq({ tenantBusinessId: 'gate-grace' }),
    );
    assert.ok(nextCalled, 'next debe llamarse');
    assert.equal(res.headers[GRACE_UNTIL_HEADER], FUTURE.toISOString());
  });

  test('GRACE expirado → 423 tenant_suspended (perezoso, sin escribir BD)', async () => {
    const { res, nextCalled } = await run(
      dbWith({ lifecycle: TenantLifecycle.GRACE, graceUntil: PAST }),
      mockReq({ tenantBusinessId: 'gate-grace-expired' }),
    );
    assert.ok(!nextCalled, 'next NO debe llamarse');
    assert.equal(res.statusCode, 423);
    assert.equal((res.body as { error: { code: string } }).error.code, 'tenant_suspended');
    assert.equal(res.headers[GRACE_UNTIL_HEADER], undefined, 'sin header de gracia al cortar');
  });

  test('SUSPENDED → 423 tenant_suspended', async () => {
    const { res, nextCalled } = await run(
      dbWith({ lifecycle: TenantLifecycle.SUSPENDED }),
      mockReq({ tenantBusinessId: 'gate-suspended' }),
    );
    assert.ok(!nextCalled);
    assert.equal(res.statusCode, 423);
    assert.equal((res.body as { error: { code: string } }).error.code, 'tenant_suspended');
  });

  test('TERMINATED → 410 tenant_terminated', async () => {
    const { res, nextCalled } = await run(
      dbWith({ lifecycle: TenantLifecycle.TERMINATED }),
      mockReq({ tenantBusinessId: 'gate-terminated' }),
    );
    assert.ok(!nextCalled);
    assert.equal(res.statusCode, 410);
    assert.equal((res.body as { error: { code: string } }).error.code, 'tenant_terminated');
  });

  test('sin businessId en req → next() (gate no-op, nunca 500)', async () => {
    const db: TenantStateDb = {
      business: { findUnique: async () => { throw new Error('no debería llamarse'); } },
    };
    const { res, nextCalled } = await run(db, mockReq());
    assert.ok(nextCalled, 'next debe llamarse sin identidad resuelta');
    assert.equal(res.statusCode, 200);
  });

  test('req.businessId de sesión (carril panel) también gatea', async () => {
    const { res, nextCalled } = await run(
      dbWith({ lifecycle: TenantLifecycle.SUSPENDED }),
      mockReq({ businessId: 'gate-session-lane' }),
    );
    assert.ok(!nextCalled);
    assert.equal(res.statusCode, 423);
  });

  test('error de BD → 500 server_error (no abre el servicio)', async () => {
    const db: TenantStateDb = {
      business: { findUnique: async () => { throw new Error('boom BD'); } },
    };
    const { res, nextCalled } = await run(db, mockReq({ tenantBusinessId: 'gate-db-error' }));
    assert.ok(!nextCalled);
    assert.equal(res.statusCode, 500);
    assert.equal((res.body as { error: { code: string } }).error.code, 'server_error');
  });
});
