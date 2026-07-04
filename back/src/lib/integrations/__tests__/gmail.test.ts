// Unit tests para lib/integrations/gmail.ts (envío por Gmail del negocio, T1.6).
// Runner: node --import tsx --test. Sin red ni credencial real: getToken + fetch inyectados.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { sendGmailMessage, ProviderError, type GmailSendDeps } from '../gmail.js';
import { IntegrationMissingError, ReauthRequiredError } from '../oauth.js';

const msg = { to: 'cliente@test.com', subject: 'Factura de julio — año 2026', html: '<p>Hola María</p>' };

function fetchOk(status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status } as Response;
  }) as unknown as typeof fetch;
  return Object.assign(fn, { calls });
}

describe('sendGmailMessage', () => {
  test('200 → "sent", llama a users.messages.send con Bearer y raw base64url', async () => {
    const fetchSpy = fetchOk(200);
    const deps: GmailSendDeps = { getToken: async () => 'tok-123', fetch: fetchSpy };

    const result = await sendGmailMessage('biz-1', msg, deps);

    assert.equal(result, 'sent');
    assert.equal(fetchSpy.calls.length, 1);
    assert.match(fetchSpy.calls[0].url, /gmail\/v1\/users\/me\/messages\/send$/);
    const headers = fetchSpy.calls[0].init.headers as Record<string, string>;
    assert.equal(headers.Authorization, 'Bearer tok-123');

    const body = JSON.parse(fetchSpy.calls[0].init.body as string) as { raw: string };
    const mime = Buffer.from(body.raw, 'base64url').toString('utf8');
    assert.match(mime, /^To: cliente@test\.com/m);
    assert.match(mime, /Content-Type: text\/html; charset=UTF-8/);
    // Subject con acentos codificado en RFC 2047 base64.
    assert.match(mime, /Subject: =\?UTF-8\?B\?/);
    // Cuerpo HTML en base64 (Content-Transfer-Encoding: base64).
    assert.ok(mime.includes(Buffer.from(msg.html, 'utf8').toString('base64')));
  });

  test('negocio sin Gmail conectado (IntegrationMissingError) → "missing", no llama a fetch', async () => {
    const fetchSpy = fetchOk(200);
    const deps: GmailSendDeps = {
      getToken: async () => { throw new IntegrationMissingError('biz-1', 'gmail'); },
      fetch: fetchSpy,
    };
    const result = await sendGmailMessage('biz-1', msg, deps);
    assert.equal(result, 'missing');
    assert.equal(fetchSpy.calls.length, 0);
  });

  test('getToken lanza ReauthRequiredError → propaga (lo maneja el caller)', async () => {
    const deps: GmailSendDeps = {
      getToken: async () => { throw new ReauthRequiredError('biz-1', 'gmail'); },
      fetch: fetchOk(200),
    };
    await assert.rejects(() => sendGmailMessage('biz-1', msg, deps), ReauthRequiredError);
  });

  test('401 en vuelo → ReauthRequiredError (token murió durante el envío)', async () => {
    const deps: GmailSendDeps = { getToken: async () => 'tok', fetch: fetchOk(401) };
    await assert.rejects(() => sendGmailMessage('biz-1', msg, deps), ReauthRequiredError);
  });

  test('5xx → ProviderError con codigo http_503', async () => {
    const deps: GmailSendDeps = { getToken: async () => 'tok', fetch: fetchOk(503) };
    await assert.rejects(
      () => sendGmailMessage('biz-1', msg, deps),
      (err: unknown) => err instanceof ProviderError && err.codigo === 'http_503',
    );
  });
});
