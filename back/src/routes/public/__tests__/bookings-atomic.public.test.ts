// crm-security-hardening T3 (S3 / F-06), segunda pasada: la creación de reserva PÚBLICA
// (sin autenticar) sufría el mismo defecto — `checkAvailability` corría con el cliente
// global dentro de una transacción que después ignoraba: dos reservas concurrentes del
// mismo hueco podían committear ambas.
//
// LÍMITE: la serialización real depende del lock de fila de Postgres (`FOR UPDATE`) y solo
// se reproduce contra BD real; el fake en memoria no ejecuta SQL. Aquí se prueba que el
// lock se emite en la transacción ANTES de leer disponibilidad y escribir, y que ninguna
// escritura sale por el cliente root.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installFakePrisma, call, type Seed, type Write } from '../../__tests__/_fake-prisma.js';

const fake = installFakePrisma();
const { bookingsPublicRouter } = await import('../bookings.js');

// Los ids deben cumplir `z.string().cuid()` del schema público.
const BIZ = 'cm5z9x0ab0000abcd1234efg1';
const LOC = 'cm5z9x0ab0000abcd1234efg2';
const SVC = 'cm5z9x0ab0000abcd1234efg3';
const EMP = 'cm5z9x0ab0000abcd1234efg4';
const START = '2026-12-01T10:00:00.000Z';

const base: Seed = {
  business: [{ id: BIZ, nombre: 'Negocio A', eliminadoEn: null }],
  location: [{ id: LOC, businessId: BIZ, nombre: 'Sede', eliminadoEn: null }],
  employee: [{ id: EMP, businessId: BIZ, nombre: 'Ana', eliminadoEn: null }],
  service: [{
    id: SVC, businessId: BIZ, nombre: 'Corte', duracion: 30, activo: true,
    requiereProfesional: false, margenAntes: 0, margenDespues: 0, eliminadoEn: null,
  }],
  openingHour: [],
  holiday: [],
  customer: [],
  booking: [],
  bookingStatusHistory: [],
};

const createBody = (extra: Record<string, unknown> = {}) => ({
  businessId: BIZ,
  locationId: LOC,
  serviceId: SVC,
  start: START,
  customer: { nombre: 'Marta Ruiz' },
  ...extra,
});

const dataWrites = (tag: 'root' | 'tx') =>
  fake.writes.filter((w) => w.client === tag && w.model !== '$transaction' && w.model !== '$queryRaw');
const opNames = (tag: 'root' | 'tx') => dataWrites(tag).map((w) => `${w.model}.${w.op}`);
/** Cualquier uso del cliente root (escritura o SQL crudo): debe ser cero. */
const rootClientUse = () => fake.writes.filter((w) => w.client === 'root' && w.model !== '$transaction');
const locks = () => fake.writes.filter((w) => w.model === '$queryRaw');
const rawQuery = (w: Write) => w.args as { query: string; values: unknown[] };
const transactionCount = () => fake.writes.filter((w) => w.model === '$transaction').length;

beforeEach(() => fake.reset(base));

