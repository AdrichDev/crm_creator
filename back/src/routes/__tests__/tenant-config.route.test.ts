// Unit tests de GET /tenant-config (crm-tenant-api-keys / crm-tenant-secrets-runtime-maps).
// Runner: node --import tsx --test
//
// Estrategia (patrón del repo, ver service-operator.test.ts): se ejercita el handler
// REAL. El caso central (AC3/AC4 — un BACKEND_SECRET del mismo negocio NUNCA aparece
// en el body) se comprueba de extremo a extremo con store.ts REAL (readPublicSecrets/
// readBakeableSecrets) y crypto.ts REAL, inyectando solo la BD (patrón DI del repo) — así
// el filtro de scope se ejercita de verdad, no se asume. El auth dual (WU1) se testea por
// separado sobre `resolveTenantConfigAuth`, con dobles inyectados tanto para TenantApiKey
// como para el fallback de sesión (`authenticate` real depende de red/JWKS — se inyecta un
// doble equivalente, patrón DI ya usado en el resto del repo).

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type { Response } from 'express';
import { tenantConfigHandler, resolveTenantConfigAuth, type TenantConfigDeps } from '../tenant-config.js';
import { hashApiKeyToken, type TenantApiKeyDb } from '../../middleware/tenant-api-key.js';
import { readPublicSecrets, readBakeableSecrets, type TenantSecretDb, type SecretRow } from '../../lib/tenant-secrets/store.js';
import { encryptSecret } from '../../lib/tenant-secrets/crypto.js';
import type { AuthedRequest } from '../../middleware/types.js';

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

function mockReq(tenantBusinessId?: string): AuthedRequest {
  return { tenantBusinessId } as unknown as AuthedRequest;
}

function mockAuthReq(authorization?: string): AuthedRequest {
  return { headers: authorization ? { authorization } : {} } as unknown as AuthedRequest;
}

const NO_OP_BAKEABLE = { readBakeableSecrets: async () => [] };

beforeEach(() => {
  process.env.SECRETS_MASTER_KEY = randomBytes(32).toString('hex');
});

describe('resolveTenantConfigAuth — auth dual (WU1)', () => {
  test('1.4 regresión: TenantApiKey válida resuelve tenantBusinessId sin llamar al fallback de sesión', async () => {
    const apiKeyDb: TenantApiKeyDb = {
      tenantApiKey: {
        findUnique: async (args) => {
          assert.equal(args.where.tokenHash, hashApiKeyToken('tk_valido'));
          return { id: 'key-1', businessId: 'biz-tenant-api', revokedAt: null };
        },
        update: async () => ({}),
      },
    };
    let sessionCalled = false;
    const sessionFallback = async () => { sessionCalled = true; };

    const req = mockAuthReq('Bearer tk_valido');
    const res = mockRes();
    let nextCalled = false;
    await resolveTenantConfigAuth(apiKeyDb, sessionFallback)(req, res, () => { nextCalled = true; });

    assert.equal(req.tenantBusinessId, 'biz-tenant-api');
    assert.ok(nextCalled, 'next debe llamarse');
    assert.equal(sessionCalled, false, 'no debe probarse el fallback de sesión si la TenantApiKey resolvió');
  });

  test('1.3 fallback: sin TenantApiKey válida, cae a sesión Supabase + x-business-id', async () => {
    const apiKeyDb: TenantApiKeyDb = {
      tenantApiKey: {
        findUnique: async () => null, // ninguna fila coincide (Bearer de sesión, no TenantApiKey)
        update: async () => { throw new Error('no debería llamarse'); },
      },
    };
    // Doble de `authenticate`: simula lo que la resolución real de Membership fijaría
    // (req.businessId) y llama a next() sin argumentos, igual que el middleware real.
    const sessionFallback = async (r: AuthedRequest, _res: Response, next: () => void) => {
      r.businessId = 'biz-session';
      next();
    };

    const req = mockAuthReq('Bearer sb-access-token-de-sesion');
    const res = mockRes();
    let nextCalled = false;
    await resolveTenantConfigAuth(apiKeyDb, sessionFallback)(req, res, () => { nextCalled = true; });

    assert.equal(req.tenantBusinessId, 'biz-session', 'debe fijarse desde req.businessId (Membership)');
    assert.ok(nextCalled, 'next debe llamarse tras resolver por sesión');
  });

  test('1.5 sin TenantApiKey Y sin sesión válida → 401 (respuesta del fallback de sesión, sin next)', async () => {
    const apiKeyDb: TenantApiKeyDb = {
      tenantApiKey: { findUnique: async () => null, update: async () => ({}) },
    };
    // Doble de `authenticate` fallando: replica su 401 real cuando no hay Bearer válido.
    const sessionFallback = async (_req: AuthedRequest, res: Response) => {
      res.status(401).json({ error: { code: 'no_token', message: 'Falta token' } });
    };

    const req = mockAuthReq(undefined);
    const res = mockRes();
    let nextCalled = false;
    await resolveTenantConfigAuth(apiKeyDb, sessionFallback)(req, res, () => { nextCalled = true; });

    assert.equal(res.statusCode, 401);
    assert.ok(!nextCalled, 'next no debe llamarse si ningún camino de auth resolvió');
  });
});

