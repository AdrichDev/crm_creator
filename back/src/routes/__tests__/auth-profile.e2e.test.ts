// E2E tests for crm-perfil-editable Fase A:
//  - GET /auth/me amplía (lastName, phone)
//  - PATCH /auth/profile (edita nombre/apellido/teléfono del propio usuario)
//  - POST /auth/change-password endurecido (exige oldPassword; verificación efímera)
//
// Llama a la API viva (localhost:4001). Salta si el back está caído o si
// SUPABASE_SERVICE_ROLE_KEY es placeholder. Runner: node --import tsx --test
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import {
  api, probeBack, resetRateLimits, registerAndToken, cleanup, uniq, SUPABASE_LIVE, SB_URL, SB_SRK,
} from './_shared.e2e.js';

let backUp = false;

before(async () => { backUp = await probeBack(); if (!backUp) console.warn('[e2e] back no responde — tests saltados'); });
// Resetea los contadores de rate-limit antes de cada test (este fichero registra
// varios usuarios y excedería el registerLimiter de 5/15min).
beforeEach(async () => { if (backUp) await resetRateLimits('register,changepw'); });
after(async () => { await cleanup(backUp); });

// --- PATCH /auth/profile: gating sin credenciales Supabase ---
test('PATCH /profile sin token → 401', async (t) => {
  if (!backUp) return t.skip('back down');
  const r = await api('/auth/profile', { method: 'PATCH', body: JSON.stringify({ firstName: 'X' }) });
  assert.equal(r.status, 401);
});

// --- requieren Supabase vivo ---
test('PATCH /profile actualiza nombre/apellido/teléfono del propio usuario', async (t) => {
  if (!backUp || !SUPABASE_LIVE) return t.skip('sin back o sin Supabase real');
  const auth = await registerAndToken(`prof_${uniq()}@test.local`, 'Test-Password-123', t);
  if (!auth) return;
  const { token, businessId, userId } = auth;
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
  const auth = await registerAndToken(`prof_${uniq()}@test.local`, 'Test-Password-123', t);
  if (!auth) return;
  const { token, businessId } = auth;
  const r = await api('/auth/profile', { method: 'PATCH', body: JSON.stringify({ firstName: '   ' }) }, token, businessId);
  assert.equal(r.status, 422);
});

test('PATCH /profile sin campos → 422', async (t) => {
  if (!backUp || !SUPABASE_LIVE) return t.skip('sin back o sin Supabase real');
  const auth = await registerAndToken(`prof_${uniq()}@test.local`, 'Test-Password-123', t);
  if (!auth) return;
  const { token, businessId } = auth;
  const r = await api('/auth/profile', { method: 'PATCH', body: JSON.stringify({}) }, token, businessId);
  assert.equal(r.status, 422);
});

// --- change-password endurecido ---
test('change-password con contraseña antigua incorrecta → 401 wrong_password', async (t) => {
  if (!backUp || !SUPABASE_LIVE) return t.skip('sin back o sin Supabase real');
  const auth = await registerAndToken(`pw_${uniq()}@test.local`, 'Old-Password-123', t);
  if (!auth) return;
  const { token, businessId } = auth;
  const r = await api('/auth/change-password', { method: 'POST', body: JSON.stringify({ oldPassword: 'Wrong-Password-999', newPassword: 'New-Password-456', repeatPassword: 'New-Password-456' }) }, token, businessId);
  assert.equal(r.status, 401, JSON.stringify(r.body));
  assert.equal((r.body!.error as { code: string }).code, 'wrong_password');
});

test('change-password con la antigua correcta → 204 y login con la nueva funciona', async (t) => {
  if (!backUp || !SUPABASE_LIVE) return t.skip('sin back o sin Supabase real');
  const email = `pw_${uniq()}@test.local`;
  const auth = await registerAndToken(email, 'Old-Password-123', t);
  if (!auth) return;
  const { token, businessId } = auth;
  const r = await api('/auth/change-password', { method: 'POST', body: JSON.stringify({ oldPassword: 'Old-Password-123', newPassword: 'New-Password-456', repeatPassword: 'New-Password-456' }) }, token, businessId);
  assert.equal(r.status, 204, JSON.stringify(r.body));
  const sb = createClient(SB_URL, SB_SRK, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password: 'New-Password-456' });
  assert.ok(!error && data.session, `login con nueva password falló: ${error?.message}`);
});

test('change-password con nueva débil → 422', async (t) => {
  if (!backUp || !SUPABASE_LIVE) return t.skip('sin back o sin Supabase real');
  const auth = await registerAndToken(`pw_${uniq()}@test.local`, 'Old-Password-123', t);
  if (!auth) return;
  const { token, businessId } = auth;
  const r = await api('/auth/change-password', { method: 'POST', body: JSON.stringify({ oldPassword: 'Old-Password-123', newPassword: 'weak', repeatPassword: 'weak' }) }, token, businessId);
  assert.equal(r.status, 422);
});

test('change-password con nueva != repetir → 422', async (t) => {
  if (!backUp || !SUPABASE_LIVE) return t.skip('sin back o sin Supabase real');
  const auth = await registerAndToken(`pw_${uniq()}@test.local`, 'Old-Password-123', t);
  if (!auth) return;
  const { token, businessId } = auth;
  const r = await api('/auth/change-password', { method: 'POST', body: JSON.stringify({ oldPassword: 'Old-Password-123', newPassword: 'New-Password-456', repeatPassword: 'Other-Password-789' }) }, token, businessId);
  assert.equal(r.status, 422);
});
