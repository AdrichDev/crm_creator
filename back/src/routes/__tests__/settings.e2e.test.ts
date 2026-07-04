// E2E tests: ajustes por categoría (BusinessSetting) en /settings/:categoria.
// Cubre 3.2.e: PUT hace upsert (1 fila, datos actualizados) y GET los devuelve;
// la categoría `config` (reservada al generador) rechaza PUT con 403 pero permite GET.
// Requires the back running at localhost:4001 + live Supabase credentials.
//
// Runner: node --import tsx --test
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../prisma.js';
import {
  api, probeBack, resetRateLimits, registerAndToken, cleanup, uniq, SUPABASE_LIVE,
} from './_shared.e2e.js';

let backUp = false;

before(async () => { backUp = await probeBack(); if (!backUp) console.warn('[e2e] back no responde — tests saltados'); });
beforeEach(async () => { if (backUp) await resetRateLimits('register'); });
after(async () => { await cleanup(backUp); });

// 3.2.e — PUT dos veces → upsert (1 fila, datos actualizados) + GET los devuelve
test('PUT /settings/:categoria dos veces → upsert (1 fila) y GET devuelve los últimos datos', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const auth = await registerAndToken(`set1_${uniq()}@test.local`, 'Set-pass-1234', t);
  if (!auth) return;
  const { token, businessId } = auth;

  const put1 = await api('/settings/general', { method: 'PUT', body: JSON.stringify({ datos: { idioma: 'es' } }) }, token, businessId);
  assert.equal(put1.status, 200, `expected 200, got ${put1.status}: ${JSON.stringify(put1.body)}`);

  const put2 = await api('/settings/general', { method: 'PUT', body: JSON.stringify({ datos: { idioma: 'en', tema: 'oscuro' } }) }, token, businessId);
  assert.equal(put2.status, 200);

  // Una sola fila (upsert, no insert doble).
  const rows = await prisma.businessSetting.findMany({ where: { businessId, locationId: null, categoria: 'general' } });
  assert.equal(rows.length, 1, 'debe existir exactamente 1 fila tras 2 PUT');

  const get = await api('/settings/general', {}, token, businessId);
  assert.deepEqual((get.body as { datos: unknown }).datos, { idioma: 'en', tema: 'oscuro' }, 'GET devuelve los últimos datos');
});

// 3.2.e — categoría reservada `config`: GET permitido, PUT 403
test('PUT /settings/config → 403; GET /settings/config permitido', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const auth = await registerAndToken(`set2_${uniq()}@test.local`, 'Set-pass-1234', t);
  if (!auth) return;
  const { token, businessId } = auth;

  const put = await api('/settings/config', { method: 'PUT', body: JSON.stringify({ datos: { hack: true } }) }, token, businessId);
  assert.equal(put.status, 403, `expected 403, got ${put.status}: ${JSON.stringify(put.body)}`);

  const get = await api('/settings/config', {}, token, businessId);
  assert.equal(get.status, 200, 'GET de config debe estar permitido');
});

// 3.2.e — datos no-objeto → 400
test('PUT /settings/:categoria con datos no-objeto → 400', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const auth = await registerAndToken(`set3_${uniq()}@test.local`, 'Set-pass-1234', t);
  if (!auth) return;
  const { token, businessId } = auth;
  const r = await api('/settings/general', { method: 'PUT', body: JSON.stringify({ datos: 'no-soy-objeto' }) }, token, businessId);
  assert.equal(r.status, 400, `expected 400, got ${r.status}`);
});
