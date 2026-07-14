// Unit tests para lib/integrations/oauth.ts.
// Runner: node --import tsx --test
//
// Cubre: enc:v1: round-trip, getValidToken (no-refresh / refresh / lock anti-carrera),
// invalid_grant → reauth_required + ReauthRequiredError, 5xx transitorio → token viejo,
// handleCallback (scope OK persiste / scope insuficiente → ScopeInsufficientError, no persiste),
// disconnectIntegration → soft-delete.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  encryptToken, decryptToken, isEncrypted,
  getValidToken, handleCallback, disconnectIntegration, authorizationUrl,
  resetRefreshLocks,
  ReauthRequiredError, ScopeInsufficientError, IntegrationMissingError,
} from '../integrations/oauth.js';
import type { OAuthDeps, CredentialRow, CredentialUpdate, CredentialCreate } from '../integrations/oauth.js';

process.env.CRM_OAUTH_ENCRYPTION_KEY ??= randomBytes(32).toString('hex');

const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

// ── Fake repo + fetch en memoria ─────────────────────────────────────────────
interface Stored extends CredentialRow {
  estado: string;
  revokedAt: Date | null;
  scopesOauth: string[];
  businessId: string | null;
  servicio: string;
  scope: string;
}

type FetchStub = (url: string, init?: unknown) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

function makeDeps(seed: Stored | null, fetchStub: FetchStub) {
  const store: { row: Stored | null } = { row: seed };
  const fetchCalls: string[] = [];
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
      store.row = { id: 'new-id', ...data, revokedAt: null };
    },
    fetch: (async (url: string, init?: unknown) => {
      fetchCalls.push(String(url));
      return fetchStub(url, init);
    }) as unknown as OAuthDeps['fetch'],
  };
  return Object.assign(deps, { store, fetchCalls });
}

function jsonRes(status: number, body: unknown) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body });
}

beforeEach(() => resetRefreshLocks());

// ── enc:v1: ──────────────────────────────────────────────────────────────────
describe('encryptToken / decryptToken', () => {
  test('round-trip con prefijo enc:v1:', () => {
    const enc = encryptToken('ya29.token');
    assert.ok(enc.startsWith('enc:v1:'));
    assert.ok(isEncrypted(enc));
    assert.equal(decryptToken(enc), 'ya29.token');
  });

  test('valor sin prefijo → passthrough legacy', () => {
    assert.equal(decryptToken('plano-legacy'), 'plano-legacy');
    assert.equal(isEncrypted('plano-legacy'), false);
  });
});

