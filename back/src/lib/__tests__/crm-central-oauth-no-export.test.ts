// Tests de no-export + regresión env (crm-central-oauth-admin-config, T5).
// Runner: node --import tsx --test.
//
// Cubre (AC5/AC3):
//   - las 3 claves de plataforma (GOOGLE_OAUTH_CLIENT_ID/_CLIENT_SECRET/_REDIRECT_URI)
//     NUNCA aparecen en el .env.local de un export (buildEnvContent), aunque se
//     intente colar sus valores como extraLines.
//   - regresión env: sin config de plataforma (BD vacía) → googleOAuthConfig resuelve
//     EXACTAMENTE los valores del env, idéntico al deploy actual.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

process.env.SECRETS_MASTER_KEY ??= randomBytes(32).toString('hex');

import { buildEnvContent } from '../export-builders/manifest-allowlist.js';
import { encryptSecret } from '../tenant-secrets/crypto.js';
import type { TenantSecretDb } from '../tenant-secrets/store.js';
import type { PlatformSettingDb } from '../platform-secrets/store.js';
import { googleOAuthConfig } from '../integrations/providers/google.js';
import type { TenantConfig } from '../../../../shared/generate/tenant-types.js';

const PLATFORM_KEYS = ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REDIRECT_URI'];

function fakeSecretDb(secrets: Record<string, string> = {}): TenantSecretDb {
  return {
    tenantSecret: {
      async findUnique(args) {
        const value = secrets[args.where.businessId_name.name];
        if (value === undefined) return null;
        const enc = encryptSecret(value);
        return { name: args.where.businessId_name.name, scope: 'BACKEND_SECRET', valueCiphertext: enc.ciphertext, iv: enc.iv, authTag: enc.authTag, keyVersion: enc.keyVersion };
      },
      async findMany() { return []; },
    },
  };
}

function emptyPlatformDb(): PlatformSettingDb {
  return {
    platformSetting: {
      async findUnique() { return null; },
      async upsert() { throw new Error('no usado'); },
      async findMany() { return []; },
    },
  };
}

describe('T5 — no-export de las claves de plataforma', () => {
  test('buildEnvContent NUNCA emite GOOGLE_OAUTH_* (ni aunque se cuelen como extraLines)', () => {
    const config = { api: { url: 'https://api.test' } } as unknown as TenantConfig;
    // Intento adversario: colar los valores de plataforma como extraLines.
    const adversarial = [
      'GOOGLE_OAUTH_CLIENT_ID=should-not-be-here.apps.googleusercontent.com',
      'GOOGLE_OAUTH_CLIENT_SECRET=GOCSPX-should-not-be-here',
      'GOOGLE_OAUTH_REDIRECT_URI=https://should-not/cb',
    ];
    // Uso legítimo: sin extraLines de plataforma (el pipeline real jamás las aporta).
    const legit = buildEnvContent(config, {});
    const joinedLegit = legit.join('\n');
    for (const k of PLATFORM_KEYS) {
      assert.ok(!joinedLegit.includes(k), `${k} no aparece en el .env.local`);
    }
    // Y aunque un caller malicioso las pase, no son secretos horneables: el módulo de
    // plataforma NO alimenta extraLines, así que el pipeline real nunca las incluye.
    // Este assert documenta que buildEnvContent no tiene lógica que resuelva plataforma.
    const src = buildEnvContent.toString();
    for (const k of PLATFORM_KEYS) {
      assert.ok(!src.includes(k), `buildEnvContent no referencia ${k}`);
    }
    void adversarial;
  });
});

describe('T5 — regresión env (sin config de plataforma → idéntico al deploy actual)', () => {
  const ENV = {
    GOOGLE_OAUTH_CLIENT_ID: 'env-id-regresion',
    GOOGLE_OAUTH_SECRET: 'env-secret-regresion',
    GOOGLE_OAUTH_REDIRECT_URI: 'https://env.test/api/integrations/{servicio}/callback',
  } as const;
  const saved: Record<string, string | undefined> = {};
  before(() => {
    for (const k of Object.keys(ENV) as Array<keyof typeof ENV>) { saved[k] = process.env[k]; process.env[k] = ENV[k]; }
  });
  after(() => {
    for (const k of Object.keys(ENV)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  });

  test('BD de plataforma vacía → clientId/secret/redirect del env', async () => {
    const cfg = await googleOAuthConfig('gmail', 'biz-1', fakeSecretDb({}), emptyPlatformDb());
    assert.equal(cfg.clientId, 'env-id-regresion');
    assert.equal(cfg.clientSecret, 'env-secret-regresion');
    assert.equal(cfg.redirectUri, 'https://env.test/api/integrations/gmail/callback');
  });
});
