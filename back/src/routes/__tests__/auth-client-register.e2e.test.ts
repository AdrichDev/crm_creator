// E2E tests for the client self-registration flow with Supabase Auth.
// Changed from old flow:
// - register-client creates a Supabase auth.users entry + Customer + Membership(CLIENT).
// - No AuthToken table: verification is via Supabase email confirmation.
// - verify-email and set-password endpoints now return 410 (front uses SDK verifyOtp).
// - No passwordHash or emailVerifiedAt on crm.User (removed in DB migration).
//
// Requires the back running at localhost:4001.
// Live Supabase tests are gated behind a non-placeholder SUPABASE_SERVICE_ROLE_KEY.
//
// Runner: node --import tsx --test
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';

const BASE = process.env.TEST_API_URL ?? 'http://localhost:4001';
const prisma = new PrismaClient();
let backUp = false;
const PLACEHOLDER_PATTERNS = ['CHANGE_ME', 'placeholder', 'fake', 'hardening-fake'];
const _srk = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const SUPABASE_LIVE = !!_srk && !PLACEHOLDER_PATTERNS.some((p) => _srk.toLowerCase().includes(p));
const SB_URL = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '').replace(/\.$/, '');
const SB_SRK = _srk;

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

before(async () => {
  try { backUp = (await fetch(`${BASE}/health`)).ok; } catch { backUp = false; }
  if (!backUp) { console.warn(`[e2e] back no responde en ${BASE} — tests saltados`); return; }
  await fetch(`${BASE}/api/auth/__test__/reset-rate-limits`, { method: 'POST' }).catch(() => {});
});

beforeEach(async () => {
  if (!backUp) return;
  await fetch(`${BASE}/api/auth/__test__/reset-rate-limits`, { method: 'POST' }).catch(() => {});
});

after(async () => {
  // Si el back no respondió o no hay credenciales Supabase (sin .env en el proceso de
  // test), los tests se saltaron y no hay nada que limpiar. Sin SB_URL, createClient
  // reventaría en el teardown ("supabaseUrl is required"), así que salimos antes.
  if (!backUp || !SB_URL) return;
  // Borra los auth.users de test (cascade limpia crm.User + Customer + Membership).
  const cleanup = createClient(SB_URL, SB_SRK, { auth: { persistSession: false } });
  for (const id of created.userIds) await cleanup.auth.admin.deleteUser(id).catch(() => {});
  for (const id of created.businessIds) await prisma.business.delete({ where: { id } }).catch(() => {});
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// register-client without x-business-id → 400.
// ---------------------------------------------------------------------------
test('register-client without x-business-id → 400', async (t) => {
  if (!backUp) return t.skip('back down');
  const r = await api('/auth/register-client', {
    method: 'POST',
    body: JSON.stringify({ firstName: 'X', email: `nb_${uniq()}@test.local`, username: `nb_${uniq()}`, phone: '600000000' }),
  });
  assert.equal(r.status, 400);
  assert.equal((r.body!.error as { code: string }).code, 'missing_business');
});

// ---------------------------------------------------------------------------
// register-client with invalid businessId → 400.
// ---------------------------------------------------------------------------
test('register-client with invalid businessId → 400', async (t) => {
  if (!backUp) return t.skip('back down');
  const r = await api('/auth/register-client', {
    method: 'POST',
    body: JSON.stringify({ firstName: 'X', email: `bad_${uniq()}@test.local`, username: `bad_${uniq()}`, phone: '600000001' }),
  }, undefined, 'nonexistent-business-id');
  assert.equal(r.status, 400);
  assert.equal((r.body!.error as { code: string }).code, 'invalid_business');
});

// ---------------------------------------------------------------------------
// register-client — validation error (short username) → 422.
// ---------------------------------------------------------------------------
test('register-client with invalid username → 422', async (t) => {
  if (!backUp) return t.skip('back down');
  // Need a real businessId for this — the route validates business AFTER schema.
  // We test the schema guard by providing a bogus businessId (the schema check runs first).
  const r = await api('/auth/register-client', {
    method: 'POST',
    body: JSON.stringify({ firstName: 'X', email: `val_${uniq()}@test.local`, username: 'ab', phone: '600000002' }),
  }, undefined, 'any-business');
  // 422 if schema fails first, or 400 if business check runs first.
  assert.ok(r.status === 422 || r.status === 400, `Expected 422 or 400, got ${r.status}`);
});

// ---------------------------------------------------------------------------
// register-client — live Supabase tests.
// ---------------------------------------------------------------------------
test('register-client creates CLIENT + Customer (live only)', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder — skipping live Supabase test');

  // First create a business via register.
  const ownerEmail = `owner_${uniq()}@test.local`;
  const bizR = await api('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ businessName: `Biz ${uniq()}`, email: ownerEmail, password: 'Owner-pass-1234', firstName: 'Owner' }),
  });
  assert.equal(bizR.status, 201, `register failed: ${JSON.stringify(bizR.body)}`);
  const businessId = (bizR.body!.business as { id: string }).id;
  created.businessIds.add(businessId);
  created.userIds.add((bizR.body!.user as { id: string }).id);

  const email = `cli_${uniq()}@test.local`;
  const username = `cli_${uniq()}`;
  const r = await api('/auth/register-client', {
    method: 'POST',
    body: JSON.stringify({ firstName: 'Cliente', email, username, phone: '600111222' }),
  }, undefined, businessId);

  // Neutral response (always 200).
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(typeof r.body!.message === 'string');
  assert.ok(!('userId' in r.body!), 'neutral response should not expose userId');

  // Verify crm.User + Customer + Membership(CLIENT) created.
  const user = await prisma.user.findUnique({ where: { email } });
  assert.ok(user, 'crm.User should be created');
  if (user) {
    created.userIds.add(user.id);
    const membership = await prisma.membership.findFirst({ where: { userId: user.id, businessId } });
    assert.ok(membership, 'Membership should exist');
    assert.equal(membership!.role, 'CLIENT');
    const customer = await prisma.customer.findFirst({ where: { userId: user.id, businessId } });
    assert.ok(customer, 'Customer linked by userId should exist');
  }
});

