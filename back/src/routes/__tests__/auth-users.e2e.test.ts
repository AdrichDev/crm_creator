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
//
// Runner: node --import tsx --test
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { prisma } from '../../prisma.js';
import { createClient } from '@supabase/supabase-js';

const BASE = process.env.TEST_API_URL ?? 'http://localhost:4001';
// prisma: singleton compartido (con adapter P7), importado arriba.

// Supabase URL (normalized) + service-role key. The service-role key doubles as a
// valid apikey for signInWithPassword, so the e2e can mint a REAL user access token
// using only the back's env — no anon key needed.
const SB_URL = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '').replace(/\.$/, '');
const SB_SRK = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

/** Registers a user (creates business + ADMIN membership) and returns a signed-in token. */
async function registerAndToken(email: string, password: string): Promise<{ token: string; businessId: string; userId: string }> {
  const reg = await api('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ businessName: `Biz ${crypto.randomBytes(3).toString('hex')}`, email, password, firstName: 'Own' }),
  });
  assert.equal(reg.status, 201, `register failed: ${JSON.stringify(reg.body)}`);
  const businessId = (reg.body!.business as { id: string }).id;
  const userId = (reg.body!.user as { id: string }).id;
  const sb = createClient(SB_URL, SB_SRK, { auth: { persistSession: false } });
  const { data: si, error } = await sb.auth.signInWithPassword({ email, password });
  assert.ok(!error && si.session, `signIn failed: ${error?.message}`);
  return { token: si.session.access_token, businessId, userId };
}

let backUp = false;
// Skip tests that require real Supabase credentials if placeholder is set.
// Note: other test files in the same process may set fake values on process.env.
// We check the actual .env file value to determine if real keys are present.
const PLACEHOLDER_PATTERNS = ['CHANGE_ME', 'placeholder', 'fake', 'hardening-fake'];
const _srk = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const SUPABASE_LIVE = !!_srk && !PLACEHOLDER_PATTERNS.some((p) => _srk.toLowerCase().includes(p));

const uniq = () => crypto.randomBytes(4).toString('hex');
const created = { businessIds: new Set<string>(), userIds: new Set<string>() };

async function api(path: string, init: RequestInit = {}, token?: string, businessId?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init.headers as Record<string, string>) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (businessId) headers['x-business-id'] = businessId;
  const res = await fetch(`${BASE}/api${path}`, { ...init, headers });
  const text = await res.text();
  let body: unknown = undefined;
  try { body = text ? JSON.parse(text) : undefined; } catch { body = text; }
  return { status: res.status, body: body as Record<string, unknown> | undefined };
}

before(async () => {
  try {
    const res = await fetch(`${BASE}/health`);
    backUp = res.ok;
  } catch { backUp = false; }
  if (!backUp) { console.warn(`[e2e] back no responde en ${BASE} — tests saltados`); return; }
  await fetch(`${BASE}/api/auth/__test__/reset-rate-limits`, { method: 'POST' }).catch(() => {});
});

// El register/login está limitado por IP (registerLimiter max 5/15min). Cada test
// hace varios registros, así que reseteamos los buckets antes de cada caso para que
// el límite no se filtre entre tests y produzca 429 espurios.
beforeEach(async () => {
  if (!backUp) return;
  await fetch(`${BASE}/api/auth/__test__/reset-rate-limits`, { method: 'POST' }).catch(() => {});
});

after(async () => {
  // Si el back no respondió o no hay credenciales Supabase (sin .env en el proceso de
  // test), los tests se saltaron y no hay nada que limpiar. Sin SB_URL, createClient
  // reventaría en el teardown ("supabaseUrl is required"), así que salimos antes.
  if (!backUp || !SB_URL) return;
  // Borra los auth.users de test (el ON DELETE CASCADE de crm.User.id->auth.users
  // limpia crm.User + Membership). Sin esto los auth.users se acumulan corrida a corrida.
  const cleanup = createClient(SB_URL, SB_SRK, { auth: { persistSession: false } });
  for (const id of created.userIds) await cleanup.auth.admin.deleteUser(id).catch(() => {});
  for (const id of created.businessIds) await prisma.business.delete({ where: { id } }).catch(() => {});
  await prisma.$disconnect();
});

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
// POST /auth/register — requires live Supabase (admin.createUser).
// ---------------------------------------------------------------------------
test('POST /register creates user + business in Supabase (live only)', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder — skipping live Supabase test');

  const email = `reg_${uniq()}@test.local`;
  const r = await api('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ businessName: `Biz ${uniq()}`, email, password: 'Register-pass-123', firstName: 'Reg' }),
  });
  assert.equal(r.status, 201, `register failed: ${JSON.stringify(r.body)}`);
  // No token in response (front uses SDK signInWithPassword).
  assert.ok(!('token' in r.body!), 'response should not include a token');
  assert.ok(r.body!.user, 'response should include user');
  assert.ok(r.body!.business, 'response should include business');
  created.businessIds.add((r.body!.business as { id: string }).id);
  created.userIds.add((r.body!.user as { id: string }).id);
});

