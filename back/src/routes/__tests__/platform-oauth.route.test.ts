// Tests de la API admin-plataforma /platform/oauth-config (crm-central-oauth-admin-config, T3).
// Runner: node --import tsx --test. Levanta el router en un puerto efímero bajo el gate de
// operador (requireOperatorToken) y hace fetch real. La BD se inyecta como doble en memoria;
// el validador de formato usa el real (google = validación LOCAL, sin red).
//
// Cubre (AC4):
//   - sin token / token equivocado → 401 (un admin de tenant no alcanza el endpoint).
//   - PUT sin token no escribe nada.
//   - PUT con token cifra y persiste (nunca en claro); la respuesta no devuelve el valor.
//   - GET con token devuelve estado (configurado sí/no) SIN el secret.
//   - POST test valida formato sin FUGAR el value; rate-limit → 429.

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import express from 'express';
import { Router } from 'express';
import type { Server } from 'node:http';

process.env.SECRETS_MASTER_KEY ??= randomBytes(32).toString('hex');

import { buildPlatformOAuthRouter } from '../platform-oauth.js';
import { requireOperatorToken } from '../../middleware/operator-token.js';
import { decryptSecret } from '../../lib/tenant-secrets/crypto.js';
import { resetRateLimits } from '../../lib/rateLimit.js';
import type { PlatformSettingDb, PlatformSettingRow } from '../../lib/platform-secrets/store.js';

const TOKEN = 'operator-secret-plat-777';
let server: Server;
let base: string;

interface StoredRow extends PlatformSettingRow {
  updatedAt: Date;
}
const rows = new Map<string, StoredRow>();

/** Doble en memoria de PlatformSettingDb — ejercita el store real (cifra de verdad). */
const fakeDb: PlatformSettingDb = {
  platformSetting: {
    async findUnique(args) {
      const r = rows.get(args.where.key);
      if (!r) return null;
      return { key: r.key, valueCiphertext: r.valueCiphertext, iv: r.iv, authTag: r.authTag, keyVersion: r.keyVersion };
    },
    async upsert(args) {
      const now = new Date();
      const prev = rows.get(args.where.key);
      const data = prev ? args.update : args.create;
      rows.set(args.where.key, { key: args.where.key, valueCiphertext: data.valueCiphertext, iv: data.iv, authTag: data.authTag, keyVersion: data.keyVersion, updatedAt: now });
      return { key: args.where.key, keyVersion: data.keyVersion, updatedAt: now };
    },
    async findMany(args) {
      const out: Array<{ key: string; updatedAt: Date }> = [];
      for (const k of args.where.key.in) {
        const r = rows.get(k);
        if (r) out.push({ key: r.key, updatedAt: r.updatedAt });
      }
      return out;
    },
  },
};

before(async () => {
  const app = express();
  app.use(express.json());
  const opRouter = Router();
  opRouter.use(requireOperatorToken(TOKEN)); // gate de operador con token inyectado
  opRouter.use(buildPlatformOAuthRouter(fakeDb)); // testConn = real (google local, sin red)
  app.use('/service/operator', opRouter);
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  base = `http://127.0.0.1:${port}`;
});
after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
beforeEach(() => {
  rows.clear();
  resetRateLimits(['platform-oauth-test']);
});

const PATH = '/service/operator/platform/oauth-config';

