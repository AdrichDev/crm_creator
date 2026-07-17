// Unit tests de /tenant-keys/:businessId/secrets (crm-onboarding-tenant-keys WU3/WU6).
// Runner: node --import tsx --test
//
// Patrón DI del repo (ver api-keys.operator.test.ts): BD inyectada como doble en memoria,
// handlers reales ejercitados directamente (sin supertest ni servidor real). `testProviderConnection`
// se sustituye por un doble simple porque su propio contrato (sin leak de `value`) ya se
// verifica en provider-test.test.ts — aquí solo importa que el handler pase el resultado tal cual.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import {
  listSecretsHandler,
  upsertSecretHandler,
  deleteSecretHandler,
  testSecretHandler,
  revealSecretHandler,
  type TenantKeysDb,
} from '../tenant-keys.js';
import { encryptSecret, decryptSecret } from '../../lib/tenant-secrets/crypto.js';
import { resetRateLimits } from '../../lib/rateLimit.js';
import type { MemberRole } from '../../lib/generated/prisma/client.js';
import type { testProviderConnection } from '../../lib/tenant-secrets/provider-test.js';

// Doble de `testProviderConnection` inyectado vía el 4º parámetro de testSecretHandler
// (mismo patrón DI que ProviderTestDeps): node:test en este repo no soporta mock.module
// sin --experimental-test-module-mocks, así que no se mockea el módulo — se inyecta directo.
const fakeConnTestOk: typeof testProviderConnection = async () => ({ ok: true });

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

function mockReq(opts: { userId?: string; params?: Record<string, string>; body?: unknown } = {}) {
  return { userId: opts.userId, params: opts.params ?? {}, body: opts.body } as unknown as Request & { userId?: string };
}

const BIZ_A = 'biz-A';
const BIZ_B = 'biz-B';
const USER_MEMBER_A_ONLY = 'user-solo-A';

interface SecretRow {
  businessId: string;
  name: string;
  scope: 'FRONTEND_PUBLIC' | 'BACKEND_SECRET';
  valueCiphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
  envVarName: string | null;
  updatedAt: Date;
}

interface MembershipRow {
  userId: string;
  businessId: string;
  role: MemberRole;
}

/** Doble en memoria — suficiente para ejercitar los handlers reales de tenant-keys.ts. */
function fakeDb(opts: { memberships?: MembershipRow[]; secrets?: SecretRow[] } = {}) {
  const memberships = opts.memberships ?? [{ userId: USER_MEMBER_A_ONLY, businessId: BIZ_A, role: 'ADMIN' as MemberRole }];
  const secrets: SecretRow[] = [...(opts.secrets ?? [])];

  const db: TenantKeysDb & { secrets: SecretRow[] } = {
    secrets,
    membership: {
      findFirst: async ({ where }) => {
        const m = memberships.find((r) => r.userId === where.userId && r.businessId === where.businessId);
        return m ? { role: m.role } : null;
      },
    },
    tenantSecret: {
      findMany: async ({ where }) =>
        secrets
          .filter((s) => s.businessId === where.businessId)
          .map((s) => ({ name: s.name, scope: s.scope, envVarName: s.envVarName, updatedAt: s.updatedAt })),
      findUnique: async ({ where }) => {
        const { businessId, name } = where.businessId_name;
        const row = secrets.find((s) => s.businessId === businessId && s.name === name);
        return row
          ? { name: row.name, scope: row.scope, valueCiphertext: row.valueCiphertext, iv: row.iv, authTag: row.authTag, keyVersion: row.keyVersion }
          : null;
      },
      upsert: async ({ where, create, update }) => {
        const { businessId, name } = where.businessId_name;
        const idx = secrets.findIndex((s) => s.businessId === businessId && s.name === name);
        const now = new Date();
        if (idx === -1) {
          const row: SecretRow = { ...create, envVarName: create.envVarName, updatedAt: now };
          secrets.push(row);
          return { name: row.name, updatedAt: now };
        }
        secrets[idx] = { ...secrets[idx], ...update, updatedAt: now };
        return { name: secrets[idx].name, updatedAt: now };
      },
      delete: async ({ where }) => {
        const { businessId, name } = where.businessId_name;
        const idx = secrets.findIndex((s) => s.businessId === businessId && s.name === name);
        if (idx === -1) throw new Error('secret not found (delete)');
        secrets.splice(idx, 1);
        return {};
      },
    },
  };
  return db;
}