describe('GET /tenant-config — filtro de scope de extremo a extremo (store.ts real)', () => {
  test('negocio con 1 FRONTEND_PUBLIC + 1 BACKEND_SECRET → el body incluye el público y NUNCA el backend', async () => {
    const publicRow: SecretRow = { name: 'mapaPublicKey', scope: 'FRONTEND_PUBLIC', ...encryptSecretRow('pk_live_abc123') };
    const backendRow: SecretRow = { name: 'proveedorApiSecret', scope: 'BACKEND_SECRET', ...encryptSecretRow('sk_live_muy-secreto') };

    const db: TenantSecretDb = {
      tenantSecret: {
        findUnique: async () => { throw new Error('no debería llamarse desde /tenant-config'); },
        // La query REAL filtra por scope en el WHERE — el doble respeta ese contrato:
        // solo devuelve filas cuyo scope pedido coincide (así se ejercita el filtro real).
        findMany: async (args) => {
          assert.equal(args.where.scope, 'FRONTEND_PUBLIC');
          return [publicRow, backendRow].filter((r) => r.scope === args.where.scope);
        },
      },
    };

    const deps: TenantConfigDeps = { readPublicSecrets: (businessId) => readPublicSecrets(businessId, db), ...NO_OP_BAKEABLE };
    const res = mockRes();
    await tenantConfigHandler(deps, mockReq('biz-1'), res);

    const body = res.body as { flags: unknown; publicSecrets: Record<string, string>; publicEnvSecrets: Record<string, string> };
    assert.deepEqual(body.publicSecrets, { mapaPublicKey: 'pk_live_abc123' });
    assert.equal((body.publicSecrets as Record<string, string>).proveedorApiSecret, undefined);
    assert.ok(!JSON.stringify(body).includes('sk_live_muy-secreto'));
  });

  test('negocio A nunca ve secretos de negocio B (WHERE businessId real, no filtro en app)', async () => {
    type Row = SecretRow & { businessId: string };
    const rows: Row[] = [
      { businessId: 'biz-A', name: 'sharedName', scope: 'FRONTEND_PUBLIC', ...encryptSecretRow('valor-A') },
      { businessId: 'biz-B', name: 'sharedName', scope: 'FRONTEND_PUBLIC', ...encryptSecretRow('valor-B') },
    ];
    const db: TenantSecretDb = {
      tenantSecret: {
        findUnique: async () => { throw new Error('no debería llamarse desde /tenant-config'); },
        findMany: async (args) => rows.filter((r) => r.businessId === args.where.businessId && r.scope === args.where.scope),
      },
    };

    const deps: TenantConfigDeps = { readPublicSecrets: (businessId) => readPublicSecrets(businessId, db), ...NO_OP_BAKEABLE };
    const resA = mockRes();
    await tenantConfigHandler(deps, mockReq('biz-A'), resA);
    const bodyA = resA.body as { publicSecrets: Record<string, string> };
    assert.deepEqual(bodyA.publicSecrets, { sharedName: 'valor-A' });
    assert.ok(!JSON.stringify(bodyA).includes('valor-B'));
  });
});

function encryptSecretRow(plain: string): Pick<SecretRow, 'valueCiphertext' | 'iv' | 'authTag' | 'keyVersion'> {
  const enc = encryptSecret(plain);
  return { valueCiphertext: enc.ciphertext, iv: enc.iv, authTag: enc.authTag, keyVersion: enc.keyVersion };
}

// --- Doble combinado (store.ts real, tanto readPublicSecrets como readBakeableSecrets) ---

interface CombinedRow {
  name: string;
  scope: 'FRONTEND_PUBLIC' | 'BACKEND_SECRET';
  envVarName: string | null;
  valueCiphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
}

function combinedRow(overrides: Partial<CombinedRow> & Pick<CombinedRow, 'name' | 'scope'>, plain: string): CombinedRow {
  return { envVarName: null, ...encryptSecretRow(plain), ...overrides };
}

/** Satisface estructuralmente TANTO TenantSecretDb (readPublicSecrets) COMO
 * TenantSecretBakeDb (readBakeableSecrets): ambas queries reales solo difieren en el
 * WHERE (scope, y opcionalmente envVarName: { not: null }), que este doble respeta. */
