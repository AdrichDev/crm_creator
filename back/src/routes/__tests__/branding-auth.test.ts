// crm-security-hardening S1: /api/branding/extract spends an Anthropic key, so it
// requires a session. With a business (header or body) the caller must be a member;
// without a business only the platform operator may use the operator key.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { call } from './_fake-prisma.js';
import { createBrandingRouter, type BrandingAuthDeps, type BrandingExtractDeps } from '../branding.js';
import { env } from '../../env.js';

const TOKENS = { palette: { primary: '#1E90FF' }, typography: {}, shape: {}, logo: { found: false } };
const BODY = { text: '.brand { color: #1E90FF; }' };

function setup(opts: { appRole?: string; memberOf?: string[] } = {}) {
  const extracted: string[] = [];
  const tenantLookups: string[] = [];
  const auth: BrandingAuthDeps = {
    verify: async (token) => {
      if (token !== 'good') throw new Error('bad token');
      return { sub: 'u1', email: 'u1@test', role: 'authenticated', ...(opts.appRole ? { appRole: opts.appRole } : {}) };
    },
    isMember: async (_userId, businessId) => (opts.memberOf ?? []).includes(businessId),
  };
  const extract: BrandingExtractDeps = {
    getTenantSecret: async (businessId) => { tenantLookups.push(businessId); return { value: 'tenant-key', source: 'tenant' }; },
    extractWithAnthropic: async (_src, key) => { extracted.push(key); return TOKENS; },
  };
  return { router: createBrandingRouter(auth, extract), extracted, tenantLookups };
}

const bearer = { authorization: 'Bearer good' };

describe('POST /branding/extract authentication', () => {
  test('no token → 401 and no model call', async () => {
    const s = setup({ appRole: 'operator' });
    const r = await call(s.router, 'POST', '/extract', BODY, {});
    assert.equal(r.status, 401);
    assert.equal(r.body?.error?.code, 'no_token');
    assert.equal(s.extracted.length, 0);
  });

  test('invalid token → 401 and no model call', async () => {
    const s = setup({ appRole: 'operator' });
    const r = await call(s.router, 'POST', '/extract', BODY, {}, { authorization: 'Bearer forged' });
    assert.equal(r.status, 401);
    assert.equal(r.body?.error?.code, 'invalid_token');
    assert.equal(s.extracted.length, 0);
  });

  test('businessId of a business the user does not belong to → 403, no key used', async () => {
    const s = setup({ memberOf: ['A'] });
    const r = await call(s.router, 'POST', '/extract', { ...BODY, businessId: 'B' }, {}, bearer);
    assert.equal(r.status, 403);
    assert.equal(r.body?.error?.code, 'wrong_business');
    assert.deepEqual(s.tenantLookups, []);
    assert.equal(s.extracted.length, 0);
  });

  test('member of the business (x-business-id) → 200 with that business key', async () => {
    const s = setup({ memberOf: ['A'] });
    const r = await call(s.router, 'POST', '/extract', BODY, {}, { ...bearer, 'x-business-id': 'A' });
    assert.equal(r.status, 200);
    assert.equal(r.body?.source, 'ai');
    assert.deepEqual(s.tenantLookups, ['A']);
    assert.deepEqual(s.extracted, ['tenant-key']);
  });

  test('no business and not operator → 403, operator key not used', async () => {
    const s = setup();
    const r = await call(s.router, 'POST', '/extract', BODY, {}, bearer);
    assert.equal(r.status, 403);
    assert.equal(r.body?.error?.code, 'forbidden');
    assert.equal(s.extracted.length, 0);
  });

  test('no business and operator → 200 with the operator key, as before', async () => {
    const original = env.anthropicApiKey;
    env.anthropicApiKey = 'operator-key';
    try {
      const s = setup({ appRole: 'operator' });
      const r = await call(s.router, 'POST', '/extract', BODY, {}, bearer);
      assert.equal(r.status, 200);
      assert.deepEqual(s.extracted, ['operator-key']);
      assert.deepEqual(s.tenantLookups, []);
    } finally {
      env.anthropicApiKey = original;
    }
  });

  test('more than 10 extractions per minute for one user → 429', async () => {
    const s = setup({ memberOf: ['A'] });
    const headers = { ...bearer, 'x-business-id': 'A' };
    for (let i = 0; i < 10; i++) {
      const ok = await call(s.router, 'POST', '/extract', BODY, {}, headers);
      assert.equal(ok.status, 200);
    }
    const r = await call(s.router, 'POST', '/extract', BODY, {}, headers);
    assert.equal(r.status, 429);
    assert.equal(s.extracted.length, 10);
  });
});
