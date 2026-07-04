// Unit tests para lib/integrations/whatsapp.ts (WU2 — WhatsApp delegado a n8n).
// Runner: node --import tsx --test
//
// Cubre T2.1 (connectWhatsApp: marcador sin OAuth real, persistencia + validación),
// T2.2 (disconnectWhatsApp reusa disconnectIntegration — mismo soft-delete, sin
// llamar a un endpoint/proveedor de Google) y T2.3 (notifyWhatsAppEvent: emite a
// n8n, soft-fail, sin reintento propio).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  connectWhatsApp,
  disconnectWhatsApp,
  notifyWhatsAppEvent,
  type WhatsAppNotifyDeps,
} from '../integrations/whatsapp.js';
import { resetRefreshLocks } from '../integrations/oauth.js';
import type { OAuthDeps, CredentialRow, CredentialUpdate, CredentialCreate } from '../integrations/oauth.js';

process.env.CRM_OAUTH_ENCRYPTION_KEY ??= randomBytes(32).toString('hex');

interface Stored extends CredentialRow {
  estado: string;
  revokedAt: Date | null;
  scopesOauth: string[];
  businessId: string | null;
  servicio: string;
  scope: string;
}

function makeOAuthDeps(seed: Stored | null) {
  const store: { row: Stored | null } = { row: seed };
  const deps: OAuthDeps = {
    async findCredential(businessId, servicio) {
      if (!store.row || store.row.businessId !== businessId || store.row.servicio !== servicio) return null;
      return { id: store.row.id, accessToken: store.row.accessToken, refreshToken: store.row.refreshToken, expiresAt: store.row.expiresAt };
    },
    async updateCredential(id: string, data: CredentialUpdate) {
      if (store.row && store.row.id === id) Object.assign(store.row, data);
    },
    async createCredential(data: CredentialCreate) {
      store.row = { id: 'wa-1', ...data, revokedAt: null };
    },
    fetch: (async () => { throw new Error('fetch no debería llamarse: WhatsApp no tiene OAuth real'); }) as unknown as OAuthDeps['fetch'],
  };
  return Object.assign(deps, { store });
}

function makeNotifyDeps() {
  const calls: { name: string; data: unknown; eventId?: string; businessId: string }[] = [];
  const deps: WhatsAppNotifyDeps = {
    emit: (async (name: string, data: unknown, opts: { businessId: string; eventId?: string }) => {
      calls.push({ name, data, eventId: opts.eventId, businessId: opts.businessId });
      return { status: 'sent', eventId: opts.eventId ?? 'auto' };
    }) as WhatsAppNotifyDeps['emit'],
  };
  return Object.assign(deps, { calls });
}

test('setup', () => resetRefreshLocks());

// ── T2.1 — connectWhatsApp ───────────────────────────────────────────────────
describe('connectWhatsApp', () => {
  test('sin credencial previa → crea marcador: accessToken vacío, sin refresh/expiry, estado connected', async () => {
    const oauthDeps = makeOAuthDeps(null);
    const notifyDeps = makeNotifyDeps();
    await connectWhatsApp('biz-1', oauthDeps, notifyDeps);

    const row = oauthDeps.store.row!;
    assert.equal(row.servicio, 'whatsapp');
    assert.equal(row.businessId, 'biz-1');
    assert.equal(row.scope, 'tenant');
    assert.equal(row.accessToken, '', 'marcador: sin secreto real (Decisión 5)');
    assert.equal(row.refreshToken, null);
    assert.equal(row.expiresAt, null);
    assert.deepEqual(row.scopesOauth, []);
    assert.equal(row.estado, 'connected');
  });

  test('credencial ya revocada → reconectar limpia estado/revokedAt', async () => {
    const oauthDeps = makeOAuthDeps({
      id: 'wa-1', accessToken: '', refreshToken: null, expiresAt: null,
      estado: 'revoked', revokedAt: new Date(), scopesOauth: [],
      businessId: 'biz-1', servicio: 'whatsapp', scope: 'tenant',
    });
    await connectWhatsApp('biz-1', oauthDeps, makeNotifyDeps());
    const row = oauthDeps.store.row!;
    assert.equal(row.estado, 'connected');
    assert.equal(row.revokedAt, null);
  });

  test('sin businessId → lanza (WhatsApp no admite credencial admin)', async () => {
    const oauthDeps = makeOAuthDeps(null);
    await assert.rejects(() => connectWhatsApp('', oauthDeps, makeNotifyDeps()));
  });

  test('nunca llama fetch: sin SDK Twilio ni OAuth real en el backend', async () => {
    const oauthDeps = makeOAuthDeps(null);
    await connectWhatsApp('biz-1', oauthDeps, makeNotifyDeps());
    // makeOAuthDeps.fetch lanza si se invoca; si esto no lanzó, fetch nunca se llamó.
    assert.ok(true);
  });

  test('emite whatsapp.credential_event con tipoEvento connected', async () => {
    const oauthDeps = makeOAuthDeps(null);
    const notifyDeps = makeNotifyDeps();
    await connectWhatsApp('biz-1', oauthDeps, notifyDeps);
    assert.equal(notifyDeps.calls.length, 1);
    assert.equal(notifyDeps.calls[0].name, 'whatsapp.credential_event');
    assert.equal(notifyDeps.calls[0].businessId, 'biz-1');
    const data = notifyDeps.calls[0].data as { businessId: string; credentialId: string; tipoEvento: string };
    assert.equal(data.tipoEvento, 'connected');
    assert.equal(data.credentialId, 'wa-1');
  });
});

