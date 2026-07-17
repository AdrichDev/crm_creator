// Unit tests de la cadena de resolución tenant → plataforma → env
// (crm-central-oauth-admin-config, T2). Runner: node --import tsx --test.
// Sin BD ni red: TenantSecretDb y PlatformSettingDb se inyectan como dobles.
//
// Cubre (AC2/AC3):
//   - tenant con ambas creds → usa tenant (aunque haya plataforma y env).
//   - solo plataforma (tenant sin creds) → usa plataforma, NO el env.
//   - ni tenant ni plataforma → usa el env (regresión: idéntico al deploy actual).
//   - par incompleto entre niveles (id de un nivel, secret de otro) → IncompleteTenantOAuthError.
//   - regresión: sin platformDb inyectado → env idéntico (nivel plataforma omitido).
//   - redirect URI: plataforma → env.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

process.env.SECRETS_MASTER_KEY ??= randomBytes(32).toString('hex');

import { encryptSecret } from '../tenant-secrets/crypto.js';
import type { TenantSecretDb } from '../tenant-secrets/store.js';
import type { PlatformSettingDb } from '../platform-secrets/store.js';
import { googleOAuthConfig, IncompleteTenantOAuthError } from '../integrations/providers/google.js';

/** TenantSecretDb en memoria: una fila cifrada por cada nombre de `secrets`. */
function fakeSecretDb(secrets: Record<string, string> = {}): TenantSecretDb {
  return {
    tenantSecret: {
      async findUnique(args) {
        const name = args.where.businessId_name.name;
        const value = secrets[name];
        if (value === undefined) return null;
        const enc = encryptSecret(value);
        return { name, scope: 'BACKEND_SECRET', valueCiphertext: enc.ciphertext, iv: enc.iv, authTag: enc.authTag, keyVersion: enc.keyVersion };
      },
      async findMany() {
        return [];
      },
    },
  };
}

/** PlatformSettingDb en memoria: una fila cifrada por cada clave de `settings`. */
function fakePlatformDb(settings: Record<string, string> = {}): PlatformSettingDb {
  return {
    platformSetting: {
      async findUnique(args) {
        const value = settings[args.where.key];
        if (value === undefined) return null;
        const enc = encryptSecret(value);
        return { key: args.where.key, valueCiphertext: enc.ciphertext, iv: enc.iv, authTag: enc.authTag, keyVersion: enc.keyVersion };
      },
      async upsert() {
        throw new Error('no usado en este test');
      },
      async findMany() {
        return [];
      },
    },
  };
}

