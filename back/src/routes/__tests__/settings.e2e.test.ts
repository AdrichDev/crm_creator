// E2E tests: ajustes por categoría (BusinessSetting) en /settings/:categoria.
// Cubre 3.2.e: PUT hace upsert (1 fila, datos actualizados) y GET los devuelve;
// la categoría `config` (reservada al generador) rechaza PUT con 403 pero permite GET.
// Requires the back running at localhost:4001 + live Supabase credentials.
//
// Runner: node --import tsx --test
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { prisma } from '../../prisma.js';
import { createClient } from '@supabase/supabase-js';

const BASE = process.env.TEST_API_URL ?? 'http://localhost:4001';
const SB_URL = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '').replace(/\.$/, '');
const SB_SRK = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const PLACEHOLDER_PATTERNS = ['CHANGE_ME', 'placeholder', 'fake', 'hardening-fake'];
const SUPABASE_LIVE = !!SB_SRK && !PLACEHOLDER_PATTERNS.some((p) => SB_SRK.toLowerCase().includes(p));

let backUp = false;
const uniq = () => crypto.randomBytes(4).toString('hex');
const created = { businessIds: new Set<string>(), userIds: new Set<string>() };

async function api(path: string, init: RequestInit = {}, token?: string, businessId?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init.headers as Record<string, string>) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (businessId) headers['x-business-id'] = businessId;
  const res = await fetch(`${BASE}/api${path}`, { ...init, headers });
  const text = await res.text();
  let body: unknown;
  try { body = text ? JSON.parse(text) : undefined; } catch { body = text; }
  return { status: res.status, body: body as Record<string, unknown> | undefined };
}

async function registerAndToken(email: string, password: string): Promise<{ token: string; businessId: string; userId: string }> {
  const reg = await api('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ businessName: `Biz ${crypto.randomBytes(3).toString('hex')}`, email, password, firstName: 'Own' }),
  });
  assert.equal(reg.status, 201, `register failed: ${JSON.stringify(reg.body)}`);
  const businessId = (reg.body!.business as { id: string }).id;
  const userId = (reg.body!.user as { id: string }).id;
  created.businessIds.add(businessId);
  created.userIds.add(userId);
  const sb = createClient(SB_URL, SB_SRK, { auth: { persistSession: false } });
  const { data: si, error } = await sb.auth.signInWithPassword({ email, password });
  assert.ok(!error && si.session, `signIn failed: ${error?.message}`);
  return { token: si.session.access_token, businessId, userId };
}

before(async () => {
  try { backUp = (await fetch(`${BASE}/health`)).ok; } catch { backUp = false; }
  if (!backUp) console.warn(`[e2e] back no responde en ${BASE} — tests saltados`);
});
beforeEach(async () => {
  if (!backUp) return;
  await fetch(`${BASE}/api/auth/__test__/reset-rate-limits?buckets=register`, { method: 'POST' }).catch(() => {});
});
after(async () => {
  if (!backUp || !SB_URL) return;
  const cleanup = createClient(SB_URL, SB_SRK, { auth: { persistSession: false } });
  for (const id of created.userIds) await cleanup.auth.admin.deleteUser(id).catch(() => {});
  for (const id of created.businessIds) await prisma.business.delete({ where: { id } }).catch(() => {});
  await prisma.$disconnect();
});

// 3.2.e — PUT dos veces → upsert (1 fila, datos actualizados) + GET los devuelve
test('PUT /settings/:categoria dos veces → upsert (1 fila) y GET devuelve los últimos datos', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const { token, businessId } = await registerAndToken(`set1_${uniq()}@test.local`, 'Set-pass-1234');

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

  const { token, businessId } = await registerAndToken(`set2_${uniq()}@test.local`, 'Set-pass-1234');

  const put = await api('/settings/config', { method: 'PUT', body: JSON.stringify({ datos: { hack: true } }) }, token, businessId);
  assert.equal(put.status, 403, `expected 403, got ${put.status}: ${JSON.stringify(put.body)}`);

  const get = await api('/settings/config', {}, token, businessId);
  assert.equal(get.status, 200, 'GET de config debe estar permitido');
});

// 3.2.e — datos no-objeto → 400
test('PUT /settings/:categoria con datos no-objeto → 400', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const { token, businessId } = await registerAndToken(`set3_${uniq()}@test.local`, 'Set-pass-1234');
  const r = await api('/settings/general', { method: 'PUT', body: JSON.stringify({ datos: 'no-soy-objeto' }) }, token, businessId);
  assert.equal(r.status, 400, `expected 400, got ${r.status}`);
});
