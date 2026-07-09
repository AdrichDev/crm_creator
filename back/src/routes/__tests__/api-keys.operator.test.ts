// Unit tests de la gestión de operador de TenantApiKey (crm-tenant-api-keys):
// POST/GET /businesses/:id/api-keys, POST .../rotate, POST .../revoke.
// Runner: node --import tsx --test
//
// Mismo patrón DI que service-operator-write-ops.test.ts: BD inyectada como doble.
// El gate de token (requireOperatorToken) ya está cubierto en service-operator.test.ts;
// aquí se ejercitan los handlers directamente.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import {
  issueApiKeyHandler,
  listApiKeysHandler,
  rotateApiKeyHandler,
  revokeApiKeyHandler,
  type TenantKeysOperatorDb,
} from '../service-operator-tenant-keys.js';
import { hashApiKeyToken } from '../../middleware/tenant-api-key.js';

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

const ACTIVE_BUSINESS = 'biz-1';

type Row = { id: string; businessId: string; tokenHash: string; prefix: string; label: string | null; lastUsedAt: Date | null; revokedAt: Date | null; createdAt: Date };

/** Doble en memoria de TenantApiKey — suficiente para ejercitar los handlers reales. */
function fakeDb(seed: Row[] = []): TenantKeysOperatorDb & { rows: Row[] } {
  const rows = [...seed];
  let seq = 0;
  const db = {
    rows,
    business: {
      findFirst: async ({ where }: { where: { id: string; eliminadoEn: null } }) =>
        where.id === ACTIVE_BUSINESS ? { id: ACTIVE_BUSINESS } : null,
    },
    tenantApiKey: {
      create: async (args: { data: { businessId: string; tokenHash: string; prefix: string; label: string | null } }) => {
        const row: Row = {
          id: `key-${++seq}`,
          businessId: args.data.businessId,
          tokenHash: args.data.tokenHash,
          prefix: args.data.prefix,
          label: args.data.label,
          lastUsedAt: null,
          revokedAt: null,
          createdAt: new Date(),
        };
        rows.push(row);
        return row;
      },
      findMany: async (args: { where: { businessId: string } }) => rows.filter((r) => r.businessId === args.where.businessId),
      findFirst: async (args: { where: { id: string; businessId: string } }) =>
        rows.find((r) => r.id === args.where.id && r.businessId === args.where.businessId) ?? null,
      update: async (args: { where: { id: string }; data: { revokedAt: Date } }) => {
        const row = rows.find((r) => r.id === args.where.id)!;
        row.revokedAt = args.data.revokedAt;
        return row;
      },
    },
    // No usado en estos tests, pero requerido por la interfaz completa.
    tenantSecret: {
      upsert: async () => { throw new Error('no usado en api-keys.operator.test.ts'); },
      findMany: async () => [],
      findFirst: async () => null,
      update: async () => { throw new Error('no usado en api-keys.operator.test.ts'); },
    },
  } as unknown as TenantKeysOperatorDb & { rows: Row[] };
  return db;
}

describe('POST /businesses/:id/api-keys (emitir)', () => {
  test('devuelve el token en claro UNA VEZ y en BD solo queda su hash (AC1/AC2)', async () => {
    const db = fakeDb();
    const res = mockRes();
    await issueApiKeyHandler(db, mockReq({ params: { id: ACTIVE_BUSINESS }, body: { label: 'app landing' } }), res);

    assert.equal(res.statusCode, 201);
    const body = res.body as { id: string; token: string; prefix: string; label: string };
    assert.ok(body.token.startsWith('tk_'));
    assert.equal(body.label, 'app landing');

    // En BD solo el hash — el token en claro nunca se persiste.
    const stored = db.rows[0];
    assert.equal(stored.tokenHash, hashApiKeyToken(body.token));
    assert.notEqual((stored as unknown as { token?: string }).token, body.token);
  });

  test('404 si el negocio no existe/inactivo', async () => {
    const db = fakeDb();
    const res = mockRes();
    await issueApiKeyHandler(db, mockReq({ params: { id: 'biz-ghost' } }), res);
    assert.equal(res.statusCode, 404);
    assert.equal((res.body as { error: { code: string } }).error.code, 'business_not_found');
  });
});

