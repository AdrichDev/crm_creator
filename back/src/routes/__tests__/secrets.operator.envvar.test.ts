// Tests de validación de `envVarName` en el alta de secreto de operador
// (crm-env-contract-tiers WU3.2 — puente build-time). Runner: node --import tsx --test
//
// Mismo patrón DI que secrets.operator.test.ts: BD en memoria + crypto REAL.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { upsertSecretHandler, type TenantKeysOperatorDb } from '../service-operator-tenant-keys.js';

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
      create: async () => { throw new Error('no usado en secrets.operator.envvar.test.ts'); },
      findMany: async () => [],
      findFirst: async () => null,
      update: async () => { throw new Error('no usado en secrets.operator.envvar.test.ts'); },
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
      update: async () => { throw new Error('no usado en secrets.operator.envvar.test.ts'); },
    },
  } as unknown as TenantKeysOperatorDb & { rows: Row[] };
  return db;
}

beforeEach(() => {
  process.env.SECRETS_MASTER_KEY = randomBytes(32).toString('hex');
});

describe('POST /businesses/:id/secrets — envVarName (WU3.2)', () => {
  test('envVarName válido con FRONTEND_PUBLIC → persiste y se devuelve en la respuesta', async () => {
    const db = fakeDb();
    const res = mockRes();
    await upsertSecretHandler(
      db,
      mockReq({ params: { id: ACTIVE_BUSINESS }, body: { name: 'mapaPublicKey', scope: 'FRONTEND_PUBLIC', value: 'pk_live_abc123', envVarName: 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY' } }),
      res,
    );
    assert.equal(res.statusCode, 200);
    const body = res.body as { envVarName: string | null };
    assert.equal(body.envVarName, 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY');
    assert.equal(db.rows[0].envVarName, 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY');
  });

  test('envVarName con regex inválida → 422, no persiste', async () => {
    const db = fakeDb();
    const res = mockRes();
    await upsertSecretHandler(
      db,
      mockReq({ params: { id: ACTIVE_BUSINESS }, body: { name: 'mapaPublicKey', scope: 'FRONTEND_PUBLIC', value: 'pk_live_abc123', envVarName: 'GOOGLE_MAPS_KEY' } }),
      res,
    );
    assert.equal(res.statusCode, 422);
    assert.equal(db.rows.length, 0);
  });

  test('envVarName minúsculas o con espacio → 422 (regex estricta)', async () => {
    const db = fakeDb();
    const res = mockRes();
    await upsertSecretHandler(
      db,
      mockReq({ params: { id: ACTIVE_BUSINESS }, body: { name: 'x', scope: 'FRONTEND_PUBLIC', value: 'v', envVarName: 'next_public_foo' } }),
      res,
    );
    assert.equal(res.statusCode, 422);
  });

  test('envVarName con scope BACKEND_SECRET → 422 (solo válido con FRONTEND_PUBLIC)', async () => {
    const db = fakeDb();
    const res = mockRes();
    await upsertSecretHandler(
      db,
      mockReq({ params: { id: ACTIVE_BUSINESS }, body: { name: 'apiKey', scope: 'BACKEND_SECRET', value: 'sk-live', envVarName: 'NEXT_PUBLIC_FOO' } }),
      res,
    );
    assert.equal(res.statusCode, 422);
    assert.equal(db.rows.length, 0);
  });

  test('value con salto de línea → 422, sin importar envVarName', async () => {
    const db = fakeDb();
    const res = mockRes();
    await upsertSecretHandler(
      db,
      mockReq({ params: { id: ACTIVE_BUSINESS }, body: { name: 'mapaPublicKey', scope: 'FRONTEND_PUBLIC', value: 'pk_live\nEXTRA=inyectado', envVarName: 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY' } }),
      res,
    );
    assert.equal(res.statusCode, 422);
    assert.equal(db.rows.length, 0);
  });

  test('value con \\r → 422', async () => {
    const db = fakeDb();
    const res = mockRes();
    await upsertSecretHandler(
      db,
      mockReq({ params: { id: ACTIVE_BUSINESS }, body: { name: 'x', scope: 'BACKEND_SECRET', value: 'v1\r\nv2' } }),
      res,
    );
    assert.equal(res.statusCode, 422);
  });

  test('sin envVarName (omitido) → persiste con null, comportamiento previo intacto', async () => {
    const db = fakeDb();
    const res = mockRes();
    await upsertSecretHandler(
      db,
      mockReq({ params: { id: ACTIVE_BUSINESS }, body: { name: 'apiKey', scope: 'BACKEND_SECRET', value: 'sk-live' } }),
      res,
    );
    assert.equal(res.statusCode, 200);
    const body = res.body as { envVarName: string | null };
    assert.equal(body.envVarName, null);
    assert.equal(db.rows[0].envVarName, null);
  });
});