function seedEncrypted(businessId: string, name: string, scope: 'FRONTEND_PUBLIC' | 'BACKEND_SECRET', plain: string, envVarName: string | null = null): SecretRow {
  const enc = encryptSecret(plain);
  return { businessId, name, scope, valueCiphertext: enc.ciphertext, iv: enc.iv, authTag: enc.authTag, keyVersion: enc.keyVersion, envVarName, updatedAt: new Date() };
}

beforeEach(() => {
  resetRateLimits();
  process.env.SECRETS_MASTER_KEY ??= 'a'.repeat(64);
});

describe('GET /tenant-keys/:businessId/secrets', () => {
  test('negocio vacío → 15 slots, todos configured:false', async () => {
    const db = fakeDb();
    const res = mockRes();
    await listSecretsHandler(db, mockReq({ userId: USER_MEMBER_A_ONLY, params: { businessId: BIZ_A } }), res);
    assert.equal(res.statusCode, 200);
    const body = res.body as { secrets: Array<{ name: string; configured: boolean }> };
    assert.equal(body.secrets.length, 15);
    assert.ok(body.secrets.every((s) => s.configured === false));
  });

  test('WU3.2: con ANTHROPIC_API_KEY configurado, solo ese slot configured:true, ninguno con valor', async () => {
    const db = fakeDb({ secrets: [seedEncrypted(BIZ_A, 'ANTHROPIC_API_KEY', 'BACKEND_SECRET', 'sk-ant-real')] });
    const res = mockRes();
    await listSecretsHandler(db, mockReq({ userId: USER_MEMBER_A_ONLY, params: { businessId: BIZ_A } }), res);
    assert.equal(res.statusCode, 200);
    const body = res.body as { secrets: Array<{ name: string; configured: boolean }> };
    const byName = new Map(body.secrets.map((s) => [s.name, s]));
    assert.equal(byName.get('ANTHROPIC_API_KEY')?.configured, true);
    for (const name of ['OPENAI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_MAPS_API_KEY', 'DATABASE_URL']) {
      assert.equal(byName.get(name)?.configured, false);
    }
    assert.ok(!JSON.stringify(body).includes('sk-ant-real'));
  });

  test('404 si el usuario no es miembro del :businessId (cross-tenant)', async () => {
    const db = fakeDb();
    const res = mockRes();
    await listSecretsHandler(db, mockReq({ userId: USER_MEMBER_A_ONLY, params: { businessId: BIZ_B } }), res);
    assert.equal(res.statusCode, 404);
    assert.equal((res.body as { error: { code: string } }).error.code, 'not_found');
  });

  test('403 si el rol de la membership del path no es ADMIN/MANAGER', async () => {
    const db = fakeDb({ memberships: [{ userId: 'user-empleado', businessId: BIZ_A, role: 'EMPLOYEE' as MemberRole }] });
    const res = mockRes();
    await listSecretsHandler(db, mockReq({ userId: 'user-empleado', params: { businessId: BIZ_A } }), res);
    assert.equal(res.statusCode, 403);
    assert.equal((res.body as { error: { code: string } }).error.code, 'forbidden');
  });

  test('403 para CLIENT miembro del path', async () => {
    const db = fakeDb({ memberships: [{ userId: 'user-cliente', businessId: BIZ_A, role: 'CLIENT' as MemberRole }] });
    const res = mockRes();
    await listSecretsHandler(db, mockReq({ userId: 'user-cliente', params: { businessId: BIZ_A } }), res);
    assert.equal(res.statusCode, 403);
  });

  test('1 preset configurado + 1 free-form → GET trae ambos con scope/envVarName correctos (crm-tenant-keys-freeform)', async () => {
    // Nombre free-form ajeno al catálogo (crm-onboarding-db-keys-export-connect T2
    // añadió NEXT_PUBLIC_SUPABASE_* como slots reales, así que ya no sirven de
    // ejemplo de "variable NO catalogada").
    const db = fakeDb({
      secrets: [
        seedEncrypted(BIZ_A, 'ANTHROPIC_API_KEY', 'BACKEND_SECRET', 'sk-ant-real'),
        seedEncrypted(BIZ_A, 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', 'FRONTEND_PUBLIC', 'stripe-real', 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'),
      ],
    });
    const res = mockRes();
    await listSecretsHandler(db, mockReq({ userId: USER_MEMBER_A_ONLY, params: { businessId: BIZ_A } }), res);
    assert.equal(res.statusCode, 200);
    const body = res.body as { secrets: Array<{ name: string; configured: boolean; scope: string; envVarName: string | null }> };
    assert.equal(body.secrets.length, 16);
    const byName = new Map(body.secrets.map((s) => [s.name, s]));
    assert.equal(byName.get('ANTHROPIC_API_KEY')?.configured, true);
    const freeform = byName.get('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY');
    assert.equal(freeform?.configured, true);
    assert.equal(freeform?.scope, 'FRONTEND_PUBLIC');
    assert.equal(freeform?.envVarName, 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY');
    assert.ok(!JSON.stringify(body).includes('stripe-real'));
  });
});

describe('PUT /tenant-keys/:businessId/secrets/:name', () => {
  test('MANAGER miembro: alta → 200 configured:true sin el value, y el valor descifra igual', async () => {
    const db = fakeDb({ memberships: [{ userId: 'user-manager', businessId: BIZ_A, role: 'MANAGER' as MemberRole }] });
    const res = mockRes();
    await upsertSecretHandler(db, mockReq({ userId: 'user-manager', params: { businessId: BIZ_A, name: 'OPENAI_API_KEY' }, body: { value: 'sk-test' } }), res);

    assert.equal(res.statusCode, 200);
    const body = res.body as { name: string; configured: boolean; scope: string };
    assert.equal(body.configured, true);
    assert.equal(body.scope, 'BACKEND_SECRET');
    assert.ok(!JSON.stringify(body).includes('sk-test'));

    const stored = db.secrets.find((s) => s.businessId === BIZ_A && s.name === 'OPENAI_API_KEY')!;
    assert.equal(decryptSecret({ ciphertext: stored.valueCiphertext, iv: stored.iv, authTag: stored.authTag, keyVersion: stored.keyVersion }), 'sk-test');
  });

  test('actualización: sobrescribe el valor cifrado (segundo PUT descifra el nuevo)', async () => {
    const db = fakeDb();
    await upsertSecretHandler(db, mockReq({ userId: USER_MEMBER_A_ONLY, params: { businessId: BIZ_A, name: 'OPENAI_API_KEY' }, body: { value: 'sk-viejo' } }), mockRes());
    await upsertSecretHandler(db, mockReq({ userId: USER_MEMBER_A_ONLY, params: { businessId: BIZ_A, name: 'OPENAI_API_KEY' }, body: { value: 'sk-nuevo' } }), mockRes());

    const stored = db.secrets.find((s) => s.businessId === BIZ_A && s.name === 'OPENAI_API_KEY')!;
    assert.equal(decryptSecret({ ciphertext: stored.valueCiphertext, iv: stored.iv, authTag: stored.authTag, keyVersion: stored.keyVersion }), 'sk-nuevo');
    assert.equal(db.secrets.filter((s) => s.businessId === BIZ_A && s.name === 'OPENAI_API_KEY').length, 1);
  });

  test(':name fuera de catálogo pero formato válido → 200 free-form BACKEND_SECRET (crm-tenant-keys-freeform)', async () => {
    const db = fakeDb();
    const res = mockRes();
    await upsertSecretHandler(db, mockReq({ userId: USER_MEMBER_A_ONLY, params: { businessId: BIZ_A, name: 'FOO' }, body: { value: 'x' } }), res);
    assert.equal(res.statusCode, 200);
    const body = res.body as { name: string; scope: string; envVarName: string | null };
    assert.equal(body.scope, 'BACKEND_SECRET');
    assert.equal(body.envVarName, null);
  });

  test('free-form NEXT_PUBLIC_SUPABASE_ANON_KEY → 200 FRONTEND_PUBLIC, envVarName = mismo nombre (crm-tenant-keys-freeform)', async () => {
    const db = fakeDb();
    const res = mockRes();
    await upsertSecretHandler(db, mockReq({ userId: USER_MEMBER_A_ONLY, params: { businessId: BIZ_A, name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY' }, body: { value: 'anon-key-real' } }), res);
    assert.equal(res.statusCode, 200);
    const body = res.body as { name: string; scope: string; envVarName: string | null; configured: boolean };
    assert.equal(body.scope, 'FRONTEND_PUBLIC');
    assert.equal(body.envVarName, 'NEXT_PUBLIC_SUPABASE_ANON_KEY');
    assert.equal(body.configured, true);
  });

  test('free-form STRIPE_SECRET_KEY → 200 BACKEND_SECRET, envVarName null (crm-tenant-keys-freeform)', async () => {
    const db = fakeDb();
    const res = mockRes();
    await upsertSecretHandler(db, mockReq({ userId: USER_MEMBER_A_ONLY, params: { businessId: BIZ_A, name: 'STRIPE_SECRET_KEY' }, body: { value: 'sk_live_x' } }), res);
    assert.equal(res.statusCode, 200);
    const body = res.body as { scope: string; envVarName: string | null };
    assert.equal(body.scope, 'BACKEND_SECRET');
    assert.equal(body.envVarName, null);
  });

  test('nombre con formato inválido → 422 invalid_name (crm-tenant-keys-freeform)', async () => {
    const db = fakeDb();
    for (const bad of ['stripe_key', '1KEY', 'KEY CON ESPACIO']) {
      const res = mockRes();
      await upsertSecretHandler(db, mockReq({ userId: USER_MEMBER_A_ONLY, params: { businessId: BIZ_A, name: bad }, body: { value: 'x' } }), res);
      assert.equal(res.statusCode, 422, `esperaba 422 para "${bad}"`);
      assert.equal((res.body as { error: { code: string } }).error.code, 'invalid_name', `esperaba invalid_name para "${bad}"`);
    }
  });

  test('nombre reservado por el export (NEXT_PUBLIC_TENANT_JSON / NEXT_PUBLIC_API_URL) → 422 reserved_name (crm-tenant-keys-freeform)', async () => {
    const db = fakeDb();
    for (const reserved of ['NEXT_PUBLIC_TENANT_JSON', 'NEXT_PUBLIC_API_URL']) {
      const res = mockRes();
      await upsertSecretHandler(db, mockReq({ userId: USER_MEMBER_A_ONLY, params: { businessId: BIZ_A, name: reserved }, body: { value: 'x' } }), res);
      assert.equal(res.statusCode, 422, `esperaba 422 para "${reserved}"`);
      assert.equal((res.body as { error: { code: string } }).error.code, 'reserved_name', `esperaba reserved_name para "${reserved}"`);
    }
  });

  test('value vacío → 422 invalid', async () => {
    const db = fakeDb();
    const res = mockRes();
    await upsertSecretHandler(db, mockReq({ userId: USER_MEMBER_A_ONLY, params: { businessId: BIZ_A, name: 'OPENAI_API_KEY' }, body: { value: '' } }), res);
    assert.equal(res.statusCode, 422);
    assert.equal((res.body as { error: { code: string } }).error.code, 'invalid');
  });

  test('value con salto de línea → 422 invalid', async () => {
    const db = fakeDb();
    const res = mockRes();
    await upsertSecretHandler(db, mockReq({ userId: USER_MEMBER_A_ONLY, params: { businessId: BIZ_A, name: 'OPENAI_API_KEY' }, body: { value: 'sk-\ntest' } }), res);
    assert.equal(res.statusCode, 422);
    assert.equal((res.body as { error: { code: string } }).error.code, 'invalid');
  });

  test('scope/envVarName del body se ignoran — siempre los fija el catálogo', async () => {
    const db = fakeDb();
    const res = mockRes();
    await upsertSecretHandler(
      db,
      mockReq({ userId: USER_MEMBER_A_ONLY, params: { businessId: BIZ_A, name: 'OPENAI_API_KEY' }, body: { value: 'sk-test', scope: 'FRONTEND_PUBLIC', envVarName: 'NEXT_PUBLIC_HACK' } }),
      res,
    );
    const body = res.body as { scope: string; envVarName: string | null };
    assert.equal(body.scope, 'BACKEND_SECRET');
    assert.equal(body.envVarName, null);
  });

  test('404 cross-tenant: PUT sobre :businessId = B con usuario miembro solo de A no escribe nada en B', async () => {
    const db = fakeDb();
    const res = mockRes();
    await upsertSecretHandler(db, mockReq({ userId: USER_MEMBER_A_ONLY, params: { businessId: BIZ_B, name: 'OPENAI_API_KEY' }, body: { value: 'sk-leak' } }), res);
    assert.equal(res.statusCode, 404);
    assert.equal(db.secrets.find((s) => s.businessId === BIZ_B), undefined);
  });
});

describe('GET /tenant-keys/:businessId/secrets/:name/reveal', () => {
  test('admin: devuelve el valor descifrado del secreto guardado', async () => {
    const db = fakeDb({ secrets: [seedEncrypted(BIZ_A, 'OPENAI_API_KEY', 'BACKEND_SECRET', 'sk-secreto-real')] });
    const res = mockRes();
    await revealSecretHandler(db, mockReq({ userId: USER_MEMBER_A_ONLY, params: { businessId: BIZ_A, name: 'OPENAI_API_KEY' } }), res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { name: 'OPENAI_API_KEY', value: 'sk-secreto-real' });
  });

  test('slot sin fila → 404 secret_not_found', async () => {
    const db = fakeDb();
    const res = mockRes();
    await revealSecretHandler(db, mockReq({ userId: USER_MEMBER_A_ONLY, params: { businessId: BIZ_A, name: 'OPENAI_API_KEY' } }), res);
    assert.equal(res.statusCode, 404);
    assert.equal((res.body as { error: { code: string } }).error.code, 'secret_not_found');
  });

  test('cross-tenant: miembro de A no revela secreto de B → gate (no 200)', async () => {
    const db = fakeDb({ secrets: [seedEncrypted(BIZ_B, 'OPENAI_API_KEY', 'BACKEND_SECRET', 'sk-b')] });
    const res = mockRes();
    await revealSecretHandler(db, mockReq({ userId: USER_MEMBER_A_ONLY, params: { businessId: BIZ_B, name: 'OPENAI_API_KEY' } }), res);
    assert.notEqual(res.statusCode, 200);
  });

  test('rate limit: 5 reveal dentro de la ventana pasan, el 6º → 429 (bucket por businessId:name)', async () => {
    const db = fakeDb({ secrets: [seedEncrypted(BIZ_A, 'GOOGLE_OAUTH_CLIENT_SECRET', 'BACKEND_SECRET', 'gocspx-real')] });
    for (let i = 0; i < 5; i++) {
      const res = mockRes();
      await revealSecretHandler(db, mockReq({ userId: USER_MEMBER_A_ONLY, params: { businessId: BIZ_A, name: 'GOOGLE_OAUTH_CLIENT_SECRET' } }), res);
      assert.equal(res.statusCode, 200, `reveal ${i + 1} debe pasar`);
      assert.equal((res.body as { value: string }).value, 'gocspx-real');
    }
    const sixth = mockRes();
    await revealSecretHandler(db, mockReq({ userId: USER_MEMBER_A_ONLY, params: { businessId: BIZ_A, name: 'GOOGLE_OAUTH_CLIENT_SECRET' } }), sixth);
    assert.equal(sixth.statusCode, 429, 'el 6º reveal debe ser 429');
    assert.equal((sixth.body as { error: { code: string } }).error.code, 'rate_limited');
    // El 429 corta ANTES de devolver el plaintext: el value descifrado nunca sale en la respuesta.
    assert.ok(!JSON.stringify(sixth.body).includes('gocspx-real'));
  });

  test('rate limit NO cuenta para un no-miembro (gate antes del contador)', async () => {
    const db = fakeDb({ secrets: [seedEncrypted(BIZ_A, 'MAIL_APP_PASSWORD', 'BACKEND_SECRET', 'app-pass-real')] });
    for (let i = 0; i < 5; i++) {
      const res = mockRes();
      await revealSecretHandler(db, mockReq({ userId: 'user-sin-membership', params: { businessId: BIZ_A, name: 'MAIL_APP_PASSWORD' } }), res);
      assert.equal(res.statusCode, 404, 'no-miembro → 404 por el gate, sin tocar el bucket');
    }
    const ok = mockRes();
    await revealSecretHandler(db, mockReq({ userId: USER_MEMBER_A_ONLY, params: { businessId: BIZ_A, name: 'MAIL_APP_PASSWORD' } }), ok);
    assert.equal(ok.statusCode, 200, 'el miembro legítimo conserva sus intentos');
  });
});

describe('DELETE /tenant-keys/:businessId/secrets/:name', () => {
  test('borra un slot configurado → 200 configured:false, fila ya no existe', async () => {
    const db = fakeDb({ secrets: [seedEncrypted(BIZ_A, 'OPENAI_API_KEY', 'BACKEND_SECRET', 'sk-real')] });
    const res = mockRes();
    await deleteSecretHandler(db, mockReq({ userId: USER_MEMBER_A_ONLY, params: { businessId: BIZ_A, name: 'OPENAI_API_KEY' } }), res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { name: 'OPENAI_API_KEY', configured: false });
    assert.equal(db.secrets.find((s) => s.businessId === BIZ_A && s.name === 'OPENAI_API_KEY'), undefined);
  });

  test('repetir el borrado sobre un slot ya vacío → 404 secret_not_found', async () => {
    const db = fakeDb();
    const res = mockRes();
    await deleteSecretHandler(db, mockReq({ userId: USER_MEMBER_A_ONLY, params: { businessId: BIZ_A, name: 'OPENAI_API_KEY' } }), res);
    assert.equal(res.statusCode, 404);
    assert.equal((res.body as { error: { code: string } }).error.code, 'secret_not_found');
  });

  test(':name fuera de catálogo sin fila → 404 secret_not_found (crm-tenant-keys-freeform: ya no hay gate de catálogo)', async () => {
    const db = fakeDb();
    const res = mockRes();
    await deleteSecretHandler(db, mockReq({ userId: USER_MEMBER_A_ONLY, params: { businessId: BIZ_A, name: 'FOO' } }), res);
    assert.equal(res.statusCode, 404);
    assert.equal((res.body as { error: { code: string } }).error.code, 'secret_not_found');
  });

  test('borra una key free-form previamente creada → 200, desaparece de un GET posterior (crm-tenant-keys-freeform)', async () => {
    const db = fakeDb();
    const putRes = mockRes();
    await upsertSecretHandler(db, mockReq({ userId: USER_MEMBER_A_ONLY, params: { businessId: BIZ_A, name: 'STRIPE_SECRET_KEY' }, body: { value: 'sk_x' } }), putRes);
    assert.equal(putRes.statusCode, 200);

    const delRes = mockRes();
    await deleteSecretHandler(db, mockReq({ userId: USER_MEMBER_A_ONLY, params: { businessId: BIZ_A, name: 'STRIPE_SECRET_KEY' } }), delRes);
    assert.equal(delRes.statusCode, 200);

    const getRes = mockRes();
    await listSecretsHandler(db, mockReq({ userId: USER_MEMBER_A_ONLY, params: { businessId: BIZ_A } }), getRes);
    const listed = (getRes.body as { secrets: { name: string }[] }).secrets;
    assert.equal(listed.some((s) => s.name === 'STRIPE_SECRET_KEY'), false);
  });

  test('borrar y volver a guardar el mismo name funciona sin residuo (hard delete no bloquea el upsert)', async () => {
    const db = fakeDb({ secrets: [seedEncrypted(BIZ_A, 'OPENAI_API_KEY', 'BACKEND_SECRET', 'sk-viejo')] });
    await deleteSecretHandler(db, mockReq({ userId: USER_MEMBER_A_ONLY, params: { businessId: BIZ_A, name: 'OPENAI_API_KEY' } }), mockRes());
    const putRes = mockRes();
    await upsertSecretHandler(db, mockReq({ userId: USER_MEMBER_A_ONLY, params: { businessId: BIZ_A, name: 'OPENAI_API_KEY' }, body: { value: 'sk-post-delete' } }), putRes);
    assert.equal(putRes.statusCode, 200);
    assert.equal(db.secrets.filter((s) => s.businessId === BIZ_A && s.name === 'OPENAI_API_KEY').length, 1);
  });

  test('404 cross-tenant: DELETE sobre :businessId = B con usuario miembro solo de A deja B intacto', async () => {
    const db = fakeDb({ secrets: [seedEncrypted(BIZ_B, 'OPENAI_API_KEY', 'BACKEND_SECRET', 'sk-b-intacto')] });
    const res = mockRes();
    await deleteSecretHandler(db, mockReq({ userId: USER_MEMBER_A_ONLY, params: { businessId: BIZ_B, name: 'OPENAI_API_KEY' } }), res);
    assert.equal(res.statusCode, 404);
    assert.ok(db.secrets.find((s) => s.businessId === BIZ_B && s.name === 'OPENAI_API_KEY'), 'B no debe tocarse');
  });
});

describe('POST /tenant-keys/:businessId/secrets/:name/test', () => {
  test('value del body: no persiste y devuelve { ok, provider } sin el value', async () => {
    const db = fakeDb();
    const res = mockRes();
    await testSecretHandler(db, mockReq({ userId: USER_MEMBER_A_ONLY, params: { businessId: BIZ_A, name: 'OPENAI_API_KEY' }, body: { value: 'sk-probando' } }), res, fakeConnTestOk);
    assert.equal(res.statusCode, 200);
    const body = res.body as { ok: boolean; provider: string };
    assert.equal(body.ok, true);
    assert.equal(body.provider, 'openai');
    assert.ok(!JSON.stringify(body).includes('sk-probando'));
    assert.equal(db.secrets.find((s) => s.businessId === BIZ_A && s.name === 'OPENAI_API_KEY'), undefined, 'probar no debe persistir');
  });

  test('sin value en body, usa el guardado (descifrado server-side)', async () => {
    const db = fakeDb({ secrets: [seedEncrypted(BIZ_A, 'OPENAI_API_KEY', 'BACKEND_SECRET', 'sk-guardado')] });
    const res = mockRes();
    await testSecretHandler(db, mockReq({ userId: USER_MEMBER_A_ONLY, params: { businessId: BIZ_A, name: 'OPENAI_API_KEY' } }), res, fakeConnTestOk);
    assert.equal(res.statusCode, 200);
    assert.equal((res.body as { ok: boolean }).ok, true);
  });

  test('sin value disponible (ni body ni guardado) → 404 no_value', async () => {
    const db = fakeDb();
    const res = mockRes();
    await testSecretHandler(db, mockReq({ userId: USER_MEMBER_A_ONLY, params: { businessId: BIZ_A, name: 'OPENAI_API_KEY' } }), res, fakeConnTestOk);
    assert.equal(res.statusCode, 404);
    assert.equal((res.body as { error: { code: string } }).error.code, 'no_value');
  });

  test(':name fuera de catálogo (free-form) → 400 not_testable, sin llamar al proveedor (crm-tenant-keys-freeform)', async () => {
    const db = fakeDb();
    let connTestCalls = 0;
    const countingConnTest = async (...args: Parameters<typeof fakeConnTestOk>) => {
      connTestCalls += 1;
      return fakeConnTestOk(...args);
    };
    const res = mockRes();
    await testSecretHandler(db, mockReq({ userId: USER_MEMBER_A_ONLY, params: { businessId: BIZ_A, name: 'STRIPE_SECRET_KEY' }, body: { value: 'x' } }), res, countingConnTest);
    assert.equal(res.statusCode, 400);
    assert.equal((res.body as { error: { code: string } }).error.code, 'not_testable');
    assert.equal(connTestCalls, 0, 'una key sin provider conocido nunca debe llamar al proveedor');
  });

  test('6º intento en la ventana → 429 (rate limit por businessId:name)', async () => {
    const db = fakeDb();
    let connTestCalls = 0;
    const countingConnTest = async (...args: Parameters<typeof fakeConnTestOk>) => {
      connTestCalls += 1;
      return fakeConnTestOk(...args);
    };
    // El límite corre DENTRO del handler (tras el gate), así que llamar al handler 6 veces
    // ejercita el 429 real a nivel de endpoint (no solo el mecanismo genérico de rateLimit).
    for (let i = 0; i < 5; i++) {
      const res = mockRes();
      await testSecretHandler(db, mockReq({ userId: USER_MEMBER_A_ONLY, params: { businessId: BIZ_A, name: 'OPENAI_API_KEY' }, body: { value: 'sk-x' } }), res, countingConnTest);
      assert.equal(res.statusCode, 200, `intento ${i + 1} debe pasar`);
    }
    const sixth = mockRes();
    await testSecretHandler(db, mockReq({ userId: USER_MEMBER_A_ONLY, params: { businessId: BIZ_A, name: 'OPENAI_API_KEY' }, body: { value: 'sk-x' } }), sixth, countingConnTest);
    assert.equal(sixth.statusCode, 429, 'el 6º debe ser 429');
    assert.equal((sixth.body as { error: { code: string } }).error.code, 'rate_limited');
    // El 429 corta ANTES de llamar al proveedor: solo hubo 5 llamadas al connTest.
    assert.equal(connTestCalls, 5, 'el 6º no debe llegar a llamar al proveedor');
  });

  test('rate limit NO cuenta para un no-miembro (N3): 404 antes del contador', async () => {
    const db = fakeDb();
    // 5 intentos de un no-miembro sobre BIZ_A: todos 404 (gate), sin tocar el bucket.
    for (let i = 0; i < 5; i++) {
      const res = mockRes();
      await testSecretHandler(db, mockReq({ userId: 'user-sin-membership', params: { businessId: BIZ_A, name: 'OPENAI_API_KEY' }, body: { value: 'sk-x' } }), res, fakeConnTestOk);
      assert.equal(res.statusCode, 404, 'no-miembro → 404 por el gate');
    }
    // El miembro legítimo conserva sus 5 intentos intactos (el no-miembro no gastó el cupo).
    const ok = mockRes();
    await testSecretHandler(db, mockReq({ userId: USER_MEMBER_A_ONLY, params: { businessId: BIZ_A, name: 'OPENAI_API_KEY' }, body: { value: 'sk-x' } }), ok, fakeConnTestOk);
    assert.equal(ok.statusCode, 200, 'el miembro legítimo no debe verse afectado por el no-miembro');
  });
});
