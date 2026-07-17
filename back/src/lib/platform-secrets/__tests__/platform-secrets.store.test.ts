// Unit tests de platform-secrets/store (crm-central-oauth-admin-config, T1).
// Runner: node --import tsx --test. Sin BD: la PlatformSettingDb se inyecta como
// doble en memoria; el cifrado usa SECRETS_MASTER_KEY en memoria.
//
// Cubre:
//   - upsert cifra y read descifra (round-trip AES-256-GCM).
//   - getPlatformSecret: presente → valor plataforma (source 'platform');
//     ausente → fallbackEnv (source 'env'); ausente sin fallback → null.
//   - readPlatformSecret con delegate ausente (cliente sin regenerar) → null (guard).
//   - platformSecretStatus: no filtra el valor, solo configurado sí/no.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

// Clave de cifrado en memoria (no toca disco ni BD). Debe fijarse antes de importar crypto.
process.env.SECRETS_MASTER_KEY ??= randomBytes(32).toString('hex');

import {
  readPlatformSecret,
  getPlatformSecret,
  upsertPlatformSecret,
  platformSecretStatus,
  type PlatformSettingDb,
  type PlatformSettingRow,
} from '../store.js';
import { decryptSecret } from '../../tenant-secrets/crypto.js';

interface StoredRow extends PlatformSettingRow {
  updatedAt: Date;
}

/** Doble en memoria de PlatformSettingDb — suficiente para ejercitar el store real. */
function fakePlatformDb(): { db: PlatformSettingDb; rows: Map<string, StoredRow> } {
  const rows = new Map<string, StoredRow>();
  const db: PlatformSettingDb = {
    platformSetting: {
      async findUnique(args) {
        const row = rows.get(args.where.key);
        if (!row) return null;
        return { key: row.key, valueCiphertext: row.valueCiphertext, iv: row.iv, authTag: row.authTag, keyVersion: row.keyVersion };
      },
      async upsert(args) {
        const now = new Date();
        const prev = rows.get(args.where.key);
        const data = prev ? args.update : args.create;
        const key = args.where.key;
        rows.set(key, { key, valueCiphertext: data.valueCiphertext, iv: data.iv, authTag: data.authTag, keyVersion: data.keyVersion, updatedAt: now });
        return { key, keyVersion: data.keyVersion, updatedAt: now };
      },
      async findMany(args) {
        const out: Array<{ key: string; updatedAt: Date }> = [];
        for (const k of args.where.key.in) {
          const row = rows.get(k);
          if (row) out.push({ key: row.key, updatedAt: row.updatedAt });
        }
        return out;
      },
    },
  };
  return { db, rows };
}

const savedEnv: Record<string, string | undefined> = {};
function setEnv(k: string, v: string | undefined) {
  if (!(k in savedEnv)) savedEnv[k] = process.env[k];
  if (v === undefined) delete process.env[k];
  else process.env[k] = v;
}
beforeEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('T1 — platform-secrets store', () => {
  test('upsert cifra y read descifra (round-trip)', async () => {
    const { db, rows } = fakePlatformDb();
    await upsertPlatformSecret('GOOGLE_OAUTH_CLIENT_ID', 'plat-client-id', db);
    // La fila persiste ciphertext, no el valor en claro.
    const stored = rows.get('GOOGLE_OAUTH_CLIENT_ID')!;
    assert.ok(stored.valueCiphertext && !stored.valueCiphertext.includes('plat-client-id'), 'se persiste cifrado, no en claro');
    // Descifra al valor original.
    assert.equal(decryptSecret({ ciphertext: stored.valueCiphertext, iv: stored.iv, authTag: stored.authTag, keyVersion: stored.keyVersion }), 'plat-client-id');
    // readPlatformSecret devuelve el valor descifrado.
    assert.equal(await readPlatformSecret('GOOGLE_OAUTH_CLIENT_ID', db), 'plat-client-id');
  });

  test('upsert sobre clave existente actualiza el valor', async () => {
    const { db } = fakePlatformDb();
    await upsertPlatformSecret('GOOGLE_OAUTH_CLIENT_SECRET', 'v1', db);
    await upsertPlatformSecret('GOOGLE_OAUTH_CLIENT_SECRET', 'v2', db);
    assert.equal(await readPlatformSecret('GOOGLE_OAUTH_CLIENT_SECRET', db), 'v2');
  });

  test('getPlatformSecret presente → source platform', async () => {
    const { db } = fakePlatformDb();
    await upsertPlatformSecret('GOOGLE_OAUTH_CLIENT_ID', 'plat-id', db);
    const r = await getPlatformSecret('GOOGLE_OAUTH_CLIENT_ID', { fallbackEnv: 'GOOGLE_OAUTH_CLIENT_ID' }, db);
    assert.deepEqual(r, { value: 'plat-id', source: 'platform' });
  });

  test('getPlatformSecret ausente → fallbackEnv (source env)', async () => {
    const { db } = fakePlatformDb();
    setEnv('GOOGLE_OAUTH_REDIRECT_URI', 'https://env.example/cb');
    const r = await getPlatformSecret('GOOGLE_OAUTH_REDIRECT_URI', { fallbackEnv: 'GOOGLE_OAUTH_REDIRECT_URI' }, db);
    assert.deepEqual(r, { value: 'https://env.example/cb', source: 'env' });
  });

  test('getPlatformSecret ausente y sin fallback → null', async () => {
    const { db } = fakePlatformDb();
    const r = await getPlatformSecret('NO_EXISTE', {}, db);
    assert.equal(r, null);
  });

  test('readPlatformSecret con delegate ausente (cliente sin regenerar) → null', async () => {
    const emptyDb = {} as unknown as PlatformSettingDb;
    assert.equal(await readPlatformSecret('GOOGLE_OAUTH_CLIENT_ID', emptyDb), null);
  });

  test('platformSecretStatus reporta configurado sí/no SIN el valor', async () => {
    const { db } = fakePlatformDb();
    await upsertPlatformSecret('GOOGLE_OAUTH_CLIENT_ID', 'plat-id', db);
    const status = await platformSecretStatus(['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET'], db);
    assert.equal(status['GOOGLE_OAUTH_CLIENT_ID'].configured, true);
    assert.equal(status['GOOGLE_OAUTH_CLIENT_SECRET'].configured, false);
    // El objeto de estado no contiene el valor por ningún lado.
    assert.ok(!JSON.stringify(status).includes('plat-id'), 'el valor nunca aparece en el estado');
  });
});
