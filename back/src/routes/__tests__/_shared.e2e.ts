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
//
// dotenv: el proceso de node:test NO pasa por src/env.ts, así que sin esto el
// cleanup de prisma lanzaría sin DATABASE_URL y dejaría filas huérfanas en la BD.
import 'dotenv/config';
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

// Guard anti-produccion: los e2e crean usuarios auth REALES (admin.createUser).
// Correrlos contra un proyecto remoto contamina MAU y egress del org. El target
// previsto es Supabase local (supabase start). Abortamos al importar si la URL no
// es local, salvo opt-in explicito E2E_ALLOW_REMOTE=1. Ver README "e2e local".
const IS_LOCAL_SB = /^(https?:\/\/)?(127\.0\.0\.1|localhost|host\.docker\.internal)(:\d+)?(\/|$)/.test(SB_URL);
if (SUPABASE_LIVE && SB_URL && !IS_LOCAL_SB && process.env.E2E_ALLOW_REMOTE !== '1') {
  throw new Error(
    `[e2e guard] SUPABASE_URL apunta a un proyecto remoto (${SB_URL}). Los e2e crean ` +
    `usuarios auth reales y contaminan MAU/egress. Usa Supabase local (supabase start) ` +
    `o exporta E2E_ALLOW_REMOTE=1 para forzarlo conscientemente.`,
  );
}

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

// Admin client used only to create/compensate auth.users entries by direct
// insertion (no HTTP call to the retired POST /auth/register endpoint).
const sbAdmin = () => createClient(SB_URL, SB_SRK, { auth: { persistSession: false } });

/**
 * Registers a fresh business + ADMIN owner and returns a signed-in token.
 * Ids are tracked for central cleanup. Returns null (and skips the test) when
 * Supabase throttles either the createUser call or the signIn.
 * Use for tests that NEED an isolated business (cross-tenant, auth mutations).
 *
 * Creates the business by DIRECT insertion (Supabase admin.createUser + Prisma),
 * replicating the transaction the retired `POST /auth/register` endpoint used to
 * run, without going through HTTP. See crm-retirar-auth-register.
 */
export async function registerAndToken(email: string, password: string, t: TestContext): Promise<Auth | null> {
  const businessName = `Biz ${uniq()}`;
  const admin = sbAdmin();
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { firstName: 'Own', businessName, brandPrimary: '#1b431c' },
  });
  if (authError) {
    // Rate-limit here means an auth-provider throttle — skip, don't fail (same policy as signInWithRetry).
    if (isRateLimit(authError.message)) { t.skip('rate limit en createUser'); return null; }
    assert.fail(`createUser failed: ${authError.message}`);
  }
  const supabaseUserId = authData.user.id;

  // Business + Location + crm.User profile + Membership, in one tx — same shape as
  // the retired endpoint's transaction. SAGA compensation: if the tx fails, delete
  // the just-created auth.users entry so the email is not orphaned.
  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      const business = await tx.business.create({ data: { nombre: businessName, vertical: 'custom' } });
      await tx.location.create({ data: { businessId: business.id, nombre: businessName } });
      const user = await tx.user.create({ data: { id: supabaseUserId, email, firstName: 'Own' } });
      await tx.membership.create({ data: { userId: user.id, businessId: business.id, role: 'ADMIN' } });
      return { business, user };
    });
  } catch (e) {
    await admin.auth.admin.deleteUser(supabaseUserId).catch(() => { /* best-effort compensation */ });
    throw e;
  }

  tracked.businessIds.add(result.business.id);
  tracked.userIds.add(result.user.id);
  const token = await signInWithRetry(email, password, t);
  if (!token) return null;
  return { token, businessId: result.business.id, userId: result.user.id };
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
  for (const id of tracked.userIds) await sb.auth.admin.deleteUser(id).catch((e) => console.error('[e2e cleanup]', e instanceof Error ? e.message : e));
  for (const id of tracked.businessIds) await prisma.business.delete({ where: { id } }).catch((e) => console.error('[e2e cleanup]', e instanceof Error ? e.message : e));
  tracked.userIds.clear();
  tracked.businessIds.clear();
  await prisma.$disconnect();
}
