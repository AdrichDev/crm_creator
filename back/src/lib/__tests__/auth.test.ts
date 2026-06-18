// Unit tests for the Supabase token verification layer.
// Runner: node --import tsx --test
//
// Supabase signs access tokens with ASYMMETRIC keys (ES256) verified against the
// project JWKS. The crypto verification (jwtVerify + JWKS) is covered by integration
// against live Supabase; here we unit-test the pure claim-mapping contract and the
// offline rejection of malformed tokens (no network needed).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';

const { extractSupabaseClaims, verifySupabaseToken } = await import('../auth.js');

describe('extractSupabaseClaims', () => {
  test('maps a verified payload to { sub, email, role }', () => {
    const r = extractSupabaseClaims({ sub: 'uuid-1234', email: 'user@test.com', role: 'authenticated' });
    assert.deepEqual(r, { sub: 'uuid-1234', email: 'user@test.com', role: 'authenticated' });
  });

  test('defaults role to authenticated and email to empty when absent', () => {
    const r = extractSupabaseClaims({ sub: 'uuid-1' });
    assert.equal(r.role, 'authenticated');
    assert.equal(r.email, '');
  });

  test('throws when sub is missing', () => {
    assert.throws(() => extractSupabaseClaims({ email: 'nosub@test.com' }), /sub/);
  });

  test('throws when sub is not a string', () => {
    assert.throws(() => extractSupabaseClaims({ sub: 123 as unknown as string }), /sub/);
  });
});

describe('verifySupabaseToken', () => {
  test('rejects a malformed token string (offline, before JWKS fetch)', async () => {
    await assert.rejects(() => verifySupabaseToken('not.a.jwt'));
  });

  test('rejects an empty token', async () => {
    await assert.rejects(() => verifySupabaseToken(''));
  });
});