function makeCombinedDb(rows: CombinedRow[]) {
  return {
    tenantSecret: {
      findUnique: async () => { throw new Error('no debería llamarse desde /tenant-config'); },
      findMany: async (args: { where: { scope: string; envVarName?: { not: null } } }) =>
        rows.filter((r) => r.scope === args.where.scope && (!args.where.envVarName || r.envVarName !== null)),
    },
  };
}

describe('GET /tenant-config — publicEnvSecrets (WU2)', () => {
  test('2.3 FRONTEND_PUBLIC con envVarName aparece en publicEnvSecrets Y en publicSecrets', async () => {
    const row = combinedRow({ name: 'mapaKey', scope: 'FRONTEND_PUBLIC', envVarName: 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY' }, 'pk_live_xyz');
    const db = makeCombinedDb([row]);
    const deps: TenantConfigDeps = {
      readPublicSecrets: (businessId) => readPublicSecrets(businessId, db),
      readBakeableSecrets: (businessId) => readBakeableSecrets(businessId, db),
    };
    const res = mockRes();
    await tenantConfigHandler(deps, mockReq('biz-1'), res);

    const body = res.body as { publicSecrets: Record<string, string>; publicEnvSecrets: Record<string, string> };
    assert.deepEqual(body.publicEnvSecrets, { NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: 'pk_live_xyz' });
    assert.deepEqual(body.publicSecrets, { mapaKey: 'pk_live_xyz' });
  });

  test('2.4 FRONTEND_PUBLIC sin envVarName aparece en publicSecrets pero NO en publicEnvSecrets', async () => {
    const row = combinedRow({ name: 'otroPublico', scope: 'FRONTEND_PUBLIC' }, 'valor-suelto');
    const db = makeCombinedDb([row]);
    const deps: TenantConfigDeps = {
      readPublicSecrets: (businessId) => readPublicSecrets(businessId, db),
      readBakeableSecrets: (businessId) => readBakeableSecrets(businessId, db),
    };
    const res = mockRes();
    await tenantConfigHandler(deps, mockReq('biz-1'), res);

    const body = res.body as { publicSecrets: Record<string, string>; publicEnvSecrets: Record<string, string> };
    assert.deepEqual(body.publicSecrets, { otroPublico: 'valor-suelto' });
    assert.deepEqual(body.publicEnvSecrets, {});
  });

  test('2.5 fuga cero ampliada: BACKEND_SECRET nunca aparece en publicSecrets ni en publicEnvSecrets', async () => {
    const publicRow = combinedRow({ name: 'mapaKey', scope: 'FRONTEND_PUBLIC', envVarName: 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY' }, 'pk_live_abc');
    const backendRow = combinedRow({ name: 'proveedorSecret', scope: 'BACKEND_SECRET' }, 'sk_live_oculto');
    const db = makeCombinedDb([publicRow, backendRow]);
    const deps: TenantConfigDeps = {
      readPublicSecrets: (businessId) => readPublicSecrets(businessId, db),
      readBakeableSecrets: (businessId) => readBakeableSecrets(businessId, db),
    };
    const res = mockRes();
    await tenantConfigHandler(deps, mockReq('biz-1'), res);

    const body = res.body as { publicSecrets: Record<string, string>; publicEnvSecrets: Record<string, string> };
    assert.ok(!JSON.stringify(body).includes('sk_live_oculto'));
    assert.equal(body.publicSecrets.proveedorSecret, undefined);
    assert.equal(body.publicEnvSecrets.proveedorSecret, undefined);
  });
});

describe('GET /tenant-config — handler', () => {
  test('sin tenantBusinessId (middleware no lo fijó) → 401 invalid_api_key, fail-closed', async () => {
    const deps: TenantConfigDeps = {
      readPublicSecrets: async () => { throw new Error('no debería llamarse'); },
      readBakeableSecrets: async () => { throw new Error('no debería llamarse'); },
    };
    const res = mockRes();
    await tenantConfigHandler(deps, mockReq(undefined), res);
    assert.equal(res.statusCode, 401);
    assert.equal((res.body as { error: { code: string } }).error.code, 'invalid_api_key');
  });

  test('500 si la lectura de secretos falla, sin filtrar detalles', async () => {
    const deps: TenantConfigDeps = {
      readPublicSecrets: async () => { throw new Error('cipher error'); },
      ...NO_OP_BAKEABLE,
    };
    const res = mockRes();
    await tenantConfigHandler(deps, mockReq('biz-1'), res);
    assert.equal(res.statusCode, 500);
    assert.equal((res.body as { error: { code: string } }).error.code, 'server_error');
  });
});
