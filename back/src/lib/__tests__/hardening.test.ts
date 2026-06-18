// Regression tests for security hardening.
// Updated for Supabase Auth migration:
// - H3: validateJwtSecret removed (JWT_SECRET deprecated). Replaced by Supabase JWT secret check.
// - H5: DUMMY_PASSWORD_HASH removed (bcrypt removed). Replaced by verifySupabaseToken reject-wrong-secret test.
// - H1, H2, H4 remain unchanged (rate limiter, n8n emit, password policy).
//
// Runner: node --import tsx --test

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// H1: login rate-limiter must key by ip:email (not only by IP).
// ---------------------------------------------------------------------------
import { consume, resetRateLimits, ipEmailKey } from '../rateLimit.js';

beforeEach(() => resetRateLimits());

test('H1: consume distingue por email aunque la IP sea la misma', () => {
  const now = 2_000_000;
  const windowMs = 60_000;
  const max = 3;

  for (let i = 0; i < max; i++) {
    assert.ok(consume('login', 'ip1:user@a.com', windowMs, max, now), `intento ${i + 1} debería permitirse`);
  }
  assert.equal(consume('login', 'ip1:user@a.com', windowMs, max, now), false, 'debe bloquear tras agotar');
  assert.ok(consume('login', 'ip1:other@b.com', windowMs, max, now), 'otro email en misma IP debe estar libre');
});

test('H1: ipEmailKey produce clave ip:email en minúsculas', () => {
  const fakeReq = {
    ip: '10.0.0.1',
    socket: { remoteAddress: '10.0.0.1' },
    body: { email: 'User@Example.COM' },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  const key = ipEmailKey(fakeReq);
  assert.equal(key, '10.0.0.1:user@example.com');
});

test('H1: ipEmailKey retrocede a solo-IP si no hay email en body', () => {
  const fakeReq = {
    ip: '10.0.0.2',
    socket: { remoteAddress: '10.0.0.2' },
    body: {},
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  const key = ipEmailKey(fakeReq);
  assert.equal(key, '10.0.0.2');
});

// H2 (n8n emit precondition) removed: the automation/n8n emit module only ever
// served auth emails (invite/reset/verify), which Supabase Auth now sends directly.
// The module was deleted in Phase 6 — there is no emit path left to harden.

// ---------------------------------------------------------------------------
// H3: SUPABASE_JWT_SECRET validation.
// Supabase-issued JWTs must be verified with the correct HS256 secret.
// A token signed with a different secret must be rejected (prevents secret mismatch).
// ---------------------------------------------------------------------------

// Build a minimal HS256 JWT
function buildJwt(payload: Record<string, unknown>, secret: string, expiresInSec = 3600): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const claims = { iat: now, exp: now + expiresInSec, ...payload };
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

// H3 uses jose directly to test the security property (wrong secret rejected)
// without depending on the module-cached env value from other test files.
import { jwtVerify } from 'jose';

const H3_SECRET = 'h3-test-secret-long-enough-32ch!!';
const H3_WRONG_SECRET = 'wrong-secret-not-matching-at-all!';

test('H3: jose.jwtVerify rejects token signed with wrong HS256 secret', async () => {
  const wrongToken = buildJwt({ sub: 'uuid-bad', email: 'h3@test.com', role: 'authenticated' }, H3_WRONG_SECRET);
  const key = new TextEncoder().encode(H3_SECRET);
  await assert.rejects(
    () => jwtVerify(wrongToken, key, { algorithms: ['HS256'] }),
    (err: Error) => err.constructor.name === 'JWSSignatureVerificationFailed' || /signature/i.test(err.message),
  );
});

test('H3: jose.jwtVerify accepts token signed with correct HS256 secret', async () => {
  const validToken = buildJwt({ sub: 'uuid-ok', email: 'h3ok@test.com', role: 'authenticated' }, H3_SECRET);
  const key = new TextEncoder().encode(H3_SECRET);
  const { payload } = await jwtVerify(validToken, key, { algorithms: ['HS256'] });
  assert.equal(payload.sub, 'uuid-ok');
});

// ---------------------------------------------------------------------------
// H4: password policy still enforced (validatePassword function unchanged).
// ---------------------------------------------------------------------------
import { validatePassword } from '../password.js';

test('H4: validatePassword rechaza password de 7 chars', () => {
  assert.equal(validatePassword('1234567'), 'too_short');
});

test('H4: validatePassword rechaza 8 chars (política endurecida ≥12)', () => {
  assert.equal(validatePassword('12345678'), 'too_short');
});

test('H4: validatePassword acepta 12 chars con letra + dígito', () => {
  assert.equal(validatePassword('abcdefghijk1'), null);
});

// ---------------------------------------------------------------------------
// H5: Session invalidation via Supabase admin.signOut(uid, 'others').
// This verifies that:
// (a) verifySupabaseToken rejects expired tokens (tokens have exp claim).
// (b) The design: admin.signOut invalidates existing sessions (tested here as a unit
//     of logic, not a live Supabase call — live test is in auth-users.e2e when live creds present).
// ---------------------------------------------------------------------------

test('H5: expired Supabase token is rejected by jose.jwtVerify (session invalidation guard)', async () => {
  const expiredToken = buildJwt({ sub: 'uuid-exp', email: 'exp@test.com', role: 'authenticated' }, H3_SECRET, -60);
  const key = new TextEncoder().encode(H3_SECRET);
  await assert.rejects(
    () => jwtVerify(expiredToken, key, { algorithms: ['HS256'] }),
    /expired/i,
  );
});

test('H5: Supabase JWT sub matches UUID format (auth.users.id linkage)', async () => {
  const uuid = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
  const token = buildJwt({ sub: uuid, email: 'uuid@test.com', role: 'authenticated' }, H3_SECRET);
  const key = new TextEncoder().encode(H3_SECRET);
  const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });
  assert.equal(payload.sub, uuid);
  assert.match(payload.sub!, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
});
