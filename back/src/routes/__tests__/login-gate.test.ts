// Unit tests del login gate (crm-tenant-lifecycle-gate, WU3.1).
// Runner: node --import tsx --test
//
// El login de credenciales vive en el SDK de Supabase (POST /auth/login es un stub 410),
// así que el punto server-authoritative del "login" es GET /auth/me (bootstrap de sesión).
// Se prueba en dos capas, sin BD real (patrón DI del repo, ver tenant-gate.test.ts):
//   1. WIRING: el route /me de authRouter monta `authenticate` → `loginTenantGate` → handler
//      (el gate corre DESPUÉS de identificar el negocio y ANTES de servir la sesión).
//   2. COMPORTAMIENTO: la misma secuencia (identificar negocio → tenantGate real con BD
//      doble → emitir sesión) corta con 423/410 SIN emitir sesión para negocios no
//      ACTIVE/GRACE. businessIds únicos por test: el cache del resolver es global módulo.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Response, NextFunction } from 'express';
import { TenantLifecycle } from '../../lib/generated/prisma/client.js';
import type { TenantStateDb } from '../../lib/tenant-lifecycle/resolver.js';
import { tenantGate } from '../../middleware/tenant-gate.js';
import { authenticate } from '../../middleware/auth.js';
import { authRouter, loginTenantGate } from '../auth.js';
import type { AuthedRequest } from '../../middleware/types.js';

const FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000);
const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000);

function mockRes() {
  const res = { statusCode: 200 } as unknown as Response & {
    statusCode: number;
    body?: unknown;
    status(code: number): typeof res;
    json(body: unknown): typeof res;
    setHeader(name: string, value: string): typeof res;
  };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (body: unknown) => { res.body = body; return res; };
  res.setHeader = () => res;
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

/**
 * Simula el flujo de login del panel con el MISMO orden que el wiring real de /auth/me:
 * credenciales OK → identidad del negocio resuelta (como haría `authenticate`) →
 * tenantGate REAL → solo si pasa, se "emite" la sesión (payload de /me).
 */
async function attemptLogin(db: TenantStateDb, businessId: string) {
  const req = { headers: {} } as unknown as AuthedRequest;
  // Doble de authenticate: credenciales válidas → fija la identidad, como el middleware real.
  req.userId = 'user-1';
  req.businessId = businessId;

  const res = mockRes();
  let session: { userId: string } | null = null;
  const next: NextFunction = () => {
    // Solo se llega aquí si el gate dejó pasar: la "sesión" (payload de /me) se emite.
    session = { userId: req.userId! };
    res.json(session);
  };
  await tenantGate({ db })(req, res, next);
  return { res, session: session as { userId: string } | null };
}

describe('login gate — wiring real de GET /auth/me (WU3.1)', () => {
  test('/me monta authenticate → loginTenantGate → handler (gate tras identificar negocio, antes de la sesión)', () => {
    const stack = (authRouter as unknown as { stack: Array<{ route?: { path: string; stack: Array<{ handle: unknown }> } }> }).stack;
    const meLayer = stack.find((l) => l.route?.path === '/me');
    assert.ok(meLayer?.route, 'debe existir el route GET /me en authRouter');

    const handlers = meLayer.route.stack.map((l) => l.handle);
    const idxAuth = handlers.indexOf(authenticate);
    const idxGate = handlers.indexOf(loginTenantGate);
    assert.ok(idxAuth >= 0, 'authenticate debe estar montado en /me');
    assert.ok(idxGate >= 0, 'loginTenantGate debe estar montado en /me');
    assert.ok(idxAuth < idxGate, 'el gate debe ir DESPUÉS de authenticate (negocio ya identificado)');
    assert.ok(idxGate < handlers.length - 1, 'el gate debe ir ANTES del handler que sirve la sesión');
  });
});

describe('login gate — comportamiento (423/410 sin sesión)', () => {
  test('negocio SUSPENDED → 423 tenant_suspended y NO se emite sesión ("no entrar a mirar")', async () => {
    const { res, session } = await attemptLogin(
      dbWith({ lifecycle: TenantLifecycle.SUSPENDED }),
      'login-suspended',
    );
    assert.equal(res.statusCode, 423);
    assert.equal((res.body as { error: { code: string } }).error.code, 'tenant_suspended');
    assert.equal(session, null, 'no debe emitirse sesión');
  });

  test('GRACE expirada → 423 sin sesión (perezoso, sin escribir BD)', async () => {
    const { res, session } = await attemptLogin(
      dbWith({ lifecycle: TenantLifecycle.GRACE, graceUntil: PAST }),
      'login-grace-expired',
    );
    assert.equal(res.statusCode, 423);
    assert.equal(session, null);
  });

  test('negocio TERMINATED → 410 tenant_terminated sin sesión', async () => {
    const { res, session } = await attemptLogin(
      dbWith({ lifecycle: TenantLifecycle.TERMINATED }),
      'login-terminated',
    );
    assert.equal(res.statusCode, 410);
    assert.equal((res.body as { error: { code: string } }).error.code, 'tenant_terminated');
    assert.equal(session, null);
  });

  test('negocio ACTIVE → login procede y se emite sesión', async () => {
    const { res, session } = await attemptLogin(
      dbWith({ lifecycle: TenantLifecycle.ACTIVE }),
      'login-active',
    );
    assert.equal(res.statusCode, 200);
    assert.deepEqual(session, { userId: 'user-1' });
  });

  test('GRACE vigente → login procede (con sesión)', async () => {
    const { session } = await attemptLogin(
      dbWith({ lifecycle: TenantLifecycle.GRACE, graceUntil: FUTURE }),
      'login-grace-ok',
    );
    assert.deepEqual(session, { userId: 'user-1' });
  });
});
