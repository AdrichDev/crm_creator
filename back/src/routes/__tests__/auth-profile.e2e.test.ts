// E2E tests for crm-perfil-editable Fase A:
//  - GET /auth/me amplía (lastName, phone)
//  - PATCH /auth/profile (edita nombre/apellido/teléfono del propio usuario)
//  - POST /auth/change-password endurecido (exige oldPassword; verificación efímera)
//
// Llama a la API viva (localhost:4001). Salta si el back está caído o si
// SUPABASE_SERVICE_ROLE_KEY es placeholder. Runner: node --import tsx --test
import 'dotenv/config'; // el runner de tests no pasa por src/env.ts; sin esto el cleanup de prisma no tiene DATABASE_URL
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { prisma } from '../../prisma.js';
import { createClient } from '@supabase/supabase-js';

const BASE = process.env.TEST_API_URL ?? 'http://localhost:4001';
// prisma: singleton compartido (con adapter P7), importado arriba.
const SB_URL = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '').replace(/\.$/, '');
const SB_SRK = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const PLACEHOLDER = ['CHANGE_ME', 'placeholder', 'fake'];
const SUPABASE_LIVE = !!SB_SRK && !PLACEHOLDER.some((p) => SB_SRK.toLowerCase().includes(p));
const uniq = () => crypto.randomBytes(4).toString('hex');
const created = { businessIds: new Set<string>(), userIds: new Set<string>() };
let backUp = false;

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

async function registerAndToken(email: string, password: string) {
  const reg = await api('/auth/register', { method: 'POST', body: JSON.stringify({ businessName: `Biz ${uniq()}`, email, password, firstName: 'Own' }) });
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
  if (!backUp) { console.warn(`[e2e] back no responde en ${BASE} — tests saltados`); return; }
  await fetch(`${BASE}/api/auth/__test__/reset-rate-limits?buckets=register,changepw`, { method: 'POST' }).catch(() => {});
});

// Resetea los contadores de rate-limit antes de cada test (este fichero registra
// varios usuarios y excedería el registerLimiter de 5/15min).
beforeEach(async () => {
  if (!backUp) return;
  await fetch(`${BASE}/api/auth/__test__/reset-rate-limits?buckets=register,changepw`, { method: 'POST' }).catch(() => {});
});

after(async () => {
  if (!backUp || !SB_URL) return;
  const cleanup = createClient(SB_URL, SB_SRK, { auth: { persistSession: false } });
  for (const id of created.userIds) await cleanup.auth.admin.deleteUser(id).catch((e) => console.error('[e2e cleanup]', e instanceof Error ? e.message : e));
  for (const id of created.businessIds) await prisma.business.delete({ where: { id } }).catch((e) => console.error('[e2e cleanup]', e instanceof Error ? e.message : e));
  await prisma.$disconnect();
});

// --- PATCH /auth/profile: gating sin credenciales Supabase ---
test('PATCH /profile sin token → 401', async (t) => {
  if (!backUp) return t.skip('back down');
  const r = await api('/auth/profile', { method: 'PATCH', body: JSON.stringify({ firstName: 'X' }) });
  assert.equal(r.status, 401);
});

// --- requieren Supabase vivo ---
test('PATCH /profile actualiza nombre/apellido/teléfono del propio usuario', async (t) => {
  if (!backUp || !SUPABASE_LIVE) return t.skip('sin back o sin Supabase real');
  const { token, businessId, userId } = await registerAndToken(`prof_${uniq()}@test.local`, 'Test-Password-123');
  const r = await api('/auth/profile', { method: 'PATCH', body: JSON.stringify({ firstName: 'Ana', lastName: 'García', phone: '600111222', id: 'otro-id-debe-ignorarse' }) }, token, businessId);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const u = r.body!.user as { id: string; firstName: string; lastName: string; phone: string };
  assert.equal(u.firstName, 'Ana');
  assert.equal(u.lastName, 'García');
  assert.equal(u.phone, '600111222');
  assert.equal(u.id, userId, 'debe seguir siendo el usuario de la sesión, no el id del body');
  // /me refleja los nuevos campos
  const me = await api('/auth/me', {}, token, businessId);
  const meUser = me.body!.user as { lastName: string; phone: string };
  assert.equal(meUser.lastName, 'García');
  assert.equal(meUser.phone, '600111222');
});