describe('GET /businesses/:id/api-keys (listar)', () => {
  test('lista metadatos sin exponer tokenHash ni token', async () => {
    const db = fakeDb([
      { id: 'key-1', businessId: ACTIVE_BUSINESS, tokenHash: 'h1', prefix: 'abcd1234', label: 'app', lastUsedAt: null, revokedAt: null, createdAt: new Date() },
    ]);
    const res = mockRes();
    await listApiKeysHandler(db, mockReq({ params: { id: ACTIVE_BUSINESS } }), res);
    assert.equal(res.statusCode, 200);
    const body = res.body as { apiKeys: Record<string, unknown>[] };
    assert.equal(body.apiKeys.length, 1);
    const keys = Object.keys(body.apiKeys[0]).sort();
    assert.deepEqual(keys, ['createdAt', 'id', 'label', 'lastUsedAt', 'prefix', 'revokedAt']);
  });
});

describe('POST /businesses/:id/api-keys/:keyId/rotate', () => {
  test('revoca la anterior y emite una nueva (AC6)', async () => {
    const db = fakeDb();
    const issueRes = mockRes();
    await issueApiKeyHandler(db, mockReq({ params: { id: ACTIVE_BUSINESS }, body: { label: 'app' } }), issueRes);
    const oldId = (issueRes.body as { id: string }).id;
    const oldToken = (issueRes.body as { token: string }).token;

    const rotateRes = mockRes();
    await rotateApiKeyHandler(db, mockReq({ params: { id: ACTIVE_BUSINESS, keyId: oldId } }), rotateRes);

    assert.equal(rotateRes.statusCode, 201);
    const body = rotateRes.body as { id: string; token: string; rotatedFrom: string };
    assert.notEqual(body.id, oldId);
    assert.notEqual(body.token, oldToken);
    assert.equal(body.rotatedFrom, oldId);

    const oldRow = db.rows.find((r) => r.id === oldId)!;
    assert.ok(oldRow.revokedAt, 'la clave vieja debe quedar revocada');
  });

  test('404 si la clave a rotar no existe', async () => {
    const db = fakeDb();
    const res = mockRes();
    await rotateApiKeyHandler(db, mockReq({ params: { id: ACTIVE_BUSINESS, keyId: 'key-ghost' } }), res);
    assert.equal(res.statusCode, 404);
    assert.equal((res.body as { error: { code: string } }).error.code, 'api_key_not_found');
  });
});

describe('POST /businesses/:id/api-keys/:keyId/revoke', () => {
  test('revoca la clave; una clave revocada YA NO autentica (verificado en middleware test)', async () => {
    const db = fakeDb();
    const issueRes = mockRes();
    await issueApiKeyHandler(db, mockReq({ params: { id: ACTIVE_BUSINESS } }), issueRes);
    const keyId = (issueRes.body as { id: string }).id;

    const res = mockRes();
    await revokeApiKeyHandler(db, mockReq({ params: { id: ACTIVE_BUSINESS, keyId } }), res);
    assert.equal(res.statusCode, 200);
    assert.ok((res.body as { revokedAt: Date }).revokedAt);
  });

  test('revocar es idempotente: revocar dos veces no lanza y conserva la fecha original', async () => {
    const db = fakeDb();
    const issueRes = mockRes();
    await issueApiKeyHandler(db, mockReq({ params: { id: ACTIVE_BUSINESS } }), issueRes);
    const keyId = (issueRes.body as { id: string }).id;

    const first = mockRes();
    await revokeApiKeyHandler(db, mockReq({ params: { id: ACTIVE_BUSINESS, keyId } }), first);
    const firstRevokedAt = (first.body as { revokedAt: Date }).revokedAt;

    const second = mockRes();
    await revokeApiKeyHandler(db, mockReq({ params: { id: ACTIVE_BUSINESS, keyId } }), second);
    assert.equal(second.statusCode, 200);
    assert.equal((second.body as { revokedAt: Date }).revokedAt, firstRevokedAt);
  });

  test('404 si la clave no existe', async () => {
    const db = fakeDb();
    const res = mockRes();
    await revokeApiKeyHandler(db, mockReq({ params: { id: ACTIVE_BUSINESS, keyId: 'key-ghost' } }), res);
    assert.equal(res.statusCode, 404);
  });
});
