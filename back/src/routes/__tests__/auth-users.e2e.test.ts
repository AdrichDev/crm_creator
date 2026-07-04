// E2E tests for the CRM back auth + users routes with Supabase Auth.
// These tests call the live API (localhost:4001) but skip if the server is down
// or if SUPABASE_SERVICE_ROLE_KEY is a placeholder.
//
// Changed flows vs old tests:
// - Login endpoint now returns 410 (front uses Supabase SDK signInWithPassword).
// - Sessions are managed by Supabase; no AuthToken table.
// - Invite: admin.inviteUserByEmail (Supabase email); no AuthToken row.
// - Password change: admin.updateUserById + admin.signOut(uid, 'others').
// - GET /users: no passwordHash or status fields in response.
// - POST /auth/register was retired (crm-retirar-auth-register): the fixture
//   business is now created by direct insertion via registerAndToken/_shared.e2e.ts.
//
// Runner: node --import tsx --test
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  api, probeBack, resetRateLimits, registerAndToken, cleanup, uniq, SUPABASE_LIVE,
} from './_shared.e2e.js';

let backUp = false;

before(async () => { backUp = await probeBack(); if (!backUp) console.warn('[e2e] back no responde — tests saltados'); });
// El register/login está limitado por IP (registerLimiter max 5/15min). Cada test
// hace varios registros, así que reseteamos los buckets antes de cada caso para que
// el límite no se filtre entre tests y produzca 429 espurios.
beforeEach(async () => { if (backUp) await resetRateLimits('register'); });
after(async () => { await cleanup(backUp); });

// ---------------------------------------------------------------------------
// POST /auth/login returns 410 Gone (front uses Supabase SDK).
// ---------------------------------------------------------------------------
test('POST /login returns 410 Gone (Supabase SDK flow)', async (t) => {
  if (!backUp) return t.skip('back down');
  const r = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'any@test.local', password: 'any' }),
  });
  assert.equal(r.status, 410, `Expected 410, got ${r.status}: ${JSON.stringify(r.body)}`);
  assert.equal((r.body!.error as { code: string }).code, 'login_moved');
});

// ---------------------------------------------------------------------------
// Regresión (crm-retirar-auth-register): la ruta de autoregistro directo ya no
// existe — no debe volver a crear un negocio sin tenantId por esta vía. El
// router de auth cae en el gate `authenticate` global antes de llegar al
// notFound handler (falls through, ver design.md de crm-retirar-auth-register),
// de ahí 401 y no 404 — comportamiento aceptado, no un bug. Lo que este test
// protege es que NUNCA vuelva a responder 2xx (i.e. que nunca vuelva a crear
// un Business sin tenant).
// ---------------------------------------------------------------------------
test('POST /auth/register (retired) never succeeds — no orphan business created', async (t) => {
  if (!backUp) return t.skip('back down');
  const r = await api('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      businessName: `ShouldNotExist_${uniq()}`,
      email: `orphan_${uniq()}@test.local`,
      password: 'Retired-pass-1234!',
      firstName: 'Ghost',
    }),
  });
  assert.equal(r.status, 401, `Expected 401 (retired route falls through to auth gate), got ${r.status}: ${JSON.stringify(r.body)}`);
});

// ---------------------------------------------------------------------------
// POST /auth/logout returns 200 with instruction (Supabase SDK flow).
// ---------------------------------------------------------------------------
test('POST /logout returns 200 with SDK instruction', async (t) => {
  if (!backUp) return t.skip('back down');
  const r = await api('/auth/logout', { method: 'POST' });
  assert.equal(r.status, 200);
  assert.ok(typeof r.body!.message === 'string');
});