// ── T2.2 — disconnectWhatsApp (reusa disconnectIntegration) ──────────────────
describe('disconnectWhatsApp', () => {
  test('soft-delete: estado revoked + revokedAt, fila persiste (mismo camino que Gmail/Calendar)', async () => {
    const oauthDeps = makeOAuthDeps({
      id: 'wa-1', accessToken: '', refreshToken: null, expiresAt: null,
      estado: 'connected', revokedAt: null, scopesOauth: [],
      businessId: 'biz-1', servicio: 'whatsapp', scope: 'tenant',
    });
    await disconnectWhatsApp('biz-1', oauthDeps, makeNotifyDeps());
    assert.ok(oauthDeps.store.row, 'la fila NO se borra');
    assert.equal(oauthDeps.store.row!.estado, 'revoked');
    assert.ok(oauthDeps.store.row!.revokedAt instanceof Date);
  });

  test('no intenta revocar contra un proveedor: fetch nunca se invoca para whatsapp', async () => {
    const oauthDeps = makeOAuthDeps({
      id: 'wa-1', accessToken: '', refreshToken: null, expiresAt: null,
      estado: 'connected', revokedAt: null, scopesOauth: [],
      businessId: 'biz-1', servicio: 'whatsapp', scope: 'tenant',
    });
    // Si disconnectIntegration llamara a asGoogleService()/fetch para whatsapp, esto lanzaría.
    await disconnectWhatsApp('biz-1', oauthDeps, makeNotifyDeps());
    assert.equal(oauthDeps.store.row!.estado, 'revoked');
  });

  test('sin credencial → no-op, sin emitir evento', async () => {
    const oauthDeps = makeOAuthDeps(null);
    const notifyDeps = makeNotifyDeps();
    await disconnectWhatsApp('biz-1', oauthDeps, notifyDeps);
    assert.equal(oauthDeps.store.row, null);
    assert.equal(notifyDeps.calls.length, 0);
  });

  test('T2 revoca su WhatsApp → no afecta la credencial de T1 (aislamiento)', async () => {
    const oauthDepsT1 = makeOAuthDeps({
      id: 'wa-t1', accessToken: '', refreshToken: null, expiresAt: null,
      estado: 'connected', revokedAt: null, scopesOauth: [],
      businessId: 'biz-t1', servicio: 'whatsapp', scope: 'tenant',
    });
    // T2 no tiene fila (findCredential filtra por businessId+servicio) → no-op.
    await disconnectWhatsApp('biz-t2', oauthDepsT1, makeNotifyDeps());
    assert.equal(oauthDepsT1.store.row!.estado, 'connected', 'T1 sigue conectado');
  });

  test('emite whatsapp.credential_event con tipoEvento revoked', async () => {
    const oauthDeps = makeOAuthDeps({
      id: 'wa-1', accessToken: '', refreshToken: null, expiresAt: null,
      estado: 'connected', revokedAt: null, scopesOauth: [],
      businessId: 'biz-1', servicio: 'whatsapp', scope: 'tenant',
    });
    const notifyDeps = makeNotifyDeps();
    await disconnectWhatsApp('biz-1', oauthDeps, notifyDeps);
    assert.equal(notifyDeps.calls.length, 1);
    const data = notifyDeps.calls[0].data as { tipoEvento: string; credentialId: string };
    assert.equal(data.tipoEvento, 'revoked');
    assert.equal(data.credentialId, 'wa-1');
  });
});

// ── T2.3 — notifyWhatsAppEvent ────────────────────────────────────────────────
describe('notifyWhatsAppEvent', () => {
  test('emite el evento con eventId idempotente (credentialId:tipoEvento)', async () => {
    const notifyDeps = makeNotifyDeps();
    const ok = await notifyWhatsAppEvent('biz-1', 'wa-1', 'connected', notifyDeps);
    assert.equal(ok, true);
    assert.equal(notifyDeps.calls.length, 1);
    assert.equal(notifyDeps.calls[0].eventId, 'wa-1:connected');
  });

  test('soft-fail: emit() que lanza no propaga, devuelve false', async () => {
    const deps: WhatsAppNotifyDeps = {
      emit: (async () => { throw new Error('n8n caído'); }) as WhatsAppNotifyDeps['emit'],
    };
    const ok = await notifyWhatsAppEvent('biz-1', 'wa-1', 'connected', deps);
    assert.equal(ok, false);
  });

  test('emit() devuelve skipped/disabled (sin webhook) → false, sin lanzar', async () => {
    const deps: WhatsAppNotifyDeps = {
      emit: (async () => ({ status: 'skipped', reason: 'disabled' })) as WhatsAppNotifyDeps['emit'],
    };
    const ok = await notifyWhatsAppEvent('biz-1', 'wa-1', 'revoked', deps);
    assert.equal(ok, false);
  });

  test('emit() devuelve skipped/duplicate → cuenta como despachado (idempotencia)', async () => {
    const deps: WhatsAppNotifyDeps = {
      emit: (async () => ({ status: 'skipped', reason: 'duplicate' })) as WhatsAppNotifyDeps['emit'],
    };
    const ok = await notifyWhatsAppEvent('biz-1', 'wa-1', 'connected', deps);
    assert.equal(ok, true);
  });
});