// ── getValidToken ─────────────────────────────────────────────────────────────
describe('getValidToken', () => {
  test('sin credencial → IntegrationMissingError', async () => {
    const deps = makeDeps(null, () => jsonRes(200, {}));
    await assert.rejects(() => getValidToken('biz-1', 'gmail', deps), IntegrationMissingError);
  });

  test('no expirado → devuelve access descifrado, 0 fetch', async () => {
    const deps = makeDeps({
      id: 'c1', accessToken: encryptToken('access-vivo'), refreshToken: encryptToken('r'),
      expiresAt: new Date(Date.now() + 3600_000),
      estado: 'connected', revokedAt: null, scopesOauth: [GMAIL_SCOPE],
      businessId: 'biz-1', servicio: 'gmail', scope: 'tenant',
    }, () => jsonRes(200, {}));
    assert.equal(await getValidToken('biz-1', 'gmail', deps), 'access-vivo');
    assert.equal(deps.fetchCalls.length, 0);
  });

  test('expirado → refresca y persiste nuevo token + estado connected', async () => {
    const deps = makeDeps({
      id: 'c1', accessToken: encryptToken('access-viejo'), refreshToken: encryptToken('refresh-1'),
      expiresAt: new Date(Date.now() - 1000),
      estado: 'connected', revokedAt: null, scopesOauth: [GMAIL_SCOPE],
      businessId: 'biz-1', servicio: 'gmail', scope: 'tenant',
    }, () => jsonRes(200, { access_token: 'access-nuevo', expires_in: 3600 }));
    const token = await getValidToken('biz-1', 'gmail', deps);
    assert.equal(token, 'access-nuevo');
    assert.equal(deps.fetchCalls.length, 1);
    assert.equal(decryptToken(deps.store.row!.accessToken), 'access-nuevo');
    assert.equal(deps.store.row!.estado, 'connected');
  });

  test('lock anti-carrera: 2 llamadas concurrentes → 1 sola llamada HTTP', async () => {
    const deps = makeDeps({
      id: 'c1', accessToken: encryptToken('viejo'), refreshToken: encryptToken('refresh-1'),
      expiresAt: new Date(Date.now() - 1000),
      estado: 'connected', revokedAt: null, scopesOauth: [GMAIL_SCOPE],
      businessId: 'biz-1', servicio: 'gmail', scope: 'tenant',
    }, () => new Promise((r) => setTimeout(() => r({ ok: true, status: 200, json: async () => ({ access_token: 'nuevo', expires_in: 3600 }) }), 20)));
    const [a, b] = await Promise.all([
      getValidToken('biz-1', 'gmail', deps),
      getValidToken('biz-1', 'gmail', deps),
    ]);
    assert.equal(a, 'nuevo');
    assert.equal(b, 'nuevo');
    assert.equal(deps.fetchCalls.length, 1);
  });

  test('invalid_grant → estado reauth_required + ReauthRequiredError', async () => {
    const deps = makeDeps({
      id: 'c1', accessToken: encryptToken('viejo'), refreshToken: encryptToken('refresh-1'),
      expiresAt: new Date(Date.now() - 1000),
      estado: 'connected', revokedAt: null, scopesOauth: [GMAIL_SCOPE],
      businessId: 'biz-1', servicio: 'gmail', scope: 'tenant',
    }, () => jsonRes(400, { error: 'invalid_grant' }));
    await assert.rejects(() => getValidToken('biz-1', 'gmail', deps), ReauthRequiredError);
    assert.equal(deps.store.row!.estado, 'reauth_required');
  });

  test('5xx transitorio → devuelve token viejo, NO marca reauth', async () => {
    const deps = makeDeps({
      id: 'c1', accessToken: encryptToken('viejo'), refreshToken: encryptToken('refresh-1'),
      expiresAt: new Date(Date.now() - 1000),
      estado: 'connected', revokedAt: null, scopesOauth: [GMAIL_SCOPE],
      businessId: 'biz-1', servicio: 'gmail', scope: 'tenant',
    }, () => jsonRes(503, { error: 'backend_error' }));
    assert.equal(await getValidToken('biz-1', 'gmail', deps), 'viejo');
    assert.equal(deps.store.row!.estado, 'connected');
  });
});

// ── handleCallback ─────────────────────────────────────────────────────────────
describe('handleCallback', () => {
  const okFetch: FetchStub = (url) => {
    if (String(url).includes('/tokeninfo')) {
      return jsonRes(200, { scope: `${GMAIL_SCOPE} openid` });
    }
    return jsonRes(200, { access_token: 'acc', refresh_token: 'ref', expires_in: 3600 });
  };

  test('scope suficiente → persiste credencial cifrada, estado connected', async () => {
    const deps = makeDeps(null, okFetch);
    await handleCallback('gmail', 'auth-code', 'biz-1', deps);
    const row = deps.store.row!;
    assert.equal(row.estado, 'connected');
    assert.equal(row.businessId, 'biz-1');
    assert.equal(row.scope, 'tenant');
    assert.ok(isEncrypted(row.accessToken));
    assert.equal(decryptToken(row.accessToken), 'acc');
    assert.ok(row.scopesOauth.includes(GMAIL_SCOPE));
  });

  test('credencial admin (businessId null) → scope admin', async () => {
    const deps = makeDeps(null, okFetch);
    await handleCallback('gmail', 'auth-code', null, deps);
    assert.equal(deps.store.row!.scope, 'admin');
    assert.equal(deps.store.row!.businessId, null);
  });

  test('scope insuficiente → ScopeInsufficientError, no persiste', async () => {
    const badScope: FetchStub = (url) => {
      if (String(url).includes('/tokeninfo')) {
        return jsonRes(200, { scope: 'openid email' }); // falta gmail.send
      }
      return jsonRes(200, { access_token: 'acc', expires_in: 3600 });
    };
    const deps = makeDeps(null, badScope);
    await assert.rejects(() => handleCallback('gmail', 'auth-code', 'biz-1', deps), ScopeInsufficientError);
    assert.equal(deps.store.row, null);
  });

  test('error en el intercambio de code → lanza, no persiste', async () => {
    const deps = makeDeps(null, () => jsonRes(400, { error: 'invalid_grant' }));
    await assert.rejects(() => handleCallback('gmail', 'bad-code', 'biz-1', deps));
    assert.equal(deps.store.row, null);
  });
});

