// Unit tests de GET /tenant-config (crm-tenant-api-keys).
// Runner: node --import tsx --test
//
// Estrategia (patrón del repo, ver service-operator.test.ts): se ejercita el handler
// REAL. El caso central (AC3/AC4 — un BACKEND_SECRET del mismo negocio NUNCA aparece
// en el body) se comprueba de extremo a extremo con store.ts REAL (readPublicSecrets)
// y crypto.ts REAL, inyectando solo la BD (patrón DI del repo) — así el filtro de
// scope se ejercita de verdad, no se asume.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type { Response } from 'express';
import { tenantConfigHandler, type TenantConfigDeps } from '../tenant-config.js';
import { readPublicSecrets, type TenantSecretDb, type SecretRow } from '../../lib/tenant-secrets/store.js';
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

beforeEach(() => {
  process.env.SECRETS_MASTER_KEY = randomBytes(32).toString('hex');
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

    const deps: TenantConfigDeps = { readPublicSecrets: (businessId) => readPublicSecrets(businessId, db) };
    const res = mockRes();
    await tenantConfigHandler(deps, mockReq('biz-1'), res);

    const body = res.body as { flags: unknown; publicSecrets: Record<string, string> };
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

    const deps: TenantConfigDeps = { readPublicSecrets: (businessId) => readPublicSecrets(businessId, db) };
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

describe('GET /tenant-config — handler', () => {
  test('sin tenantBusinessId (middleware no lo fijó) → 401 invalid_api_key, fail-closed', async () => {
    const deps: TenantConfigDeps = {
      readPublicSecrets: async () => { throw new Error('no debería llamarse'); },
    };
    const res = mockRes();
    await tenantConfigHandler(deps, mockReq(undefined), res);
    assert.equal(res.statusCode, 401);
    assert.equal((res.body as { error: { code: string } }).error.code, 'invalid_api_key');
  });

  test('500 si la lectura de secretos falla, sin filtrar detalles', async () => {
    const deps: TenantConfigDeps = {
      readPublicSecrets: async () => { throw new Error('cipher error'); },
    };
    const res = mockRes();
    await tenantConfigHandler(deps, mockReq('biz-1'), res);
    assert.equal(res.statusCode, 500);
    assert.equal((res.body as { error: { code: string } }).error.code, 'server_error');
  });
});
