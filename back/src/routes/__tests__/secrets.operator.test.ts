// Unit tests de la gestión de operador de TenantSecret (crm-tenant-api-keys):
// POST/GET /businesses/:id/secrets, POST .../:name/rotate.
// Runner: node --import tsx --test
//
// Mismo patrón DI que api-keys.operator.test.ts: BD en memoria + crypto REAL
// (SECRETS_MASTER_KEY inyectada por env) para comprobar de verdad que el valor
// nunca sale del handler y que el cifrado/rotación funcionan de extremo a extremo.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import {
  upsertSecretHandler,
  listSecretsHandler,
  rotateSecretHandler,
  type TenantKeysOperatorDb,
} from '../service-operator-tenant-keys.js';
import { decryptSecret } from '../../lib/tenant-secrets/crypto.js';

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

type Row = {
  businessId: string; name: string; scope: 'FRONTEND_PUBLIC' | 'BACKEND_SECRET';
  valueCiphertext: string; iv: string; authTag: string; keyVersion: number; updatedAt: Date;
  envVarName?: string | null;
};

function fakeDb(seed: Row[] = []): TenantKeysOperatorDb & { rows: Row[] } {
  const rows = [...seed];
  const db = {
    rows,
    business: {
      findFirst: async ({ where }: { where: { id: string; eliminadoEn: null } }) =>
        where.id === ACTIVE_BUSINESS ? { id: ACTIVE_BUSINESS } : null,
    },
    tenantApiKey: {
      create: async () => { throw new Error('no usado en secrets.operator.test.ts'); },
      findMany: async () => [],
      findFirst: async () => null,
      update: async () => { throw new Error('no usado en secrets.operator.test.ts'); },
    },
    tenantSecret: {
      upsert: async (args: {
        where: { businessId_name: { businessId: string; name: string } };
        create: Row; update: Omit<Row, 'businessId' | 'name'>;
      }) => {
        const idx = rows.findIndex((r) => r.businessId === args.where.businessId_name.businessId && r.name === args.where.businessId_name.name);
        if (idx === -1) {
          const row: Row = { ...args.create, updatedAt: new Date() };
          rows.push(row);
          return row;
        }
        rows[idx] = { ...rows[idx], ...args.update, updatedAt: new Date() };
        return rows[idx];
      },
      findMany: async (args: { where: { businessId: string } }) => rows.filter((r) => r.businessId === args.where.businessId),
      findFirst: async (args: { where: { businessId: string; name: string } }) =>
        rows.find((r) => r.businessId === args.where.businessId && r.name === args.where.name) ?? null,
      update: async (args: {
        where: { businessId_name: { businessId: string; name: string } };
        data: { valueCiphertext: string; iv: string; authTag: string; keyVersion: number };
      }) => {
        const row = rows.find((r) => r.businessId === args.where.businessId_name.businessId && r.name === args.where.businessId_name.name)!;
        Object.assign(row, args.data, { updatedAt: new Date() });
        return row;
      },
    },
  } as unknown as TenantKeysOperatorDb & { rows: Row[] };
  return db;
}

beforeEach(() => {
  process.env.SECRETS_MASTER_KEY = randomBytes(32).toString('hex');
});

