// crm-security-hardening S4: 5xx responses must not echo internal error messages
// (Prisma errors, hostnames, SQL); the cross-tenant backstop keeps answering 422.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { errorHandler } from '../error.js';
import { CrossTenantError } from '../../lib/tenant.js';
import { TenantScopeError } from '../../lib/tenant-scope.js';

async function hit(thrown: unknown): Promise<{ status: number; body: any; logs: string[] }> {
  const app = express();
  app.get('/boom', () => { throw thrown; });
  app.use(errorHandler);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once('listening', () => r()));
  const { port } = server.address() as AddressInfo;
  const logs: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { logs.push(args.map((a) => String(a)).join(' ')); };
  try {
    const r = await fetch(`http://127.0.0.1:${port}/boom`, { signal: AbortSignal.timeout(5000) });
    return { status: r.status, body: await r.json(), logs };
  } finally {
    console.error = original;
    server.close();
  }
}

test('unexpected error → 500 with a generic message, internal detail not exposed', async () => {
  const r = await hit(new Error('Invalid `prisma.customer.findMany()` invocation: connect ECONNREFUSED db.internal:5432'));
  assert.equal(r.status, 500);
  assert.deepEqual(r.body, { error: { code: 'internal', message: 'Error interno' } });
});

test('CrossTenantError still → 422 cross_tenant as before', async () => {
  const r = await hit(new CrossTenantError('employeeId'));
  assert.equal(r.status, 422);
  assert.equal(r.body.error.code, 'cross_tenant');
});

// S2 (última viñeta): un TenantScopeError es un fallo de PROGRAMACIÓN. Se responde 500
// genérico —sin modelo, operación ni SQL en el cuerpo— y se registra con modelo+operación
// para poder encontrar el call site que se dejó el negocio.
test('TenantScopeError → 500 genérico, sin modelo ni operación en el cuerpo', async () => {
  const r = await hit(new TenantScopeError('Customer', 'findMany', 'falta businessId en el where'));
  assert.equal(r.status, 500);
  assert.deepEqual(r.body, { error: { code: 'internal', message: 'Error interno' } });
  const raw = JSON.stringify(r.body);
  assert.equal(raw.includes('Customer'), false);
  assert.equal(raw.includes('findMany'), false);
  assert.equal(raw.includes('TenantScope'), false);
});

test('TenantScopeError → se registra con modelo y operación', async () => {
  const r = await hit(new TenantScopeError('Customer', 'findMany', 'falta businessId en el where'));
  const logged = r.logs.join('\n');
  assert.match(logged, /TenantScopeError/);
  assert.match(logged, /Customer\.findMany/);
});