// ---------------------------------------------------------------------------
// POST /auth/forgot-password always returns 200 (anti-enumeration), even with
// placeholder Supabase keys (the internal call is fire-and-forget).
// ---------------------------------------------------------------------------
test('forgot-password always responds 200 (anti-enumeration)', async (t) => {
  if (!backUp) return t.skip('back down');
  const r1 = await api('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: `real_${uniq()}@test.local` }) });
  const r2 = await api('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: `ghost_${uniq()}@test.local` }) });
  assert.equal(r1.status, 200);
  assert.equal(r2.status, 200);
  assert.deepEqual(r1.body, r2.body);
});

// ---------------------------------------------------------------------------
// GET /auth/me without token returns 401.
// ---------------------------------------------------------------------------
test('GET /me without token → 401 no_token', async (t) => {
  if (!backUp) return t.skip('back down');
  const r = await api('/auth/me');
  assert.equal(r.status, 401);
  assert.equal((r.body!.error as { code: string }).code, 'no_token');
});

// ---------------------------------------------------------------------------
// GET /auth/me with invalid token → 401.
// ---------------------------------------------------------------------------
test('GET /me with invalid token → 401 invalid_token', async (t) => {
  if (!backUp) return t.skip('back down');
  const r = await api('/auth/me', {}, 'not-a-real-token');
  assert.equal(r.status, 401);
  assert.equal((r.body!.error as { code: string }).code, 'invalid_token');
});

// ---------------------------------------------------------------------------
// POST /users invite — Case A: linking an EXISTING user needs no email/SMTP.
// (Actual invite-email delivery for NEW users is SMTP-dependent → Phase 6.)
// ---------------------------------------------------------------------------
test('POST /users invite links an existing user (Case A — no SMTP)', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder — skipping live Supabase test');

  // Owner of business B.
  const owner = await registerAndToken(`inv_owner_${uniq()}@test.local`, 'Inv-owner-pass-1234', t);
  if (!owner) return;

  // Existing user C (already in crm.User via their own registration).
  const cEmail = `inv_c_${uniq()}@test.local`;
  const c = await registerAndToken(cEmail, 'Inv-c-pass-1234', t);
  if (!c) return;

  // Owner invites C to business B → Case A: links via Membership, no email sent.
  const r = await api('/users', {
    method: 'POST',
    body: JSON.stringify({ email: cEmail, firstName: 'Cee', role: 'EMPLOYEE' }),
  }, owner.token, owner.businessId);

  assert.equal(r.status, 201, `invite failed: ${JSON.stringify(r.body)}`);
  assert.equal((r.body as { linked: boolean }).linked, true);
  assert.equal((r.body as { emailSent: boolean }).emailSent, false);
});

// ---------------------------------------------------------------------------
// GET /users does not include passwordHash or status (fields removed from schema).
// ---------------------------------------------------------------------------
test('GET /users never includes passwordHash or status fields', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('needs live Supabase to get a valid token');

  const owner = await registerAndToken(`users_${uniq()}@test.local`, 'Users-list-pass-1234', t);
  if (!owner) return;

  const r = await api('/users', {}, owner.token, owner.businessId);
  assert.equal(r.status, 200, `GET /users failed: ${JSON.stringify(r.body)}`);
  const rows = r.body as unknown as Array<Record<string, unknown>>;
  assert.ok(Array.isArray(rows) && rows.length >= 1, 'expected at least the owner');
  for (const u of rows) {
    assert.ok(!('passwordHash' in u), 'response must not include passwordHash');
    assert.ok(!('status' in u), 'response must not include status');
    assert.ok(u.id && u.email, 'each row has id + email');
  }
});

// ---------------------------------------------------------------------------
// Last-admin protection: the sole ADMIN cannot demote or delete themselves and
// leave the business without administrators. No "owner" concept — all admins
// are equal; the only guard is "keep at least one admin" + "no self-delete".
// ---------------------------------------------------------------------------
test('sole admin cannot demote self (409 last_admin) nor delete self (403 self_delete)', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('needs live Supabase to get a valid token');

  const admin = await registerAndToken(`lastadmin_${uniq()}@test.local`, 'Lastadmin-pass-1234', t);
  if (!admin) return;

  // Demoting the only admin would leave the business without admins → 409.
  const patch = await api(`/users/${admin.userId}`, {
    method: 'PATCH', body: JSON.stringify({ role: 'EMPLOYEE' }),
  }, admin.token, admin.businessId);
  assert.equal(patch.status, 409, `expected 409, got ${JSON.stringify(patch.body)}`);
  assert.equal((patch.body!.error as { code: string }).code, 'last_admin');

  // Deleting yourself is blocked regardless.
  const del = await api(`/users/${admin.userId}`, { method: 'DELETE' }, admin.token, admin.businessId);
  assert.equal(del.status, 403, `expected 403, got ${JSON.stringify(del.body)}`);
  assert.equal((del.body!.error as { code: string }).code, 'self_delete');
});

// ---------------------------------------------------------------------------
// Admin can assign MANAGER (Case A link existing user — no SMTP).
// ---------------------------------------------------------------------------
test('POST /users assigns MANAGER (Case A)', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('needs live Supabase');

  const admin = await registerAndToken(`mgr_admin_${uniq()}@test.local`, 'Mgr-admin-pass-1234', t);
  if (!admin) return;

  const mEmail = `mgr_c_${uniq()}@test.local`;
  const c = await registerAndToken(mEmail, 'Mgr-c-pass-1234', t);
  if (!c) return;

  const r = await api('/users', {
    method: 'POST', body: JSON.stringify({ email: mEmail, firstName: 'Mgr', role: 'MANAGER' }),
  }, admin.token, admin.businessId);
  assert.equal(r.status, 201, `manager invite failed: ${JSON.stringify(r.body)}`);
  assert.equal((r.body as { role: string }).role, 'MANAGER');
  assert.equal((r.body as { linked: boolean }).linked, true);

  const list = await api('/users', {}, admin.token, admin.businessId);
  const rows = list.body as unknown as Array<{ id: string; role: string }>;
  assert.equal(rows.find((x) => x.id === c.userId)?.role, 'MANAGER', 'manager row has MANAGER role');
});

// ---------------------------------------------------------------------------
// POST /auth/change-password without auth → 401.
// ---------------------------------------------------------------------------
test('change-password without auth → 401', async (t) => {
  if (!backUp) return t.skip('back down');
  const r = await api('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ newPassword: 'new-pass-123456', repeatPassword: 'new-pass-123456' }),
  });
  assert.equal(r.status, 401);
});

// ---------------------------------------------------------------------------
// Rate limiter: forgot-password blocks after limit.
// ---------------------------------------------------------------------------
test('rate limit on forgot-password (max 5/window)', async (t) => {
  if (!backUp) return t.skip('back down');
  // Reset counters first to isolate from other tests running in the same process.
  await resetRateLimits();
  let got429 = false;
  for (let i = 0; i < 8; i++) {
    const r = await api('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: `rl_${uniq()}@test.local` }) });
    if (r.status === 429) { got429 = true; break; }
  }
  assert.ok(got429, 'expected 429 after exceeding forgot-password rate limit');
});
