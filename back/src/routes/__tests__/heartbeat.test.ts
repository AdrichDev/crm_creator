// Unit tests de POST /license/heartbeat (crm-tenant-lifecycle-gate, WU3.3).
// Runner: node --import tsx --test
//
// Handler REAL con dependencias inyectadas (secreto, BD del resolver, reloj) — patrón DI
// del repo. businessIds únicos por test: el cache del resolver es global módulo.
// Recordatorio de alcance: el heartbeat es DISUASIÓN para binarios/offline; el corte
// autoritativo es server-side (tenantGate). Aquí se verifica el contrato firmado.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { TenantLifecycle } from '../../lib/generated/prisma/client.js';
import type { TenantStateDb } from '../../lib/tenant-lifecycle/resolver.js';
import {
  heartbeatHandler,
  signHeartbeat,
  canonicalHeartbeatRequest,
  canonicalHeartbeatResponse,
  type HeartbeatDeps,
} from '../license.js';

const SECRET = 'test-heartbeat-secret';
const NOW = new Date('2026-07-10T12:00:00.000Z');

function mockRes() {
  const res = { statusCode: 200 } as unknown as Response & {
    statusCode: number;
    body?: unknown;
    status(code: number): typeof res;
    json(body: unknown): typeof res;
  };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (body: unknown) => { res.body = body; return res; };
  return res;
}

function mockReq(body: unknown, signature?: string) {
  return {
    body,
    header: (name: string) => (name === 'x-license-signature' ? signature : undefined),
  } as unknown as Request;
}

function dbWith(row: { lifecycle: TenantLifecycle; graceUntil?: Date | null } | null): TenantStateDb {
  return {
    business: {
      findUnique: async () =>
        row ? { lifecycle: row.lifecycle, graceUntil: row.graceUntil ?? null, suspendedAt: null } : null,
    },
  };
}

/** Petición firmada como la haría el binario cliente. */
function signedReq(businessId: string, opts: { ts?: string; nonce?: string; tamper?: boolean } = {}) {
  const ts = opts.ts ?? NOW.toISOString();
  const nonce = opts.nonce ?? 'n1';
  const sig = signHeartbeat(opts.tamper ? 'otro-secreto' : SECRET, canonicalHeartbeatRequest(businessId, ts, nonce));
  return mockReq({ businessId, ts, nonce }, sig);
}

function deps(db: TenantStateDb, overrides: Partial<HeartbeatDeps> = {}): HeartbeatDeps {
  return { secret: () => SECRET, db, now: () => NOW, ...overrides };
}

describe('POST /license/heartbeat — contrato firmado', () => {
  test('sin secreto configurado → 503 heartbeat_unconfigured (fail-closed, nada sin firmar)', async () => {
    const res = mockRes();
    await heartbeatHandler(
      deps(dbWith({ lifecycle: TenantLifecycle.ACTIVE }), { secret: () => '' }),
      signedReq('hb-unconfigured'),
      res,
    );
    assert.equal(res.statusCode, 503);
    assert.equal((res.body as { error: { code: string } }).error.code, 'heartbeat_unconfigured');
  });

  test('payload sin businessId/ts → 400 invalid_payload', async () => {
    const res = mockRes();
    await heartbeatHandler(deps(dbWith({ lifecycle: TenantLifecycle.ACTIVE })), mockReq({}), res);
    assert.equal(res.statusCode, 400);
    assert.equal((res.body as { error: { code: string } }).error.code, 'invalid_payload');
  });

  test('firma inválida → 401 invalid_signature y no revela estado', async () => {
    const res = mockRes();
    await heartbeatHandler(
      deps(dbWith({ lifecycle: TenantLifecycle.ACTIVE })),
      signedReq('hb-bad-sig', { tamper: true }),
      res,
    );
    assert.equal(res.statusCode, 401);
    assert.equal((res.body as { error: { code: string } }).error.code, 'invalid_signature');
    assert.ok(!JSON.stringify(res.body).includes('ACTIVE'), 'sin firma válida no se revela el estado');
  });

  test('timestamp fuera de la ventana anti-replay → 401 stale_timestamp', async () => {
    const stale = new Date(NOW.getTime() - 10 * 60 * 1000).toISOString(); // 10 min > ventana 5 min
    const res = mockRes();
    await heartbeatHandler(
      deps(dbWith({ lifecycle: TenantLifecycle.ACTIVE })),
      signedReq('hb-stale', { ts: stale }),
      res,
    );
    assert.equal(res.statusCode, 401);
    assert.equal((res.body as { error: { code: string } }).error.code, 'stale_timestamp');
  });

  test('petición válida de negocio ACTIVE → 200 con estado y firma de respuesta verificable', async () => {
    const res = mockRes();
    await heartbeatHandler(deps(dbWith({ lifecycle: TenantLifecycle.ACTIVE })), signedReq('hb-active'), res);

    assert.equal(res.statusCode, 200);
    const body = res.body as { businessId: string; lifecycle: string; ts: string; signature: string; graceUntil?: string };
    assert.equal(body.businessId, 'hb-active');
    assert.equal(body.lifecycle, TenantLifecycle.ACTIVE);
    // El binario cliente re-computa la firma con el secreto compartido y debe coincidir.
    const expected = signHeartbeat(
      SECRET,
      canonicalHeartbeatResponse(body.businessId, body.lifecycle, body.graceUntil ?? '', body.ts),
    );
    assert.equal(body.signature, expected, 'la firma de respuesta debe verificar');
  });

  test('negocio SUSPENDED → responde SUSPENDED firmado (el corte viaja firmado)', async () => {
    const res = mockRes();
    await heartbeatHandler(deps(dbWith({ lifecycle: TenantLifecycle.SUSPENDED })), signedReq('hb-suspended'), res);
    assert.equal(res.statusCode, 200);
    const body = res.body as { lifecycle: string; signature: string };
    assert.equal(body.lifecycle, TenantLifecycle.SUSPENDED);
    assert.ok(body.signature.length > 0);
  });

  test('GRACE vigente → incluye graceUntil y va dentro de la firma', async () => {
    const grace = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
    const res = mockRes();
    await heartbeatHandler(
      deps(dbWith({ lifecycle: TenantLifecycle.GRACE, graceUntil: grace })),
      signedReq('hb-grace'),
      res,
    );
    const body = res.body as { lifecycle: string; graceUntil?: string; businessId: string; ts: string; signature: string };
    assert.equal(body.lifecycle, TenantLifecycle.GRACE);
    assert.equal(body.graceUntil, grace.toISOString());
    const expected = signHeartbeat(
      SECRET,
      canonicalHeartbeatResponse(body.businessId, body.lifecycle, body.graceUntil ?? '', body.ts),
    );
    assert.equal(body.signature, expected);
  });

  test('negocio inexistente → TERMINATED firmado (fail-closed del resolver, nunca ACTIVE por defecto)', async () => {
    const res = mockRes();
    await heartbeatHandler(deps(dbWith(null)), signedReq('hb-ghost'), res);
    assert.equal(res.statusCode, 200);
    assert.equal((res.body as { lifecycle: string }).lifecycle, TenantLifecycle.TERMINATED);
  });
});