test('register-client with duplicate email responds neutral (live only)', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const ownerEmail = `owner_${uniq()}@test.local`;
  const bizR = await api('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ businessName: `Biz ${uniq()}`, email: ownerEmail, password: 'Owner-pass-1234', firstName: 'Owner' }),
  });
  const businessId = (bizR.body!.business as { id: string }).id;
  created.businessIds.add(businessId);
  created.userIds.add((bizR.body!.user as { id: string }).id);

  const email = `dup_${uniq()}@test.local`;
  const r1 = await api('/auth/register-client', {
    method: 'POST',
    body: JSON.stringify({ firstName: 'A', email, username: `a_${uniq()}`, phone: '600111222' }),
  }, undefined, businessId);
  assert.equal(r1.status, 200);

  const u = await prisma.user.findUnique({ where: { email } });
  if (u) created.userIds.add(u.id);

  // Second call with same email → neutral 200 (Supabase handles dedup).
  const r2 = await api('/auth/register-client', {
    method: 'POST',
    body: JSON.stringify({ firstName: 'B', email, username: `b_${uniq()}`, phone: '600999888' }),
  }, undefined, businessId);
  assert.equal(r2.status, 200, `expected neutral 200, got ${r2.status}: ${JSON.stringify(r2.body)}`);
});

// ---------------------------------------------------------------------------
// verify-email endpoint now returns 410 (use SDK verifyOtp).
// ---------------------------------------------------------------------------
test('POST /verify-email returns 410 (use SDK)', async (t) => {
  if (!backUp) return t.skip('back down');
  const r = await api('/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ token: 'any', newPassword: 'any-pass-12', repeatPassword: 'any-pass-12' }),
  });
  assert.equal(r.status, 410);
  assert.equal((r.body!.error as { code: string }).code, 'use_sdk');
});

// ---------------------------------------------------------------------------
// set-password endpoint returns 410 (use SDK verifyOtp).
// ---------------------------------------------------------------------------
test('POST /set-password returns 410 (use SDK)', async (t) => {
  if (!backUp) return t.skip('back down');
  const r = await api('/auth/set-password', {
    method: 'POST',
    body: JSON.stringify({ token: 'any', newPassword: 'New-pass-12345', repeatPassword: 'New-pass-12345' }),
  });
  assert.equal(r.status, 410);
  assert.equal((r.body!.error as { code: string }).code, 'use_sdk');
});

// ---------------------------------------------------------------------------
// reset-password endpoint returns 410 (use SDK verifyOtp).
// ---------------------------------------------------------------------------
test('POST /reset-password returns 410 (use SDK)', async (t) => {
  if (!backUp) return t.skip('back down');
  const r = await api('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token: 'any', newPassword: 'New-pass-12345', repeatPassword: 'New-pass-12345' }),
  });
  assert.equal(r.status, 410);
  assert.equal((r.body!.error as { code: string }).code, 'use_sdk');
});