describe('POST /businesses/:id/secrets (alta)', () => {
  test('cifra el valor y NUNCA lo devuelve (AC5)', async () => {
    const db = fakeDb();
    const res = mockRes();
    await upsertSecretHandler(db, mockReq({ params: { id: ACTIVE_BUSINESS }, body: { name: 'mapaPublicKey', scope: 'FRONTEND_PUBLIC', value: 'pk_live_abc123' } }), res);

    assert.equal(res.statusCode, 200);
    const body = res.body as { name: string; scope: string; keyVersion: number; updatedAt: Date; envVarName: string | null };
    // envVarName añadido en crm-env-contract-tiers WU3.2 (puente build-time, null si no se envía).
    assert.deepEqual(Object.keys(body).sort(), ['envVarName', 'keyVersion', 'name', 'scope', 'updatedAt']);
    assert.equal(body.envVarName, null);
    assert.ok(!JSON.stringify(body).includes('pk_live_abc123'));

    const stored = db.rows[0];
    assert.notEqual(stored.valueCiphertext, 'pk_live_abc123');
    assert.equal(decryptSecret({ ciphertext: stored.valueCiphertext, iv: stored.iv, authTag: stored.authTag, keyVersion: stored.keyVersion }), 'pk_live_abc123');
  });

  test('scope inválido → 422', async () => {
    const db = fakeDb();
    const res = mockRes();
    await upsertSecretHandler(db, mockReq({ params: { id: ACTIVE_BUSINESS }, body: { name: 'x', scope: 'PUBLICO', value: 'v' } }), res);
    assert.equal(res.statusCode, 422);
  });

  test('actualiza (upsert) sobre el mismo (businessId,name) y cambia updatedAt', async () => {
    const db = fakeDb();
    const first = mockRes();
    await upsertSecretHandler(db, mockReq({ params: { id: ACTIVE_BUSINESS }, body: { name: 'apiKey', scope: 'BACKEND_SECRET', value: 'v1' } }), first);
    const firstUpdatedAt = (first.body as { updatedAt: Date }).updatedAt;

    await new Promise((r) => setTimeout(r, 5));
    const second = mockRes();
    await upsertSecretHandler(db, mockReq({ params: { id: ACTIVE_BUSINESS }, body: { name: 'apiKey', scope: 'BACKEND_SECRET', value: 'v2' } }), second);

    assert.equal(db.rows.length, 1, 'upsert no duplica fila');
    assert.notEqual((second.body as { updatedAt: Date }).updatedAt, firstUpdatedAt);
    const stored = db.rows[0];
    assert.equal(decryptSecret({ ciphertext: stored.valueCiphertext, iv: stored.iv, authTag: stored.authTag, keyVersion: stored.keyVersion }), 'v2');
  });

  test('404 si el negocio no existe/inactivo', async () => {
    const db = fakeDb();
    const res = mockRes();
    await upsertSecretHandler(db, mockReq({ params: { id: 'biz-ghost' }, body: { name: 'x', scope: 'BACKEND_SECRET', value: 'v' } }), res);
    assert.equal(res.statusCode, 404);
  });
});

describe('GET /businesses/:id/secrets (listar)', () => {
  test('lista metadatos SIN exponer valueCiphertext/iv/authTag ni el valor', async () => {
    const db = fakeDb([
      { businessId: ACTIVE_BUSINESS, name: 'apiKey', scope: 'BACKEND_SECRET', valueCiphertext: 'aa', iv: 'bb', authTag: 'cc', keyVersion: 1, updatedAt: new Date() },
    ]);
    const res = mockRes();
    await listSecretsHandler(db, mockReq({ params: { id: ACTIVE_BUSINESS } }), res);
    assert.equal(res.statusCode, 200);
    const body = res.body as { secrets: Record<string, unknown>[] };
    assert.equal(body.secrets.length, 1);
    assert.deepEqual(Object.keys(body.secrets[0]).sort(), ['keyVersion', 'name', 'scope', 'updatedAt']);
  });
});

describe('POST /businesses/:id/secrets/:name/rotate', () => {
  test('re-cifra un valor nuevo y cambia updatedAt (AC7)', async () => {
    const db = fakeDb();
    const created = mockRes();
    await upsertSecretHandler(db, mockReq({ params: { id: ACTIVE_BUSINESS }, body: { name: 'proveedorSecret', scope: 'BACKEND_SECRET', value: 'valor-viejo' } }), created);
    const beforeUpdatedAt = (created.body as { updatedAt: Date }).updatedAt;

    await new Promise((r) => setTimeout(r, 5));
    const res = mockRes();
    await rotateSecretHandler(db, mockReq({ params: { id: ACTIVE_BUSINESS, name: 'proveedorSecret' }, body: { value: 'valor-nuevo' } }), res);

    assert.equal(res.statusCode, 200);
    assert.notEqual((res.body as { updatedAt: Date }).updatedAt, beforeUpdatedAt);
    assert.ok(!JSON.stringify(res.body).includes('valor-nuevo'));

    const stored = db.rows[0];
    assert.equal(decryptSecret({ ciphertext: stored.valueCiphertext, iv: stored.iv, authTag: stored.authTag, keyVersion: stored.keyVersion }), 'valor-nuevo');
  });

  test('404 si el secreto no existe', async () => {
    const db = fakeDb();
    const res = mockRes();
    await rotateSecretHandler(db, mockReq({ params: { id: ACTIVE_BUSINESS, name: 'ghost' }, body: { value: 'v' } }), res);
    assert.equal(res.statusCode, 404);
    assert.equal((res.body as { error: { code: string } }).error.code, 'secret_not_found');
  });
});