describe('POST / (público) — creación dentro de la transacción con lock', () => {
  test('lock del empleado en la tx, antes de leer disponibilidad y de escribir', async () => {
    const r = await call(bookingsPublicRouter, 'POST', '/', createBody({ employeeId: EMP }));

    assert.equal(r.status, 201);
    assert.equal(transactionCount(), 1, 'la creación debe ser UNA transacción interactiva');
    assert.deepEqual(rootClientUse(), [], 'ninguna escritura ni SQL crudo por el cliente root');

    const lockIdx = fake.writes.findIndex((w) => w.model === '$queryRaw');
    assert.notEqual(lockIdx, -1, 'no se emitió ningún lock de fila');
    assert.equal(fake.writes[lockIdx].client, 'tx');
    assert.deepEqual(rawQuery(fake.writes[lockIdx]), {
      query: 'SELECT id FROM crm.empleado WHERE id = ? FOR UPDATE', values: [EMP],
    });

    const customerIdx = fake.writes.findIndex((w) => w.model === 'customer' && w.op === 'create');
    const bookingIdx = fake.writes.findIndex((w) => w.model === 'booking' && w.op === 'create');
    assert.ok(lockIdx < customerIdx && lockIdx < bookingIdx, 'el lock debe preceder a las escrituras');
    assert.deepEqual(opNames('tx'), ['customer.create', 'booking.create', 'bookingStatusHistory.create']);
  });

  test('sin empleado se bloquea la fila de la sucursal', async () => {
    const r = await call(bookingsPublicRouter, 'POST', '/', createBody());

    assert.equal(r.status, 201);
    assert.deepEqual(locks().map((lock) => rawQuery(lock)), [
      { query: 'SELECT id FROM crm.sucursal WHERE id = ? FOR UPDATE', values: [LOC] },
    ]);
    for (const lock of locks()) assert.equal(lock.client, 'tx');
  });

  test('comportamiento previo: reserva pública válida → 201 {id, message}', async () => {
    const r = await call(bookingsPublicRouter, 'POST', '/', createBody({ employeeId: EMP }));

    assert.equal(r.status, 201);
    assert.deepEqual(Object.keys(r.body).sort(), ['id', 'message']);
    assert.equal(r.body.message, 'Reserva creada con éxito');
    assert.ok(typeof r.body.id === 'string' && r.body.id.length > 0);
  });

  test('comportamiento previo: hueco ocupado → 409 availability y nada se escribe', async () => {
    fake.reset({
      ...base,
      booking: [{
        id: 'bBusy', businessId: BIZ, employeeId: EMP, locationId: LOC, serviceId: SVC,
        status: 'CONFIRMED',
        startAt: new Date('2026-12-01T09:45:00.000Z'), endAt: new Date('2026-12-01T10:15:00.000Z'),
      }],
    });

    const r = await call(bookingsPublicRouter, 'POST', '/', createBody({ employeeId: EMP }));

    assert.equal(r.status, 409);
    assert.equal(r.body?.error?.code, 'availability');
    assert.equal(r.body?.error?.message, 'No disponible');
    assert.equal(r.body?.error?.reason, 'employee_busy');
    assert.deepEqual(dataWrites('tx'), [], 'un conflicto no puede escribir nada');
    assert.deepEqual(rootClientUse(), []);
  });

  test('comportamiento previo: negocio inexistente → 404, sucursal ajena → 400, sin escribir', async () => {
    const noBiz = await call(bookingsPublicRouter, 'POST', '/', createBody({ businessId: 'cm5z9x0ab0000abcd1234efg9' }));
    assert.equal(noBiz.status, 404);
    assert.equal(noBiz.body?.error?.code, 'not_found');

    const noLoc = await call(bookingsPublicRouter, 'POST', '/', createBody({ locationId: 'cm5z9x0ab0000abcd1234efg8' }));
    assert.equal(noLoc.status, 400);
    assert.equal(noLoc.body?.error?.code, 'location_not_found');

    const noEmp = await call(bookingsPublicRouter, 'POST', '/', createBody({ employeeId: 'cm5z9x0ab0000abcd1234efg7' }));
    assert.equal(noEmp.status, 400);
    assert.equal(noEmp.body?.error?.code, 'employee_not_found');

    assert.deepEqual(dataWrites('tx'), []);
    assert.deepEqual(rootClientUse(), []);
    assert.equal(transactionCount(), 0);
  });

  test('comportamiento previo: body inválido → 422 invalid sin abrir transacción', async () => {
    const r = await call(bookingsPublicRouter, 'POST', '/', { businessId: BIZ });

    assert.equal(r.status, 422);
    assert.equal(r.body?.error?.code, 'invalid');
    assert.equal(transactionCount(), 0);
    assert.deepEqual(dataWrites('tx'), []);
  });
});
