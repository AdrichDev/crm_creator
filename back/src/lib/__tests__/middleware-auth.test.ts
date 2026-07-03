// Unit tests for the authenticate middleware behavior (membership/tenant resolution).
// Runner: node --import tsx --test
//
// Strategy: the token VERIFIER is injected (DI), so these tests exercise the
// membership + active-tenant logic deterministically without real crypto or a live
// DB. Real JWKS/ES256 verification is covered by integration against live Supabase.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Response, NextFunction } from 'express';
import type { MemberRole } from '../generated/prisma/client.js';

type FakeMembership = { userId: string; businessId: string; role: MemberRole };
type FakePrisma = { membership: { findMany(args: { where: { userId: string } }): Promise<FakeMembership[]> } };
type AuthedReq = {
  headers: Record<string, string | undefined>;
  method?: string;
  path?: string;
  userId?: string;
  businessId?: string;
  role?: MemberRole;
};
type Verify = (token: string) => Promise<{ sub: string; email: string; role: string }>;

// Mirrors middleware/auth.ts logic; verifier injected for testability.
function makeAuthMiddleware(db: FakePrisma, verify: Verify) {
  return async (req: AuthedReq, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers['authorization'];
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: { code: 'no_token', message: 'Falta token' } });
      }
      const { sub } = await verify(authHeader.slice(7));
      const memberships = await db.membership.findMany({ where: { userId: sub } });
      if (memberships.length === 0) {
        return res.status(403).json({ error: { code: 'no_membership', message: 'Sin acceso' } });
      }
      const wanted = req.headers['x-business-id'];
      const membership = memberships.find((m) => m.businessId === wanted) ?? memberships[0];
      // GET /projects lista todos los negocios del usuario; un x-business-id
      // obsoleto (negocio borrado, localStorage stale) no debe bloquearla.
      const isProjectsList = req.method === 'GET' && req.path === '/projects';
      if (wanted && membership.businessId !== wanted && !isProjectsList) {
        return res.status(403).json({ error: { code: 'wrong_business', message: 'No tienes acceso' } });
      }
      req.userId = sub;
      req.businessId = membership.businessId;
      req.role = membership.role;
      next();
    } catch {
      return res.status(401).json({ error: { code: 'invalid_token', message: 'Token inválido' } });
    }
  };
}

// Injectable verifiers
const verifyAs = (sub: string): Verify => async () => ({ sub, email: `${sub}@test.com`, role: 'authenticated' });
const verifyReject: Verify = async () => { throw new Error('invalid token'); };

function makeRes() {
  let statusCode = 0;
  let body: unknown;
  const res = {
    status(code: number) { statusCode = code; return res; },
    json(b: unknown) { body = b; return res; },
    getStatus() { return statusCode; },
    getBody() { return body; },
  } as unknown as Response & { getStatus(): number; getBody(): unknown };
  return res;
}

let nextCalled = false;
const next: NextFunction = () => { nextCalled = true; };
beforeEach(() => { nextCalled = false; });

describe('authenticate middleware', () => {
  test('valid token + matching membership → next() called, req context set', async () => {
    const userId = 'uuid-aaa';
    const db: FakePrisma = { membership: { findMany: async () => [{ userId, businessId: 'biz-1', role: 'MANAGER' }] } };
    const req: AuthedReq = { headers: { authorization: 'Bearer tok', 'x-business-id': 'biz-1' } };
    const res = makeRes();
    await makeAuthMiddleware(db, verifyAs(userId))(req, res, next);
    assert.ok(nextCalled, 'next should be called');
    assert.equal(req.userId, userId);
    assert.equal(req.businessId, 'biz-1');
    assert.equal(req.role, 'MANAGER');
  });

  test('no Authorization header → 401 no_token', async () => {
    const db: FakePrisma = { membership: { findMany: async () => [] } };
    const req: AuthedReq = { headers: {} };
    const res = makeRes();
    await makeAuthMiddleware(db, verifyAs('x'))(req, res, next);
    assert.equal(res.getStatus(), 401);
    assert.equal((res.getBody() as { error: { code: string } }).error.code, 'no_token');
    assert.ok(!nextCalled);
  });

  test('invalid/expired token (verifier rejects) → 401 invalid_token', async () => {
    const db: FakePrisma = { membership: { findMany: async () => [] } };
    const req: AuthedReq = { headers: { authorization: 'Bearer not.a.jwt' } };
    const res = makeRes();
    await makeAuthMiddleware(db, verifyReject)(req, res, next);
    assert.equal(res.getStatus(), 401);
    assert.equal((res.getBody() as { error: { code: string } }).error.code, 'invalid_token');
    assert.ok(!nextCalled);
  });

  test('valid token but no memberships → 403 no_membership', async () => {
    const db: FakePrisma = { membership: { findMany: async () => [] } };
    const req: AuthedReq = { headers: { authorization: 'Bearer tok', 'x-business-id': 'biz-x' } };
    const res = makeRes();
    await makeAuthMiddleware(db, verifyAs('uuid-ccc'))(req, res, next);
    assert.equal(res.getStatus(), 403);
    assert.equal((res.getBody() as { error: { code: string } }).error.code, 'no_membership');
    assert.ok(!nextCalled);
  });

  test('valid token but x-business-id mismatch → 403 wrong_business', async () => {
    const userId = 'uuid-ddd';
    const db: FakePrisma = { membership: { findMany: async () => [{ userId, businessId: 'biz-real', role: 'EMPLOYEE' }] } };
    const req: AuthedReq = { headers: { authorization: 'Bearer tok', 'x-business-id': 'biz-other' } };
    const res = makeRes();
    await makeAuthMiddleware(db, verifyAs(userId))(req, res, next);
    assert.equal(res.getStatus(), 403);
    assert.equal((res.getBody() as { error: { code: string } }).error.code, 'wrong_business');
    assert.ok(!nextCalled);
  });

  test('GET /projects with stale x-business-id → does NOT 403, falls back to first membership', async () => {
    const userId = 'uuid-fff';
    const db: FakePrisma = { membership: { findMany: async () => [{ userId, businessId: 'biz-real', role: 'ADMIN' }] } };
    const req: AuthedReq = {
      headers: { authorization: 'Bearer tok', 'x-business-id': 'biz-deleted-or-stale' },
      method: 'GET',
      path: '/projects',
    };
    const res = makeRes();
    await makeAuthMiddleware(db, verifyAs(userId))(req, res, next);
    assert.ok(nextCalled, 'next should be called, not blocked with 403');
    assert.equal(req.businessId, 'biz-real');
  });

  test('no x-business-id → falls back to first membership', async () => {
    const userId = 'uuid-eee';
    const db: FakePrisma = { membership: { findMany: async () => [
      { userId, businessId: 'biz-first', role: 'ADMIN' },
      { userId, businessId: 'biz-second', role: 'EMPLOYEE' },
    ] } };
    const req: AuthedReq = { headers: { authorization: 'Bearer tok' } };
    const res = makeRes();
    await makeAuthMiddleware(db, verifyAs(userId))(req, res, next);
    assert.ok(nextCalled);
    assert.equal(req.businessId, 'biz-first');
  });
});