// Env central de referencia (legacy). El secret usa GOOGLE_OAUTH_SECRET (no _CLIENT_SECRET).
const CENTRAL_ENV = {
  GOOGLE_OAUTH_CLIENT_ID: 'env-client-id',
  GOOGLE_OAUTH_SECRET: 'env-client-secret',
  GOOGLE_OAUTH_REDIRECT_URI: 'https://env.test/api/integrations/{servicio}/callback',
} as const;
const savedEnv: Record<string, string | undefined> = {};
before(() => {
  for (const k of Object.keys(CENTRAL_ENV) as Array<keyof typeof CENTRAL_ENV>) {
    savedEnv[k] = process.env[k];
    process.env[k] = CENTRAL_ENV[k];
  }
});
after(() => {
  for (const k of Object.keys(CENTRAL_ENV)) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe('T2 — resolución tenant → plataforma → env', () => {
  test('tenant con AMBAS creds → usa tenant (aunque haya plataforma y env)', async () => {
    const secretDb = fakeSecretDb({ GOOGLE_OAUTH_CLIENT_ID: 'tenant-id', GOOGLE_OAUTH_CLIENT_SECRET: 'tenant-secret' });
    const platformDb = fakePlatformDb({ GOOGLE_OAUTH_CLIENT_ID: 'plat-id', GOOGLE_OAUTH_CLIENT_SECRET: 'plat-secret' });
    const cfg = await googleOAuthConfig('gmail', 'biz-1', secretDb, platformDb);
    assert.equal(cfg.clientId, 'tenant-id');
    assert.equal(cfg.clientSecret, 'tenant-secret');
  });

  test('solo plataforma (tenant sin creds) → usa plataforma, NO el env', async () => {
    const secretDb = fakeSecretDb({});
    const platformDb = fakePlatformDb({ GOOGLE_OAUTH_CLIENT_ID: 'plat-id', GOOGLE_OAUTH_CLIENT_SECRET: 'plat-secret' });
    const cfg = await googleOAuthConfig('calendar', 'biz-1', secretDb, platformDb);
    assert.equal(cfg.clientId, 'plat-id');
    assert.equal(cfg.clientSecret, 'plat-secret');
  });

  test('ni tenant ni plataforma → env (regresión: idéntico al deploy actual)', async () => {
    const secretDb = fakeSecretDb({});
    const platformDb = fakePlatformDb({});
    const cfg = await googleOAuthConfig('gmail', 'biz-1', secretDb, platformDb);
    assert.equal(cfg.clientId, 'env-client-id');
    assert.equal(cfg.clientSecret, 'env-client-secret');
  });

  test('sin platformDb inyectado → env idéntico (nivel plataforma omitido)', async () => {
    const secretDb = fakeSecretDb({});
    const cfg = await googleOAuthConfig('gmail', 'biz-1', secretDb);
    assert.equal(cfg.clientId, 'env-client-id');
    assert.equal(cfg.clientSecret, 'env-client-secret');
  });

  test('par incompleto entre niveles (plataforma id + env secret) → IncompleteTenantOAuthError', async () => {
    const secretDb = fakeSecretDb({});
    const platformDb = fakePlatformDb({ GOOGLE_OAUTH_CLIENT_ID: 'plat-id' }); // secret NO en plataforma → cae al env
    await assert.rejects(() => googleOAuthConfig('gmail', 'biz-1', secretDb, platformDb), IncompleteTenantOAuthError);
  });

  test('par incompleto entre niveles (tenant id + plataforma secret) → IncompleteTenantOAuthError', async () => {
    const secretDb = fakeSecretDb({ GOOGLE_OAUTH_CLIENT_ID: 'tenant-id' });
    const platformDb = fakePlatformDb({ GOOGLE_OAUTH_CLIENT_SECRET: 'plat-secret' });
    await assert.rejects(() => googleOAuthConfig('gmail', 'biz-1', secretDb, platformDb), IncompleteTenantOAuthError);
  });

  test('businessId null (admin/plataforma) → plataforma → env', async () => {
    const platformDb = fakePlatformDb({ GOOGLE_OAUTH_CLIENT_ID: 'plat-id', GOOGLE_OAUTH_CLIENT_SECRET: 'plat-secret' });
    const cfg = await googleOAuthConfig('calendar', null, undefined, platformDb);
    assert.equal(cfg.clientId, 'plat-id');
    assert.equal(cfg.clientSecret, 'plat-secret');
  });

  test('redirect URI: plataforma cuando está, resuelta por servicio', async () => {
    const platformDb = fakePlatformDb({ GOOGLE_OAUTH_REDIRECT_URI: 'https://plat.test/api/integrations/{servicio}/callback' });
    const cfg = await googleOAuthConfig('gmail', 'biz-1', fakeSecretDb({ GOOGLE_OAUTH_CLIENT_ID: 'a', GOOGLE_OAUTH_CLIENT_SECRET: 'b' }), platformDb);
    assert.equal(cfg.redirectUri, 'https://plat.test/api/integrations/gmail/callback');
  });

  test('redirect URI: env cuando plataforma no la tiene (regresión)', async () => {
    const platformDb = fakePlatformDb({});
    const cfg = await googleOAuthConfig('calendar', 'biz-1', fakeSecretDb({ GOOGLE_OAUTH_CLIENT_ID: 'a', GOOGLE_OAUTH_CLIENT_SECRET: 'b' }), platformDb);
    assert.equal(cfg.redirectUri, 'https://env.test/api/integrations/calendar/callback');
  });
});
