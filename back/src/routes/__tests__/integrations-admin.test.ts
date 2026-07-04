// Tests del gate de operador sobre las rutas admin de integraciones (WU3, T3.1/T3.2).
// Runner: node --import tsx --test. Levanta el router en un puerto efímero y hace fetch
// real, SIN tocar la BD: los casos probados (401 sin token, 404 servicio no-admin, 200
// connect) resuelven antes de cualquier consulta Prisma. La aislación real (tenant no
// puede tocar businessId=null) la garantiza el gate: sin el service token → 401.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import { integrationsRouter } from '../integrations.js';

const TOKEN = 'operator-secret-999';
let server: Server;
let base: string;

before(async () => {
  process.env.OPERATOR_SERVICE_TOKEN = TOKEN;
  // authorizationUrl exige estas envs; en memoria, sin red ni DB.
  process.env.GOOGLE_OAUTH_CLIENT_ID = 'client-id';
  process.env.GOOGLE_OAUTH_SECRET = 'client-secret';
  process.env.GOOGLE_OAUTH_REDIRECT_URI = 'https://crm.test/api/integrations/calendar/callback';

  const app = express();
  app.use(express.json());
  app.use('/integrations', integrationsRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  base = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function post(path: string, token?: string) {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: token ? { 'x-service-token': token } : {},
  });
}

describe('rutas admin de integraciones — gate de operador (T3.2)', () => {
  test('connect sin token → 401 (tenant normal no puede alcanzar credencial admin)', async () => {
    const res = await post('/integrations/admin/calendar/connect');
    assert.equal(res.status, 401);
  });

  test('connect con token equivocado → 401', async () => {
    const res = await post('/integrations/admin/calendar/connect', 'token-malo');
    assert.equal(res.status, 401);
  });

  test('revoke sin token → 401', async () => {
    const res = await post('/integrations/admin/calendar/revoke');
    assert.equal(res.status, 401);
  });

  test('servicio admin no soportado (gmail) con token válido → 404, no crea nada', async () => {
    const res = await post('/integrations/admin/gmail/connect', TOKEN);
    assert.equal(res.status, 404);
  });

  test('connect calendar con token válido → 200 + url OAuth con state (businessId=null admin)', async () => {
    const res = await post('/integrations/admin/calendar/connect', TOKEN);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { url: string };
    assert.match(body.url, /accounts\.google\.com/);
    assert.match(body.url, /state=/);
    // scope de Calendar, no Gmail
    assert.match(decodeURIComponent(body.url), /calendar\.events/);
  });
});

describe('rutas tenant — el gate de operador NO aplica (siguen exigiendo sesión)', () => {
  test('connect tenant sin sesión → 401 del middleware authenticate (no del operador)', async () => {
    // Sin Bearer de sesión, authenticate rechaza. Nunca cae en la rama admin.
    const res = await post('/integrations/calendar/connect', TOKEN);
    assert.equal(res.status, 401);
  });
});
