// Unit tests del middleware resolveTenantApiKey (crm-tenant-api-keys).
// Runner: node --import tsx --test
//
// Estrategia (patrón del repo, ver routes/__tests__/service-operator.test.ts): la BD se
// inyecta como doble (DI), así que se ejercita la lógica REAL del middleware sin BD.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Response, NextFunction } from 'express';
import {
  resolveTenantApiKey,
  hashApiKeyToken,
  generateApiKeyToken,
  type TenantApiKeyDb,
} from '../tenant-api-key.js';
import type { AuthedRequest } from '../types.js';

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

function mockReq(bearer?: string): AuthedRequest {
  return { headers: bearer ? { authorization: `Bearer ${bearer}` } : {} } as unknown as AuthedRequest;
}

describe('hashApiKeyToken / generateApiKeyToken', () => {
  test('mismo token → mismo hash (determinista)', () => {
    const { token, tokenHash } = generateApiKeyToken();
    assert.equal(hashApiKeyToken(token), tokenHash);
  });

  test('tokens generados son distintos entre sí', () => {
    const a = generateApiKeyToken();
    const b = generateApiKeyToken();
    assert.notEqual(a.token, b.token);
    assert.notEqual(a.tokenHash, b.tokenHash);
  });

  test('prefix tiene 8 chars visibles', () => {
    const { prefix } = generateApiKeyToken();
    assert.equal(prefix.length, 8);
  });
});

describe('resolveTenantApiKey', () => {
  test('clave activa → next() y req.tenantBusinessId resuelto + lastUsedAt actualizado', async () => {
    const { token, tokenHash } = generateApiKeyToken();
    let updateArgs: unknown;
    const db: TenantApiKeyDb = {
      tenantApiKey: {
        findUnique: async (args) => {
          assert.equal(args.where.tokenHash, tokenHash);
          return { id: 'key-1', businessId: 'biz-1', revokedAt: null };
        },
        update: async (args) => { updateArgs = args; return {}; },
      },
    };
    const req = mockReq(token);
    const res = mockRes();
    let nextCalled = false;
    const next: NextFunction = () => { nextCalled = true; };

    await resolveTenantApiKey(db)(req, res, next);
    // Espera a que la actualización best-effort (fire-and-forget) se resuelva.
    await new Promise((r) => setTimeout(r, 0));

    assert.ok(nextCalled, 'next debe llamarse');
    assert.equal(req.tenantBusinessId, 'biz-1');
    assert.equal((updateArgs as { where: { id: string } }).where.id, 'key-1');
  });

  test('sin header Authorization → 401 invalid_api_key', async () => {
    const db: TenantApiKeyDb = {
      tenantApiKey: { findUnique: async () => { throw new Error('no debería llamarse'); }, update: async () => ({}) },
    };
    const res = mockRes();
    let nextCalled = false;
    await resolveTenantApiKey(db)(mockReq(), res, () => { nextCalled = true; });
    assert.equal(res.statusCode, 401);
    assert.equal((res.body as { error: { code: string } }).error.code, 'invalid_api_key');
    assert.ok(!nextCalled);
  });

  test('token desconocido → 401 invalid_api_key', async () => {
    const db: TenantApiKeyDb = {
      tenantApiKey: { findUnique: async () => null, update: async () => ({}) },
    };
    const res = mockRes();
    let nextCalled = false;
    await resolveTenantApiKey(db)(mockReq('tk_desconocido'), res, () => { nextCalled = true; });
    assert.equal(res.statusCode, 401);
    assert.equal((res.body as { error: { code: string } }).error.code, 'invalid_api_key');
    assert.ok(!nextCalled);
  });

  test('clave revocada → 401 invalid_api_key', async () => {
    const { token } = generateApiKeyToken();
    const db: TenantApiKeyDb = {
      tenantApiKey: {
        findUnique: async () => ({ id: 'key-2', businessId: 'biz-2', revokedAt: new Date() }),
        update: async () => ({}),
      },
    };
    const res = mockRes();
    let nextCalled = false;
    await resolveTenantApiKey(db)(mockReq(token), res, () => { nextCalled = true; });
    assert.equal(res.statusCode, 401);
    assert.equal((res.body as { error: { code: string } }).error.code, 'invalid_api_key');
    assert.ok(!nextCalled);
  });

  test('500 si la BD falla, sin filtrar detalles', async () => {
    const db: TenantApiKeyDb = {
      tenantApiKey: { findUnique: async () => { throw new Error('db down'); }, update: async () => ({}) },
    };
    const res = mockRes();
    await resolveTenantApiKey(db)(mockReq('tk_algo'), res, () => {});
    assert.equal(res.statusCode, 500);
    assert.equal((res.body as { error: { code: string } }).error.code, 'server_error');
  });
});
