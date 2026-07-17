// Unit tests de crm-tenant-oauth-creds (Fase 1): client_id/secret de Google OAuth
// resolubles POR TENANT con fallback al env central, sin filtrar el secreto al export.
// Runner: node --import tsx --test
//
// Cubre:
//   T1.1 — slots de catálogo (BACKEND_SECRET, sin envVarName, group 'google').
//   T1.2 — googleOAuthConfig: tenant > central > IncompleteTenantOAuthError.
//   T1.3 — authorizationUrl / handleCallback / getValidToken usan las creds resueltas;
//          regresión: tenant sin creds propias → env central (idéntico a hoy).
//   T1.5 — el export (readBakeableSecrets → buildEnvContent) NUNCA emite GOOGLE_OAUTH_*.
//   T1.6 — provider-test 'google' valida formato sin filtrar el valor.

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { TENANT_SECRET_CATALOG, findSecretSlot, inferScope } from '../tenant-secrets/catalog.js';
import { encryptSecret } from '../tenant-secrets/crypto.js';
import { readBakeableSecrets } from '../tenant-secrets/store.js';
import type { TenantSecretDb, TenantSecretBakeDb } from '../tenant-secrets/store.js';
import { testProviderConnection } from '../tenant-secrets/provider-test.js';
import { googleOAuthConfig, IncompleteTenantOAuthError } from '../integrations/providers/google.js';
import {
  encryptToken, decryptToken,
  authorizationUrl, handleCallback, getValidToken, resetRefreshLocks,
} from '../integrations/oauth.js';
import type { OAuthDeps, CredentialRow, CredentialUpdate, CredentialCreate } from '../integrations/oauth.js';
import { buildEnvContent } from '../export-builders/manifest-allowlist.js';
import { buildPublicEnvSecretsLines } from '../export-builders/public-env-secrets.js';
import type { TenantConfig } from '../../../../shared/generate/tenant-types.js';

// Claves de cifrado en memoria (no tocan disco ni BD).
process.env.SECRETS_MASTER_KEY ??= randomBytes(32).toString('hex');
process.env.CRM_OAUTH_ENCRYPTION_KEY ??= randomBytes(32).toString('hex');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

// ── Dobles ────────────────────────────────────────────────────────────────────

/** TenantSecretDb en memoria: devuelve una fila cifrada por cada nombre de `secrets`. */
function fakeSecretDb(secrets: Record<string, string> = {}): TenantSecretDb {
  return {
    tenantSecret: {
      async findUnique(args) {
        const name = args.where.businessId_name.name;
        const value = secrets[name];
        if (value === undefined) return null;
        const enc = encryptSecret(value);
        return {
          name,
          scope: 'BACKEND_SECRET',
          valueCiphertext: enc.ciphertext,
          iv: enc.iv,
          authTag: enc.authTag,
          keyVersion: enc.keyVersion,
        };
      },
      async findMany() {
        return [];
      },
    },
  };
}

function jsonRes(status: number, body: unknown) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body });
}

type FetchStub = (url: string, init?: unknown) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

interface Recorded { url: string; body: URLSearchParams | null }

/** OAuthDeps que registra cada request (url + body) para inspeccionar las creds usadas. */
function recordingDeps(secretDb: TenantSecretDb, fetchStub: FetchStub, seed: (CredentialRow & Record<string, unknown>) | null = null) {
  const store: { row: (CredentialRow & Record<string, unknown>) | null } = { row: seed };
  const requests: Recorded[] = [];
  const deps: OAuthDeps = {
    async findCredential() {
      return store.row
        ? { id: store.row.id, accessToken: store.row.accessToken, refreshToken: store.row.refreshToken, expiresAt: store.row.expiresAt }
        : null;
    },
    async updateCredential(id: string, data: CredentialUpdate) {
      if (store.row && store.row.id === id) Object.assign(store.row, data);
    },
    async createCredential(data: CredentialCreate) {
      store.row = { id: 'new-id', ...data } as unknown as CredentialRow & Record<string, unknown>;
    },
    fetch: (async (url: string, init?: { body?: unknown }) => {
      const raw = init?.body;
      const body = raw instanceof URLSearchParams ? raw : typeof raw === 'string' ? new URLSearchParams(raw) : null;
      requests.push({ url: String(url), body });
      return fetchStub(String(url), init);
    }) as unknown as OAuthDeps['fetch'],
    secretDb,
  };
  return { deps, store, requests };
}