// ── disconnectIntegration ───────────────────────────────────────────────────────
describe('disconnectIntegration', () => {
  test('soft-delete: estado revoked + revokedAt, fila persiste', async () => {
    const deps = makeDeps({
      id: 'c1', accessToken: encryptToken('acc'), refreshToken: encryptToken('ref'),
      expiresAt: new Date(Date.now() + 3600_000),
      estado: 'connected', revokedAt: null, scopesOauth: [GMAIL_SCOPE],
      businessId: 'biz-1', servicio: 'gmail', scope: 'tenant',
    }, () => jsonRes(200, {}));
    await disconnectIntegration('biz-1', 'gmail', deps);
    assert.ok(deps.store.row, 'la fila NO se borra');
    assert.equal(deps.store.row!.estado, 'revoked');
    assert.ok(deps.store.row!.revokedAt instanceof Date);
  });

  test('revoke remoto falla → soft-delete igual (best-effort)', async () => {
    const deps = makeDeps({
      id: 'c1', accessToken: encryptToken('acc'), refreshToken: null,
      expiresAt: null, estado: 'connected', revokedAt: null, scopesOauth: [],
      businessId: 'biz-1', servicio: 'gmail', scope: 'tenant',
    }, () => Promise.reject(new Error('network')));
    await disconnectIntegration('biz-1', 'gmail', deps);
    assert.equal(deps.store.row!.estado, 'revoked');
  });

  test('sin credencial → no-op', async () => {
    const deps = makeDeps(null, () => jsonRes(200, {}));
    await disconnectIntegration('biz-1', 'gmail', deps);
    assert.equal(deps.store.row, null);
  });
});

// ── authorizationUrl: redirect URI por servicio ────────────────────────────────
// El callback exige que el servicio de la URL coincida con el del state; con una
// redirect URI única solo un servicio podría completar el flujo. El placeholder
// {servicio} resuelve una URI distinta por servicio.
describe('authorizationUrl — placeholder {servicio} en GOOGLE_OAUTH_REDIRECT_URI', () => {
  const ENV_KEYS = ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_SECRET', 'GOOGLE_OAUTH_REDIRECT_URI'] as const;
  const saved: Record<string, string | undefined> = {};

  test('resuelve una redirect URI distinta por servicio', () => {
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'client-id';
    process.env.GOOGLE_OAUTH_SECRET = 'client-secret';
    process.env.GOOGLE_OAUTH_REDIRECT_URI = 'https://crm.test/api/integrations/{servicio}/callback';
    try {
      const gmailUrl = new URL(authorizationUrl('gmail', 'biz-1'));
      const calendarUrl = new URL(authorizationUrl('calendar', 'biz-1'));
      assert.equal(gmailUrl.searchParams.get('redirect_uri'), 'https://crm.test/api/integrations/gmail/callback');
      assert.equal(calendarUrl.searchParams.get('redirect_uri'), 'https://crm.test/api/integrations/calendar/callback');
    } finally {
      for (const k of ENV_KEYS) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }
  });

  test('sin placeholder → valor tal cual (retrocompatible)', () => {
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'client-id';
    process.env.GOOGLE_OAUTH_SECRET = 'client-secret';
    process.env.GOOGLE_OAUTH_REDIRECT_URI = 'https://crm.test/api/integrations/calendar/callback';
    try {
      const url = new URL(authorizationUrl('calendar', 'biz-1'));
      assert.equal(url.searchParams.get('redirect_uri'), 'https://crm.test/api/integrations/calendar/callback');
    } finally {
      for (const k of ENV_KEYS) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }
  });
});
