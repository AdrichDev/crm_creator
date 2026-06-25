// Unit tests del gate central de tenancy. Runner: node --import tsx --test
//
// Estrategia: la comprobación de pertenencia (BelongsCheck) se inyecta (DI),
// igual que el verificador en middleware-auth.test.ts. Así se ejercita la lógica
// (FK nulo = OK, FK ajeno = throw, primer ajeno corta) sin DB real. El gate vivo
// contra Supabase lo cubre e2e tenant-gate.spec.ts.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Response } from 'express';
import {
  assertBelongsToBusiness,
  assertFks,
  handleCrossTenant,
  CrossTenantError,
  type BelongsCheck,
} from '../tenant.js';

const yes: BelongsCheck = async () => true;
const no: BelongsCheck = async () => false;

describe('assertBelongsToBusiness', () => {
  test('FK nulo/undefined → no comprueba ni lanza', async () => {
    let called = false;
    const spy: BelongsCheck = async () => { called = true; return false; };
    await assertBelongsToBusiness('customer', null, 'b1', 'customerId', spy);
    await assertBelongsToBusiness('customer', undefined, 'b1', 'customerId', spy);
    await assertBelongsToBusiness('customer', '', 'b1', 'customerId', spy);
    assert.equal(called, false);
  });

  test('FK del negocio → resuelve sin lanzar', async () => {
    await assert.doesNotReject(() => assertBelongsToBusiness('customer', 'c1', 'b1', 'customerId', yes));
  });

  test('FK ajeno → lanza CrossTenantError con el field', async () => {
    await assert.rejects(
      () => assertBelongsToBusiness('customer', 'c9', 'b1', 'customerId', no),
      (e: unknown) => e instanceof CrossTenantError && e.field === 'customerId',
    );
  });
});

describe('assertFks', () => {
  test('todos del negocio → ok', async () => {
    await assert.doesNotReject(() => assertFks('b1', [
      { model: 'location', id: 'l1', field: 'locationId' },
      { model: 'service', id: 's1', field: 'serviceId' },
      { model: 'customer', id: null, field: 'customerId' },
    ], yes));
  });

  test('corta en el PRIMER ajeno (no sigue)', async () => {
    let checks = 0;
    const countNo: BelongsCheck = async () => { checks++; return false; };
    await assert.rejects(
      () => assertFks('b1', [
        { model: 'location', id: 'l9', field: 'locationId' },
        { model: 'service', id: 's9', field: 'serviceId' },
      ], countNo),
      (e: unknown) => e instanceof CrossTenantError && e.field === 'locationId',
    );
    assert.equal(checks, 1);
  });
});

describe('handleCrossTenant', () => {
  function fakeRes() {
    const r = { code: 0, body: null as unknown };
    const res = {
      status(c: number) { r.code = c; return res; },
      json(b: unknown) { r.body = b; return res; },
    } as unknown as Response;
    return { res, r };
  }

  test('CrossTenantError → 422 cross_tenant, devuelve true', () => {
    const { res, r } = fakeRes();
    const handled = handleCrossTenant(new CrossTenantError('serviceId'), res);
    assert.equal(handled, true);
    assert.equal(r.code, 422);
    assert.deepEqual(r.body, { error: { code: 'cross_tenant', message: 'Referencia fuera del negocio activo: serviceId' } });
  });

  test('otro error → no responde, devuelve false', () => {
    const { res, r } = fakeRes();
    const handled = handleCrossTenant(new Error('boom'), res);
    assert.equal(handled, false);
    assert.equal(r.code, 0);
  });
});
