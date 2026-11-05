// crm-fk-tenant-scoping: a foreign-key id that belongs to another business must be
// rejected with 422 `cross_tenant` and leave stored data untouched; ids of the active
// business keep working as before.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installFakePrisma, call } from './_fake-prisma.js';

const fake = installFakePrisma();
const { timeOffRouter } = await import('../timeoff.js');
const { categoriesRouter } = await import('../categories.js');
const { packagesRouter } = await import('../packages.js');
const { customersRouter } = await import('../customers.js');
const { visitsRouter } = await import('../visits.js');
const { bookingsRouter } = await import('../bookings.js');

const live = { eliminadoEn: null };
const minorBirth = new Date(Date.now() - 10 * 365.25 * 86400000);
const seed = {
  employee: [{ id: 'eA', businessId: 'A', nombre: 'Ana', ...live }, { id: 'eB', businessId: 'B', nombre: 'Beto', email: 'b@b.test', ...live }],
  customer: [{ id: 'cA', businessId: 'A', nombre: 'Cli A', ...live }, { id: 'cB', businessId: 'B', nombre: 'Cli B', fechaNacimiento: minorBirth, ...live }],
  team: [{ id: 'tA', businessId: 'A', nombre: 'Equipo A', ...live }],
  service: [{ id: 'sA', businessId: 'A', duracionMin: 30, ...live }, { id: 'sB', businessId: 'B', duracionMin: 30, ...live }],
  booking: [{ id: 'bA', businessId: 'A', ...live }, { id: 'bB', businessId: 'B', ...live }],
  customerPackage: [{ id: 'cpA', businessId: 'A', estado: 'ACTIVE', sesionesUsadas: 0, sesionesTotal: 5, expiraEn: null }],
  visitState: [{ id: 'vA', businessId: 'A', ...live }, { id: 'vB', businessId: 'B', ...live }],
  location: [{ id: 'lA', businessId: 'A', ...live }, { id: 'lB', businessId: 'B', ...live }],
  business: [{ id: 'A', nombre: 'Negocio A' }, { id: 'B', nombre: 'Negocio B' }],
};

function assertCrossTenant(r: { status: number; body: any }, field: string) {
  assert.equal(r.status, 422);
  assert.equal(r.body?.error?.code, 'cross_tenant');
  assert.match(r.body.error.message, new RegExp(field));
}

beforeEach(() => fake.reset(seed));

describe('POST /time-off employeeId', () => {
  const body = (employeeId: string) => ({ employeeId, inicio: '2026-12-01', fin: '2026-12-05', dias: 5 });

  test('foreign employee → 422 cross_tenant, no request stored', async () => {
    const r = await call(timeOffRouter, 'POST', '/', body('eB'));
    assertCrossTenant(r, 'employeeId');
    assert.equal(fake.writesTo('timeOffRequest').length, 0);
  });

  test('own employee → 201 as before', async () => {
    const r = await call(timeOffRouter, 'POST', '/', body('eA'));
    assert.equal(r.status, 201);
    assert.equal(fake.writesTo('timeOffRequest').length, 1);
  });
});

describe('POST /categories/:id/members', () => {
  test('foreign employee → 422 cross_tenant, no member stored', async () => {
    const r = await call(categoriesRouter, 'POST', '/tA/members', { employeeId: 'eB', rol: 'Entrenador' });
    assertCrossTenant(r, 'employeeId');
    assert.equal(fake.writesTo('teamMember').length, 0);
  });

  test('foreign customer (even a minor) → 422 cross_tenant, not the minor oracle', async () => {
    const r = await call(categoriesRouter, 'POST', '/tA/members', { customerId: 'cB', rol: 'Jugador' });
    assertCrossTenant(r, 'customerId');
    assert.equal(fake.writesTo('teamMember').length, 0);
  });

  test('own employee → 201 as before', async () => {
    const r = await call(categoriesRouter, 'POST', '/tA/members', { employeeId: 'eA', rol: 'Entrenador' });
    assert.equal(r.status, 201);
    assert.equal(fake.writesTo('teamMember').length, 1);
  });
});

describe('POST /packages serviceIds', () => {
  test('any foreign service → 422 cross_tenant, no package stored', async () => {
    const r = await call(packagesRouter, 'POST', '/', { nombre: 'Bono', sesionesTotal: 5, serviceIds: ['sA', 'sB'] });
    assertCrossTenant(r, 'serviceIds');
    assert.equal(fake.writesTo('package').length, 0);
  });

  test('own services → 201 as before', async () => {
    const r = await call(packagesRouter, 'POST', '/', { nombre: 'Bono', sesionesTotal: 5, serviceIds: ['sA'] });
    assert.equal(r.status, 201);
    assert.equal(fake.writesTo('package').length, 1);
  });
});

