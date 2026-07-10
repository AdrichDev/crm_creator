// Unit tests del kill switch en el carril /calendar (crm-tenant-lifecycle-gate, WU2.5).
// Runner: node --import tsx --test
//
// El feed ICS es NO autenticado (token opaco en la URL): el negocio se resuelve
// token → dueño (userId) → negocio (Employee.userId @unique, respaldo Membership).
// Se prueba en dos capas, sin BD real (patrón DI del repo, ver login-gate.test.ts):
//   1. WIRING: la ruta del feed monta limiter → resolver → gate → handler, y las rutas
//      de autoservicio montan el gate DESPUÉS de authenticate.
//   2. COMPORTAMIENTO: feedTenantResolver real (dobles de token y negocio) → tenantGate
//      real con BD doble. businessIds únicos por test (cache del resolver global).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Response, NextFunction } from 'express';
import { TenantLifecycle } from '../../lib/generated/prisma/client.js';
import type { TenantStateDb } from '../../lib/tenant-lifecycle/resolver.js';
import { tenantGate } from '../../middleware/tenant-gate.js';
import { authenticate } from '../../middleware/auth.js';
import type { CalendarTokenRepo } from '../../lib/calendarToken.js';
import {
  calendarRouter,
  feedTenantResolver,
  type FeedBusinessLookup,
  type FeedRequest,
} from '../calendar.js';

function mockRes() {
  const res = { statusCode: 200 } as unknown as Response & {
    statusCode: number;
    body?: unknown;
    status(code: number): typeof res;
    json(body: unknown): typeof res;
    setHeader(name: string, value: string): typeof res;
  };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (body: unknown) => { res.body = body; return res; };
  res.setHeader = () => res;
  return res;
}

/** BD doble del resolver de estado: siempre devuelve la fila indicada. */
function dbWith(row: { lifecycle: TenantLifecycle; graceUntil?: Date | null }): TenantStateDb {
  return {
    business: {
      findUnique: async () => ({
        lifecycle: row.lifecycle,
        graceUntil: row.graceUntil ?? null,
        suspendedAt: null,
      }),
    },
  };
}

/** Doble del repo de tokens: cualquier hash resuelve al dueño dado (o a nadie). */
function tokensOwnedBy(userId: string | null): CalendarTokenRepo {
  return {
    findByUserId: async () => null,
    upsert: async () => {},
    revoke: async () => {},
    findActiveOwnerByHash: async () => (userId ? { userId } : null),
  };
}

/** Doble de la búsqueda de negocio del dueño del feed. */
function businessOf(businessId: string | null): FeedBusinessLookup {
  return { findBusinessIdByUserId: async () => businessId };
}

/** Ejecuta la MISMA secuencia que monta la ruta del feed: resolver → tenantGate(db). */
async function runFeed(opts: {
  tokenOwner: string | null;
  businessId: string | null;
  db: TenantStateDb;
}) {
  const req = { params: { token: 'raw-token' } } as unknown as FeedRequest;
  const res = mockRes();
  let resolverPassed = false;
  let reachedHandler = false;
  await feedTenantResolver({
    tokens: tokensOwnedBy(opts.tokenOwner),
    business: businessOf(opts.businessId),
  })(req, res, (() => { resolverPassed = true; }) as NextFunction);
  if (resolverPassed) {
    await tenantGate({ db: opts.db })(req, res, (() => { reachedHandler = true; }) as NextFunction);
  }
  return { req, res, resolverPassed, reachedHandler };
}

type RouteLayer = {
  route?: { path: string; stack: Array<{ handle: unknown }> };
};

function routeHandlers(path: string): unknown[] {
  const stack = (calendarRouter as unknown as { stack: RouteLayer[] }).stack;
  const layer = stack.find((l) => l.route?.path === path);
  assert.ok(layer?.route, `debe existir la ruta ${path} en calendarRouter`);
  return layer.route.stack.map((l) => l.handle);
}