// ---------------------------------------------------------------------------
// POST /users invite — Case A: linking an EXISTING user needs no email/SMTP.
// (Actual invite-email delivery for NEW users is SMTP-dependent → Phase 6.)
// ---------------------------------------------------------------------------
test('POST /users invite links an existing user (Case A — no SMTP)', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder — skipping live Supabase test');

  // Owner of business B.
  const owner = await registerAndToken(`inv_owner_${uniq()}@test.local`, 'Inv-owner-pass-1234');
  created.businessIds.add(owner.businessId); created.userIds.add(owner.userId);

  // Existing user C (already in crm.User via their own registration).
  const cEmail = `inv_c_${uniq()}@test.local`;
  const c = await registerAndToken(cEmail, 'Inv-c-pass-1234');
  created.businessIds.add(c.businessId); created.userIds.add(c.userId);

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

  const owner = await registerAndToken(`users_${uniq()}@test.local`, 'Users-list-pass-1234');
  created.businessIds.add(owner.businessId); created.userIds.add(owner.userId);

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

  const admin = await registerAndToken(`lastadmin_${uniq()}@test.local`, 'Lastadmin-pass-1234');
  created.businessIds.add(admin.businessId); created.userIds.add(admin.userId);

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

  const admin = await registerAndToken(`mgr_admin_${uniq()}@test.local`, 'Mgr-admin-pass-1234');
  created.businessIds.add(admin.businessId); created.userIds.add(admin.userId);

  const mEmail = `mgr_c_${uniq()}@test.local`;
  const c = await registerAndToken(mEmail, 'Mgr-c-pass-1234');
  created.businessIds.add(c.businessId); created.userIds.add(c.userId);

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
// POST /auth/register — duplicate email → 409 email_taken (live only).
// ---------------------------------------------------------------------------
test('register with duplicate email → 409 (live only)', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const email = `dup_${uniq()}@test.local`;
  const r1 = await api('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ businessName: `Biz ${uniq()}`, email, password: 'Dup-pass-1234', firstName: 'Dup' }),
  });
  assert.equal(r1.status, 201, `first register failed: ${JSON.stringify(r1.body)}`);
  created.businessIds.add((r1.body!.business as { id: string }).id);
  created.userIds.add((r1.body!.user as { id: string }).id);

  const r2 = await api('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ businessName: `Biz2 ${uniq()}`, email, password: 'Dup-pass-1234', firstName: 'Dup2' }),
  });
  assert.equal(r2.status, 409, `Expected 409 on duplicate, got ${r2.status}`);
  assert.equal((r2.body!.error as { code: string }).code, 'email_taken');
});

// ---------------------------------------------------------------------------
// POST /auth/register — weak password → 422.
// ---------------------------------------------------------------------------
test('register with weak password → 422', async (t) => {
  if (!backUp) return t.skip('back down');
  const r = await api('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ businessName: 'Biz', email: `weak_${uniq()}@test.local`, password: 'short', firstName: 'W' }),
  });
  assert.equal(r.status, 422);
  assert.equal((r.body!.error as { code: string }).code, 'weak_password');
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
  await fetch(`${BASE}/api/auth/__test__/reset-rate-limits`, { method: 'POST' }).catch(() => {});
  let got429 = false;
  for (let i = 0; i < 8; i++) {
    const r = await api('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: `rl_${uniq()}@test.local` }) });
    if (r.status === 429) { got429 = true; break; }
  }
  assert.ok(got429, 'expected 429 after exceeding forgot-password rate limit');
});