describe('POST /packages/customer-packages/:id/consume-session bookingId', () => {
  test('foreign booking → 422 cross_tenant, session not consumed', async () => {
    const r = await call(packagesRouter, 'POST', '/customer-packages/cpA/consume-session', { bookingId: 'bB' });
    assertCrossTenant(r, 'bookingId');
    assert.equal(fake.writesTo('customerPackage').length, 0);
  });

  test('own booking → 200 as before', async () => {
    const r = await call(packagesRouter, 'POST', '/customer-packages/cpA/consume-session', { bookingId: 'bA' });
    assert.equal(r.status, 200);
    assert.equal(fake.writesTo('customerPackage').length, 1);
  });
});

describe('customers estadoVisitaId', () => {
  test('POST with foreign visit state → 422 cross_tenant, no customer stored', async () => {
    const r = await call(customersRouter, 'POST', '/', { nombre: 'Nuevo', estadoVisitaId: 'vB' });
    assertCrossTenant(r, 'estadoVisitaId');
    assert.equal(fake.writesTo('customer').length, 0);
  });

  test('PATCH with foreign visit state → 422 cross_tenant, customer unchanged', async () => {
    const r = await call(customersRouter, 'PATCH', '/cA', { estadoVisitaId: 'vB' });
    assertCrossTenant(r, 'estadoVisitaId');
    assert.equal(fake.writesTo('customer').length, 0);
  });

  test('own visit state → POST 201 and PATCH 200 as before', async () => {
    const created = await call(customersRouter, 'POST', '/', { nombre: 'Nuevo', estadoVisitaId: 'vA' });
    assert.equal(created.status, 201);
    const patched = await call(customersRouter, 'PATCH', '/cA', { estadoVisitaId: 'vA' });
    assert.equal(patched.status, 200);
    assert.equal(fake.writesTo('customer').length, 2);
  });
});

describe('POST /visits employeeId', () => {
  test('foreign employee → 422 cross_tenant, no visit stored', async () => {
    const r = await call(visitsRouter, 'POST', '/', { customerId: 'cA', employeeId: 'eB' });
    assertCrossTenant(r, 'employeeId');
    assert.equal(fake.writesTo('visit').length, 0);
  });

  test('own employee → 201 as before', async () => {
    const r = await call(visitsRouter, 'POST', '/', { customerId: 'cA', employeeId: 'eA' });
    assert.equal(r.status, 201);
    assert.equal(fake.writesTo('visit').length, 1);
  });
});

describe('bookings availability ids', () => {
  const start = '2026-12-01T10:00:00.000Z';

  test('check-availability with foreign location → 422 cross_tenant', async () => {
    const r = await call(bookingsRouter, 'POST', '/check-availability', { locationId: 'lB', serviceId: 'sA', start });
    assertCrossTenant(r, 'locationId');
  });

  test('check-availability with foreign employee → 422 cross_tenant', async () => {
    const r = await call(bookingsRouter, 'POST', '/check-availability', { locationId: 'lA', serviceId: 'sA', employeeId: 'eB', start });
    assertCrossTenant(r, 'employeeId');
  });

  test('check-availability with own ids → 200 as before', async () => {
    const r = await call(bookingsRouter, 'POST', '/check-availability', { locationId: 'lA', serviceId: 'sA', employeeId: 'eA', start });
    assert.equal(r.status, 200);
  });

  test('slots with foreign location → 422 cross_tenant', async () => {
    const r = await call(bookingsRouter, 'GET', '/slots?date=2026-12-01&serviceId=sA&locationId=lB');
    assertCrossTenant(r, 'locationId');
  });

  test('slots with foreign employee → 422 cross_tenant', async () => {
    const r = await call(bookingsRouter, 'GET', '/slots?date=2026-12-01&serviceId=sA&locationId=lA&employeeId=eB');
    assertCrossTenant(r, 'employeeId');
  });

  test('slots with own ids → 200 as before', async () => {
    const r = await call(bookingsRouter, 'GET', '/slots?date=2026-12-01&serviceId=sA&locationId=lA&employeeId=eA');
    assert.equal(r.status, 200);
  });
});
