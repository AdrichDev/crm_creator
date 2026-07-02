// Shared helpers for the live e2e suite (routes/__tests__/*.e2e.test.ts).
//
// This file is intentionally named `_shared.e2e.ts` (NOT `*.test.ts`) so the
// test glob `src/**/*.test.ts` never picks it up as a test file.
//
// WHY THIS EXISTS: every e2e file used to duplicate its own `api()` +
// `registerAndToken()` and each test did a REAL Supabase register + signIn.
// Running the whole suite fired a burst of auth calls at Supabase and tripped
// its per-project "Request rate limit reached", turning infra throttling into
// cascading false negatives. This module centralizes those helpers and adds:
//   - getSharedAuth(): ONE owner per process (node:test isolates each file in
//     its own process, so this is effectively one register+signIn per file
//     instead of one per test) for single-tenant files.
//   - signInWithRetry(): exponential backoff on "rate limit" only, then an
//     explicit t.skip() instead of a hard failure — an honest skip beats a
//     false negative caused by infra.
//
// Runner: node --import tsx --test
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { TestContext } from 'node:test';
import { prisma } from '../../prisma.js';
import { createClient } from '@supabase/supabase-js';

export const BASE = process.env.TEST_API_URL ?? 'http://localhost:4001';
// Supabase URL (normalized) + service-role key. The service-role key doubles as
// a valid apikey for signInWithPassword, so the e2e can mint a REAL user access
// token using only the back's env — no anon key needed.
export const SB_URL = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '').replace(/\.$/, '');
export const SB_SRK = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const PLACEHOLDER_PATTERNS = ['CHANGE_ME', 'placeholder', 'fake', 'hardening-fake'];
// Live Supabase tests are gated behind a non-placeholder SUPABASE_SERVICE_ROLE_KEY.
export const SUPABASE_LIVE = !!SB_SRK && !PLACEHOLDER_PATTERNS.some((p) => SB_SRK.toLowerCase().includes(p));

export const uniq = (): string => crypto.randomBytes(4).toString('hex');

export type Auth = { token: string; businessId: string; userId: string };
export type ApiResult = { status: number; body: Record<string, unknown> | undefined };

// Ids created by the helpers, cleaned up centrally in cleanup().
const tracked = { businessIds: new Set<string>(), userIds: new Set<string>() };

export async function api(path: string, init: RequestInit = {}, token?: string, businessId?: string): Promise<ApiResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init.headers as Record<string, string>) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (businessId) headers['x-business-id'] = businessId;
  const res = await fetch(`${BASE}/api${path}`, { ...init, headers });
  const text = await res.text();
  let body: unknown;
  try { body = text ? JSON.parse(text) : undefined; } catch { body = text; }
  return { status: res.status, body: body as Record<string, unknown> | undefined };
}

/** Health probe. Returns true if the back answers /health with 2xx. */
export async function probeBack(): Promise<boolean> {
  try { return (await fetch(`${BASE}/health`)).ok; } catch { return false; }
}

/** Resets the back's express rate-limit buckets so per-IP limits don't leak across tests. */
export async function resetRateLimits(buckets?: string): Promise<void> {
  const q = buckets ? `?buckets=${buckets}` : '';
  await fetch(`${BASE}/api/auth/__test__/reset-rate-limits${q}`, { method: 'POST' }).catch(() => {});
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const isRateLimit = (msg?: string | null): boolean => !!msg && /rate limit/i.test(msg);
// Backoff schedule for Supabase auth rate limits (3 retries after the first try).
const RATE_LIMIT_BACKOFF_MS = [2000, 8000, 20000];

/**
 * Signs a user in and returns a real access token.
 * - On a "rate limit" error: retries with exponential backoff (2s/8s/20s).
 * - If it exhausts the retries: t.skip('Supabase rate limit') + returns null
 *   (an explicit skip is honest; failing on infra throttling is a false negative).
 * - On any OTHER error: hard assert (a real bug must surface loudly).
 */
export async function signInWithRetry(email: string, password: string, t: TestContext): Promise<string | null> {
  const sb = createClient(SB_URL, SB_SRK, { auth: { persistSession: false } });
  let lastErr: string | undefined;
  for (let attempt = 0; attempt <= RATE_LIMIT_BACKOFF_MS.length; attempt++) {
    if (attempt > 0) await sleep(RATE_LIMIT_BACKOFF_MS[attempt - 1]);
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (!error && data.session) return data.session.access_token;
    lastErr = error?.message ?? undefined;
    if (!isRateLimit(lastErr)) assert.fail(`signIn failed: ${lastErr}`);
  }
  t.skip(`Supabase rate limit tras ${RATE_LIMIT_BACKOFF_MS.length} reintentos`);
  return null;
}

/**
 * Registers a fresh business + ADMIN owner and returns a signed-in token.
 * Ids are tracked for central cleanup. Returns null (and skips the test) when
 * Supabase throttles either the register or the signIn.
 * Use for tests that NEED an isolated business (cross-tenant, auth mutations).
 */
export async function registerAndToken(email: string, password: string, t: TestContext): Promise<Auth | null> {
  const reg = await api('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ businessName: `Biz ${uniq()}`, email, password, firstName: 'Own' }),
  });
  // 429 here means an auth rate limit (express bucket or Supabase createUser) — skip, don't fail.
  if (reg.status === 429) { t.skip('rate limit en register'); return null; }
  assert.equal(reg.status, 201, `register failed: ${JSON.stringify(reg.body)}`);
  const businessId = (reg.body!.business as { id: string }).id;
  const userId = (reg.body!.user as { id: string }).id;
  tracked.businessIds.add(businessId);
  tracked.userIds.add(userId);
  const token = await signInWithRetry(email, password, t);
  if (!token) return null;
  return { token, businessId, userId };
}

// One owner per process. node:test runs each file in its own process, so this
// caches to a single register+signIn per file (not truly global). Only safe for
// single-tenant files whose tests never mutate the owner's password/role and
// never assert business-wide row counts across tests.
let sharedAuthPromise: Promise<Auth | null> | null = null;

/**
 * Returns a process-cached owner {token, businessId, userId}, registering it on
 * first use. If registration was throttled (null), the cache is cleared so a
 * later test can retry instead of every test inheriting one bad attempt.
 */
export async function getSharedAuth(t: TestContext): Promise<Auth | null> {
  if (!sharedAuthPromise) {
    sharedAuthPromise = registerAndToken(`shared_owner_${uniq()}@test.local`, 'Shared-owner-1234', t);
  }
  const auth = await sharedAuthPromise;
  if (!auth) sharedAuthPromise = null; // allow a later test to retry the registration
  return auth;
}

/**
 * Deletes every auth.user created by the helpers (cascade cleans crm.User +
 * Membership + Customer) and every tracked business, then disconnects prisma.
 * Call from each file's after() hook. No-op when the back was down or SB_URL is
 * absent (createClient would throw "supabaseUrl is required").
 */
export async function cleanup(backUp: boolean): Promise<void> {
  sharedAuthPromise = null;
  if (!backUp || !SB_URL) { tracked.userIds.clear(); tracked.businessIds.clear(); return; }
  const sb = createClient(SB_URL, SB_SRK, { auth: { persistSession: false } });
  for (const id of tracked.userIds) await sb.auth.admin.deleteUser(id).catch(() => {});
  for (const id of tracked.businessIds) await prisma.business.delete({ where: { id } }).catch(() => {});
  tracked.userIds.clear();
  tracked.businessIds.clear();
  await prisma.$disconnect();
}