/** Encuentra el request del intercambio/refresh de token (URL exacta, no `/tokeninfo`). */
function tokenExchange(requests: Recorded[]): Recorded | undefined {
  return requests.find((r) => r.url === TOKEN_URL);
}

// Env central de referencia. Se fija en `before` y se restaura en `after` para no
// contaminar otros ficheros de test que corren en el mismo proceso.
const CENTRAL_ENV = {
  GOOGLE_OAUTH_CLIENT_ID: 'central-client-id',
  GOOGLE_OAUTH_SECRET: 'central-client-secret',
  GOOGLE_OAUTH_REDIRECT_URI: 'https://crm.test/api/integrations/{servicio}/callback',
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
beforeEach(() => resetRefreshLocks());

// ── T1.1 — catálogo ─────────────────────────────────────────────────────────────
describe('T1.1 — slots de catálogo Google OAuth', () => {
  for (const name of ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET'] as const) {
    test(`${name}: BACKEND_SECRET, sin envVarName, group 'google', provider 'google'`, () => {
      const slot = findSecretSlot(name);
      assert.ok(slot, 'el slot existe en el catálogo');
      assert.equal(slot!.scope, 'BACKEND_SECRET');
      assert.equal(slot!.provider, 'google');
      assert.equal(slot!.group, 'google');
      assert.equal(slot!.envVarName, undefined, 'sin envVarName → nunca horneable al export');
      assert.equal(inferScope(name), 'BACKEND_SECRET');
    });
  }

  test('ambos están presentes en TENANT_SECRET_CATALOG', () => {
    const names = TENANT_SECRET_CATALOG.map((s) => s.name);
    assert.ok(names.includes('GOOGLE_OAUTH_CLIENT_ID'));
    assert.ok(names.includes('GOOGLE_OAUTH_CLIENT_SECRET'));
  });
});

// ── T1.2 — resolución tenant > central > error ────────────────────────────────────
describe('T1.2 — googleOAuthConfig resuelve per-tenant', () => {
  test('tenant con AMBAS creds → usa las del tenant', async () => {
    const db = fakeSecretDb({ GOOGLE_OAUTH_CLIENT_ID: 'tenant-id', GOOGLE_OAUTH_CLIENT_SECRET: 'tenant-secret' });
    const cfg = await googleOAuthConfig('gmail', 'biz-1', db);
    assert.equal(cfg.clientId, 'tenant-id');
    assert.equal(cfg.clientSecret, 'tenant-secret');
  });

  test('tenant SIN creds → cae al env central (regresión: idéntico a hoy)', async () => {
    const db = fakeSecretDb({});
    const cfg = await googleOAuthConfig('gmail', 'biz-1', db);
    assert.equal(cfg.clientId, 'central-client-id');
    assert.equal(cfg.clientSecret, 'central-client-secret');
  });

  test('businessId null (admin/plataforma) → siempre env central', async () => {
    const db = fakeSecretDb({ GOOGLE_OAUTH_CLIENT_ID: 'tenant-id', GOOGLE_OAUTH_CLIENT_SECRET: 'tenant-secret' });
    const cfg = await googleOAuthConfig('calendar', null, db);
    assert.equal(cfg.clientId, 'central-client-id');
    assert.equal(cfg.clientSecret, 'central-client-secret');
  });

  test('tenant con SOLO client_id → IncompleteTenantOAuthError (no mezcla con central)', async () => {
    const db = fakeSecretDb({ GOOGLE_OAUTH_CLIENT_ID: 'tenant-id' });
    await assert.rejects(() => googleOAuthConfig('gmail', 'biz-1', db), IncompleteTenantOAuthError);
  });

  test('tenant con SOLO client_secret → IncompleteTenantOAuthError', async () => {
    const db = fakeSecretDb({ GOOGLE_OAUTH_CLIENT_SECRET: 'tenant-secret' });
    await assert.rejects(() => googleOAuthConfig('gmail', 'biz-1', db), IncompleteTenantOAuthError);
  });

  test('la redirect URI SIEMPRE es la central (resuelta por servicio)', async () => {
    const db = fakeSecretDb({ GOOGLE_OAUTH_CLIENT_ID: 'tenant-id', GOOGLE_OAUTH_CLIENT_SECRET: 'tenant-secret' });
    const cfg = await googleOAuthConfig('gmail', 'biz-1', db);
    assert.equal(cfg.redirectUri, 'https://crm.test/api/integrations/gmail/callback');
  });
});

// ── T1.3 — los 3 call-sites usan las creds resueltas ──────────────────────────────
describe('T1.3 — call-sites usan las creds resueltas', () => {
  const okCallbackFetch: FetchStub = (url) =>
    url.includes('/tokeninfo')
      ? jsonRes(200, { scope: `${GMAIL_SCOPE} openid` })
      : jsonRes(200, { access_token: 'acc', refresh_token: 'ref', expires_in: 3600 });

  test('authorizationUrl → client_id del tenant', async () => {
    const db = fakeSecretDb({ GOOGLE_OAUTH_CLIENT_ID: 'tenant-id', GOOGLE_OAUTH_CLIENT_SECRET: 'tenant-secret' });
    const { deps } = recordingDeps(db, () => jsonRes(200, {}));
    const url = new URL(await authorizationUrl('gmail', 'biz-1', null, deps));
    assert.equal(url.searchParams.get('client_id'), 'tenant-id');
  });

  test('handleCallback → intercambia el code con las creds del tenant', async () => {
    const db = fakeSecretDb({ GOOGLE_OAUTH_CLIENT_ID: 'tenant-id', GOOGLE_OAUTH_CLIENT_SECRET: 'tenant-secret' });
    const { deps, requests } = recordingDeps(db, okCallbackFetch);
    await handleCallback('gmail', 'auth-code', 'biz-1', deps);
    const exchange = tokenExchange(requests);
    assert.ok(exchange, 'hubo un intercambio de token');
    assert.equal(exchange!.body?.get('client_id'), 'tenant-id');
    assert.equal(exchange!.body?.get('client_secret'), 'tenant-secret');
  });

  test('handleCallback regresión: tenant sin creds → creds centrales', async () => {
    const db = fakeSecretDb({});
    const { deps, requests } = recordingDeps(db, okCallbackFetch);
    await handleCallback('gmail', 'auth-code', 'biz-1', deps);
    const exchange = tokenExchange(requests);
    assert.equal(exchange!.body?.get('client_id'), 'central-client-id');
    assert.equal(exchange!.body?.get('client_secret'), 'central-client-secret');
  });

  test('getValidToken refresh → refresca con las creds del tenant', async () => {
    const db = fakeSecretDb({ GOOGLE_OAUTH_CLIENT_ID: 'tenant-id', GOOGLE_OAUTH_CLIENT_SECRET: 'tenant-secret' });
    const seed = {
      id: 'c1',
      accessToken: encryptToken('viejo'),
      refreshToken: encryptToken('refresh-1'),
      expiresAt: new Date(Date.now() - 1000),
    } as unknown as CredentialRow & Record<string, unknown>;
    const { deps, requests } = recordingDeps(db, () => jsonRes(200, { access_token: 'nuevo', expires_in: 3600 }), seed);
    const token = await getValidToken('biz-1', 'gmail', deps);
    assert.equal(token, 'nuevo');
    const exchange = tokenExchange(requests);
    assert.equal(exchange!.body?.get('client_id'), 'tenant-id');
    assert.equal(exchange!.body?.get('client_secret'), 'tenant-secret');
    assert.equal(exchange!.body?.get('grant_type'), 'refresh_token');
  });
});

// ── T1.5 — el export NUNCA hornea GOOGLE_OAUTH_* ──────────────────────────────────
describe('T1.5 — guard export: sin GOOGLE_OAUTH_* en el .env.local', () => {
  // Emula el WHERE de Prisma de readBakeableSecrets: solo FRONTEND_PUBLIC con envVarName.
  interface Row { name: string; scope: 'FRONTEND_PUBLIC' | 'BACKEND_SECRET'; envVarName: string | null; value: string }
  const ROWS: Row[] = [
    // El secreto OAuth: BACKEND_SECRET y sin envVarName → jamás horneable.
    { name: 'GOOGLE_OAUTH_CLIENT_SECRET', scope: 'BACKEND_SECRET', envVarName: null, value: 'GOCSPX-nunca-al-export' },
    { name: 'GOOGLE_OAUTH_CLIENT_ID', scope: 'BACKEND_SECRET', envVarName: null, value: '123-abc.apps.googleusercontent.com' },
    // Un secreto público legítimo, sí horneable, como control.
    { name: 'NEXT_PUBLIC_SUPABASE_URL', scope: 'FRONTEND_PUBLIC', envVarName: 'NEXT_PUBLIC_SUPABASE_URL', value: 'https://x.supabase.co' },
  ];

  const bakeDb: TenantSecretBakeDb = {
    tenantSecret: {
      async findMany() {
        return ROWS.filter((r) => r.scope === 'FRONTEND_PUBLIC' && r.envVarName !== null).map((r) => {
          const enc = encryptSecret(r.value);
          return {
            name: r.name,
            envVarName: r.envVarName,
            valueCiphertext: enc.ciphertext,
            iv: enc.iv,
            authTag: enc.authTag,
            keyVersion: enc.keyVersion,
          };
        });
      },
    },
  };

  test('readBakeableSecrets NO devuelve ningún GOOGLE_OAUTH_*', async () => {
    const bakeable = await readBakeableSecrets('biz-1', bakeDb);
    assert.ok(bakeable.every((b) => !b.envVarName.includes('GOOGLE_OAUTH')));
    assert.ok(bakeable.some((b) => b.envVarName === 'NEXT_PUBLIC_SUPABASE_URL'), 'el público legítimo sí pasa');
  });

  test('buildEnvContent (.env.local) no contiene GOOGLE_OAUTH_* ni el secreto', async () => {
    const bakeable = await readBakeableSecrets('biz-1', bakeDb);
    const extraLines = buildPublicEnvSecretsLines(bakeable.map((b) => ({ envVarName: b.envVarName, value: b.value })));
    const config = { api: { url: 'https://api.test' } } as unknown as TenantConfig;
    const lines = buildEnvContent(config, { extraLines });
    const joined = lines.join('\n');
    assert.ok(!joined.includes('GOOGLE_OAUTH'), 'ninguna variable GOOGLE_OAUTH_*');
    assert.ok(!joined.includes('GOCSPX-nunca-al-export'), 'el client_secret no aparece');
  });
});

// ── T1.6 — provider-test 'google' (formato, sin fuga) ─────────────────────────────
describe('T1.6 — provider-test google valida formato sin filtrar el valor', () => {
  test('client_id válido → ok', async () => {
    const r = await testProviderConnection('google', '1234567890-abcDEF_gh.apps.googleusercontent.com');
    assert.equal(r.ok, true);
  });

  test('client_secret válido (GOCSPX-) → ok', async () => {
    const r = await testProviderConnection('google', 'GOCSPX-abcDEF1234567890');
    assert.equal(r.ok, true);
  });

  test('malformado → error y el detail NUNCA incluye el valor', async () => {
    const leak = 'LEAKME clave con espacios';
    const r = await testProviderConnection('google', leak);
    assert.equal(r.ok, false);
    assert.ok(r.detail, 'hay un detail explicativo');
    assert.ok(!r.detail!.includes('LEAKME'), 'el valor probado no se filtra en el detail');
  });
});