test('PATCH /profile con firstName vacío → 422', async (t) => {
  if (!backUp || !SUPABASE_LIVE) return t.skip('sin back o sin Supabase real');
  const { token, businessId } = await registerAndToken(`prof_${uniq()}@test.local`, 'Test-Password-123');
  const r = await api('/auth/profile', { method: 'PATCH', body: JSON.stringify({ firstName: '   ' }) }, token, businessId);
  assert.equal(r.status, 422);
});

test('PATCH /profile sin campos → 422', async (t) => {
  if (!backUp || !SUPABASE_LIVE) return t.skip('sin back o sin Supabase real');
  const { token, businessId } = await registerAndToken(`prof_${uniq()}@test.local`, 'Test-Password-123');
  const r = await api('/auth/profile', { method: 'PATCH', body: JSON.stringify({}) }, token, businessId);
  assert.equal(r.status, 422);
});

// --- change-password endurecido ---
test('change-password con contraseña antigua incorrecta → 401 wrong_password', async (t) => {
  if (!backUp || !SUPABASE_LIVE) return t.skip('sin back o sin Supabase real');
  const { token, businessId } = await registerAndToken(`pw_${uniq()}@test.local`, 'Old-Password-123');
  const r = await api('/auth/change-password', { method: 'POST', body: JSON.stringify({ oldPassword: 'Wrong-Password-999', newPassword: 'New-Password-456', repeatPassword: 'New-Password-456' }) }, token, businessId);
  assert.equal(r.status, 401, JSON.stringify(r.body));
  assert.equal((r.body!.error as { code: string }).code, 'wrong_password');
});

test('change-password con la antigua correcta → 204 y login con la nueva funciona', async (t) => {
  if (!backUp || !SUPABASE_LIVE) return t.skip('sin back o sin Supabase real');
  const email = `pw_${uniq()}@test.local`;
  const { token, businessId } = await registerAndToken(email, 'Old-Password-123');
  const r = await api('/auth/change-password', { method: 'POST', body: JSON.stringify({ oldPassword: 'Old-Password-123', newPassword: 'New-Password-456', repeatPassword: 'New-Password-456' }) }, token, businessId);
  assert.equal(r.status, 204, JSON.stringify(r.body));
  const sb = createClient(SB_URL, SB_SRK, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password: 'New-Password-456' });
  assert.ok(!error && data.session, `login con nueva password falló: ${error?.message}`);
});

test('change-password con nueva débil → 422', async (t) => {
  if (!backUp || !SUPABASE_LIVE) return t.skip('sin back o sin Supabase real');
  const { token, businessId } = await registerAndToken(`pw_${uniq()}@test.local`, 'Old-Password-123');
  const r = await api('/auth/change-password', { method: 'POST', body: JSON.stringify({ oldPassword: 'Old-Password-123', newPassword: 'weak', repeatPassword: 'weak' }) }, token, businessId);
  assert.equal(r.status, 422);
});

test('change-password con nueva != repetir → 422', async (t) => {
  if (!backUp || !SUPABASE_LIVE) return t.skip('sin back o sin Supabase real');
  const { token, businessId } = await registerAndToken(`pw_${uniq()}@test.local`, 'Old-Password-123');
  const r = await api('/auth/change-password', { method: 'POST', body: JSON.stringify({ oldPassword: 'Old-Password-123', newPassword: 'New-Password-456', repeatPassword: 'Other-Password-789' }) }, token, businessId);
  assert.equal(r.status, 422);
});