describe('carril /calendar — wiring (WU2.5)', () => {
  test('el feed monta limiter → resolver → gate → handler (4 capas)', () => {
    const handlers = routeHandlers('/feed/:token.ics');
    assert.equal(handlers.length, 4, 'limiter + resolver + gate + handler');
  });

  test('las rutas de autoservicio montan el gate DESPUÉS de authenticate (3 capas)', () => {
    for (const path of ['/status', '/token', '/preferences']) {
      const layers = (calendarRouter as unknown as { stack: RouteLayer[] }).stack.filter(
        (l) => l.route?.path === path,
      );
      assert.ok(layers.length > 0, `debe existir ${path}`);
      for (const layer of layers) {
        const handlers = layer.route!.stack.map((l) => l.handle);
        const idxAuth = handlers.indexOf(authenticate);
        assert.equal(idxAuth, 0, `${path}: authenticate primero`);
        assert.equal(handlers.length, 3, `${path}: authenticate + gate + handler`);
      }
    }
  });
});

describe('carril /calendar/feed — resolución de identidad del negocio', () => {
  test('token válido: fija calendarFeedUserId y tenantBusinessId (dueño → negocio)', async () => {
    const { req, reachedHandler } = await runFeed({
      tokenOwner: 'user-feed-1',
      businessId: 'ccalfeedresolve0001',
      db: dbWith({ lifecycle: TenantLifecycle.ACTIVE }),
    });
    assert.equal(req.calendarFeedUserId, 'user-feed-1');
    assert.equal(req.tenantBusinessId, 'ccalfeedresolve0001');
    assert.ok(reachedHandler);
  });

  test('token inexistente/revocado → 404 opaco, el gate ni corre (AC2 intacto)', async () => {
    const { res, resolverPassed } = await runFeed({
      tokenOwner: null,
      businessId: 'ccalfeed404never001',
      db: dbWith({ lifecycle: TenantLifecycle.ACTIVE }),
    });
    assert.ok(!resolverPassed, 'sin dueño no se pasa del resolver');
    assert.equal(res.statusCode, 404);
    assert.equal((res.body as { error: { code: string } }).error.code, 'not_found');
  });

  test('dueño sin negocio asociado → gate no-op (feed sirve, nunca 500)', async () => {
    const { res, reachedHandler } = await runFeed({
      tokenOwner: 'user-feed-orphan',
      businessId: null,
      db: dbWith({ lifecycle: TenantLifecycle.SUSPENDED }),
    });
    assert.ok(reachedHandler, 'sin businessId el gate no opina');
    assert.equal(res.statusCode, 200);
  });
});

describe('carril /calendar/feed — decisión del gate por estado del negocio', () => {
  test('ACTIVE → el feed se sirve (contrato intacto)', async () => {
    const { res, reachedHandler } = await runFeed({
      tokenOwner: 'user-feed-2',
      businessId: 'ccalfeedactive00001',
      db: dbWith({ lifecycle: TenantLifecycle.ACTIVE }),
    });
    assert.ok(reachedHandler);
    assert.equal(res.statusCode, 200);
  });

  test('SUSPENDED → 423 tenant_suspended (el ICS deja de servirse)', async () => {
    const { res, reachedHandler } = await runFeed({
      tokenOwner: 'user-feed-3',
      businessId: 'ccalfeedsuspend0001',
      db: dbWith({ lifecycle: TenantLifecycle.SUSPENDED }),
    });
    assert.ok(!reachedHandler);
    assert.equal(res.statusCode, 423);
    assert.equal((res.body as { error: { code: string } }).error.code, 'tenant_suspended');
  });

  test('TERMINATED → 410 tenant_terminated', async () => {
    const { res, reachedHandler } = await runFeed({
      tokenOwner: 'user-feed-4',
      businessId: 'ccalfeedterminated1',
      db: dbWith({ lifecycle: TenantLifecycle.TERMINATED }),
    });
    assert.ok(!reachedHandler);
    assert.equal(res.statusCode, 410);
    assert.equal((res.body as { error: { code: string } }).error.code, 'tenant_terminated');
  });
});