function req(method: string, path: string, opts: { token?: string; body?: unknown } = {}) {
  return fetch(`${base}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(opts.token ? { 'x-service-token': opts.token } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

describe('T3 — gate de operador', () => {
  test('GET sin token → 401', async () => {
    assert.equal((await req('GET', PATH)).status, 401);
  });
  test('GET con token equivocado → 401', async () => {
    assert.equal((await req('GET', PATH, { token: 'malo' })).status, 401);
  });
  test('PUT sin token → 401 y NADA se escribe', async () => {
    const res = await req('PUT', PATH, { body: { clientId: 'x-.apps.googleusercontent.com' } });
    assert.equal(res.status, 401);
    assert.equal(rows.size, 0, 'no se escribió ninguna fila');
  });
});

describe('T3 — PUT upsert cifrado', () => {
  test('PUT con token cifra y persiste; la respuesta NO devuelve el value', async () => {
    const secretValue = 'GOCSPX-superSecretoPlataforma123';
    const res = await req('PUT', PATH, {
      token: TOKEN,
      body: {
        clientId: '123-abc.apps.googleusercontent.com',
        clientSecret: secretValue,
        redirectUri: 'https://crm.test/api/integrations/{servicio}/callback',
      },
    });
    assert.equal(res.status, 200);
    const bodyText = await res.text();
    assert.ok(!bodyText.includes(secretValue), 'el secret nunca vuelve en la respuesta');
    assert.ok(!bodyText.includes('GOCSPX'), 'ni fragmento del secret');

    // Persistido cifrado, no en claro; descifra al original.
    const stored = rows.get('GOOGLE_OAUTH_CLIENT_SECRET')!;
    assert.ok(stored && !stored.valueCiphertext.includes(secretValue), 'se persiste cifrado');
    assert.equal(decryptSecret({ ciphertext: stored.valueCiphertext, iv: stored.iv, authTag: stored.authTag, keyVersion: stored.keyVersion }), secretValue);
  });

  test('PUT sin ninguna credencial → 422', async () => {
    const res = await req('PUT', PATH, { token: TOKEN, body: { clientId: '   ' } });
    assert.equal(res.status, 422);
  });

  test('PUT con salto de línea en un campo → 422', async () => {
    const res = await req('PUT', PATH, { token: TOKEN, body: { clientId: 'abc\ndef' } });
    assert.equal(res.status, 422);
  });
});

describe('T3 — GET estado sin secret', () => {
  test('GET devuelve configurado sí/no y NUNCA el value', async () => {
    await req('PUT', PATH, { token: TOKEN, body: { clientId: '123-abc.apps.googleusercontent.com' } });
    const res = await req('GET', PATH, { token: TOKEN });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { config: Array<{ field: string; configured: boolean }> };
    const idRow = body.config.find((c) => c.field === 'clientId')!;
    const secretRow = body.config.find((c) => c.field === 'clientSecret')!;
    assert.equal(idRow.configured, true);
    assert.equal(secretRow.configured, false);
    // Ningún ciphertext/iv/valor en el estado.
    assert.ok(!JSON.stringify(body).includes('123-abc'), 'el value no aparece en el estado');
  });
});

describe('T3 — POST test (formato, sin fuga, rate-limit)', () => {
  test('valores válidos → ok:true', async () => {
    const res = await req('POST', `${PATH}/test`, {
      token: TOKEN,
      body: {
        clientId: '123-abc.apps.googleusercontent.com',
        clientSecret: 'GOCSPX-abcDEF1234567890',
        redirectUri: 'https://crm.test/api/integrations/{servicio}/callback',
      },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean };
    assert.equal(body.ok, true);
  });

  test('valor malformado → ok:false y el value NO se filtra', async () => {
    const leak = 'LEAKME clave con espacios';
    const res = await req('POST', `${PATH}/test`, { token: TOKEN, body: { clientId: leak } });
    assert.equal(res.status, 200);
    const bodyText = await res.text();
    assert.ok(bodyText.includes('"ok":false'), 'reporta ko');
    assert.ok(!bodyText.includes('LEAKME'), 'el value probado no se filtra');
  });

  test('rate-limit → 429 tras superar el máximo', async () => {
    let got429 = false;
    for (let i = 0; i < 25; i++) {
      const res = await req('POST', `${PATH}/test`, { token: TOKEN, body: { clientId: '123-abc.apps.googleusercontent.com' } });
      if (res.status === 429) { got429 = true; break; }
    }
    assert.ok(got429, 'el endpoint de test acaba devolviendo 429');
  });
});
