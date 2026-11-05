// crm-security-hardening T3 (S3 / F-06): la creación de una reserva debe hacer la
// comprobación de disponibilidad y TODAS sus escrituras en el cliente de la
// transacción (`tx`), serializada por un lock de fila, y la transición de estado
// (estado + historial + consumo de bono + sesión) debe ser UNA sola transacción.
//
// LÍMITE: la serialización real (que dos POST concurrentes del mismo hueco no
// puedan committear ambos) depende del lock de fila de Postgres y solo se puede
// reproducir contra una BD real; el fake en memoria no ejecuta SQL. Aquí se prueba
// que el lock se EMITE dentro de la transacción y ANTES del insert, y que ninguna
// escritura sale por el cliente root.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installFakePrisma, call, type Seed, type Write } from './_fake-prisma.js';

const fake = installFakePrisma();
const { bookingsRouter } = await import('../bookings.js');

const START = '2026-12-01T10:00:00.000Z';

const base: Seed = {
  location: [{ id: 'lA', businessId: 'A', nombre: 'Sede', eliminadoEn: null }],
  employee: [
    { id: 'eA', businessId: 'A', nombre: 'Ana', eliminadoEn: null },
    { id: 'eB', businessId: 'A', nombre: 'Bea', eliminadoEn: null },
  ],
  service: [{
    id: 'sA', businessId: 'A', nombre: 'Corte', duracion: 30, activo: true,
    requiereProfesional: false, margenAntes: 0, margenDespues: 0, eliminadoEn: null,
  }],
  resource: [{ id: 'rA', businessId: 'A', nombre: 'Sala', estado: 'Activo', capacidad: 1, eliminadoEn: null }],
  customer: [{ id: 'cA', businessId: 'A', nombre: 'Cliente A', eliminadoEn: null }],
  business: [{ id: 'A', nombre: 'Negocio A' }],
  openingHour: [],
  booking: [],
  bookingStatusHistory: [],
  customerPackage: [],
  packageSession: [],
};

const createBody = (extra: Record<string, unknown> = {}) => ({
  locationId: 'lA', serviceId: 'sA', customerId: 'cA', start: START, ...extra,
});

/** Escrituras de datos (sin la marca de $transaction ni las queries crudas). */
const dataWrites = (tag: 'root' | 'tx') =>
  fake.writes.filter((w) => w.client === tag && w.model !== '$transaction' && w.model !== '$queryRaw');
const opNames = (tag: 'root' | 'tx') => dataWrites(tag).map((w) => `${w.model}.${w.op}`);
/** Cualquier uso del cliente root (escrituras o SQL crudo): debe ser cero. */
const rootClientUse = () => fake.writes.filter((w) => w.client === 'root' && w.model !== '$transaction');
const locks = () => fake.writes.filter((w) => w.model === '$queryRaw');
/** SQL + parámetros de una query cruda registrada por el fake. */
const rawQuery = (w: Write) => w.args as { query: string; values: unknown[] };
const transactionCount = () => fake.writes.filter((w) => w.model === '$transaction').length;

beforeEach(() => fake.reset(base));

describe('POST / — la creación corre dentro de la transacción', () => {
  test('disponibilidad, insert y historial se escriben por el cliente tx, no por el root', async () => {
    const r = await call(bookingsRouter, 'POST', '/', createBody({ employeeId: 'eA' }));
    assert.equal(r.status, 201);

    assert.deepEqual(opNames('tx'), ['booking.create', 'bookingStatusHistory.create']);
    assert.deepEqual(rootClientUse(), [], 'ninguna escritura ni SQL crudo puede salir por el cliente root');
    assert.equal(transactionCount(), 1, 'la creación debe ser UNA transacción interactiva');
  });

  test('el lock de fila del empleado se emite en la transacción y antes del insert', async () => {
    await call(bookingsRouter, 'POST', '/', createBody({ employeeId: 'eA' }));

    const lockIdx = fake.writes.findIndex((w) => w.model === '$queryRaw');
    assert.notEqual(lockIdx, -1, 'no se emitió ningún lock de fila');

    const lock = fake.writes[lockIdx];
    assert.equal(lock.client, 'tx', 'el lock debe correr en el cliente de la transacción');
    assert.deepEqual(rawQuery(lock), { query: 'SELECT id FROM crm.empleado WHERE id = ? FOR UPDATE', values: ['eA'] });

    const insertIdx = fake.writes.findIndex((w) => w.model === 'booking' && w.op === 'create');
    assert.ok(lockIdx < insertIdx, 'el lock debe preceder al insert');
  });

  test('sin empleado se bloquea la fila de la sucursal', async () => {
    const r = await call(bookingsRouter, 'POST', '/', createBody());
    assert.equal(r.status, 201);

    assert.deepEqual(locks().map((w) => w.args), [
      { query: 'SELECT id FROM crm.sucursal WHERE id = ? FOR UPDATE', values: ['lA'] },
    ]);
    for (const lock of locks()) assert.equal(lock.client, 'tx');
  });

  test('con recursos se bloquea cada recurso (orden estable), además del empleado', async () => {
    const r = await call(bookingsRouter, 'POST', '/', createBody({ employeeId: 'eA', resourceIds: ['rA'] }));
    assert.equal(r.status, 201);

    assert.deepEqual(locks().map((w) => w.args), [
      { query: 'SELECT id FROM crm.empleado WHERE id = ? FOR UPDATE', values: ['eA'] },
      { query: 'SELECT id FROM crm.recurso WHERE id = ? FOR UPDATE', values: ['rA'] },
    ]);
    for (const lock of locks()) assert.equal(lock.client, 'tx');
  });

  test('comportamiento previo: reserva válida → 201 con el mismo shape de body', async () => {
    const r = await call(bookingsRouter, 'POST', '/', createBody({ employeeId: 'eA' }));

    assert.equal(r.status, 201);
    assert.equal(r.body.status, 'PENDING');
    assert.equal(r.body.businessId, 'A');
    assert.equal(r.body.locationId, 'lA');
    assert.equal(r.body.serviceId, 'sA');
    assert.equal(r.body.customerId, 'cA');
    assert.equal(r.body.employeeId, 'eA');
    assert.equal(r.body.startAt, START);
    assert.equal(r.body.endAt, '2026-12-01T10:30:00.000Z');
    assert.equal(r.body.channel, 'MANUAL');
    assert.ok(typeof r.body.id === 'string' && r.body.id.length > 0);
  });

  test('comportamiento previo: hueco ocupado → 409 availability y nada se escribe', async () => {
    fake.reset({
      ...base,
      booking: [{
        id: 'bBusy', businessId: 'A', employeeId: 'eA', locationId: 'lA', serviceId: 'sA',
        status: 'CONFIRMED', startAt: new Date('2026-12-01T09:45:00.000Z'), endAt: new Date('2026-12-01T10:15:00.000Z'),
      }],
    });

    const r = await call(bookingsRouter, 'POST', '/', createBody({ employeeId: 'eA' }));

    assert.equal(r.status, 409);
    assert.equal(r.body?.error?.code, 'availability');
    assert.equal(r.body?.error?.message, 'No disponible');
    assert.equal(r.body?.error?.reason, 'employee_busy');
    assert.deepEqual(dataWrites('tx'), [], 'un conflicto no puede escribir nada');
    assert.deepEqual(rootClientUse(), []);
  });
});

describe('POST /:id/complete — la transición es una sola transacción', () => {
  const pendingBooking = {
    id: 'bA', businessId: 'A', status: 'PENDING', customerId: 'cA', serviceId: 'sA',
    employeeId: 'eA', locationId: 'lA', notes: null,
    startAt: new Date(START), endAt: new Date('2026-12-01T10:30:00.000Z'), eliminadoEn: null,
  };

  beforeEach(() => fake.reset({
    ...base,
    booking: [pendingBooking],
    customerPackage: [{
      id: 'cpA', businessId: 'A', customerId: 'cA', estado: 'ACTIVE',
      sesionesUsadas: 0, sesionesTotal: 2, compradoEn: new Date('2026-01-01T00:00:00.000Z'),
    }],
  }));

  test('estado, historial, consumo de bono y sesión: todas las escrituras por tx, una transacción', async () => {
    const r = await call(bookingsRouter, 'POST', '/bA/complete');

    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'COMPLETED');
    assert.deepEqual(opNames('tx'), [
      'booking.update', 'bookingStatusHistory.create',
      'customerPackage.update', 'packageSession.create',
    ]);
    assert.deepEqual(rootClientUse(), []);
    assert.equal(transactionCount(), 1);
    assert.equal(rawQuery(locks()[0]).query, 'SELECT id FROM crm.paquete_cliente WHERE id = ? FOR UPDATE');
    assert.deepEqual(rawQuery(locks()[0]).values, ['cpA']);
  });

  test('bono ya agotado: no se consume ni se crea sesión (re-chequeo dentro de la transacción)', async () => {
    fake.reset({
      ...base,
      booking: [pendingBooking],
      customerPackage: [{
        id: 'cpA', businessId: 'A', customerId: 'cA', estado: 'ACTIVE',
        sesionesUsadas: 2, sesionesTotal: 2, compradoEn: new Date('2026-01-01T00:00:00.000Z'),
      }],
    });

    const r = await call(bookingsRouter, 'POST', '/bA/complete');

    assert.equal(r.status, 200);
    assert.deepEqual(opNames('tx'), ['booking.update', 'bookingStatusHistory.create']);
    assert.deepEqual(rootClientUse(), []);
  });

  test('comportamiento previo: cita inexistente → 404 sin escribir', async () => {
    const r = await call(bookingsRouter, 'POST', '/no-existe/complete');

    assert.equal(r.status, 404);
    assert.equal(r.body?.error?.code, 'not_found');
    assert.deepEqual(rootClientUse(), []);
    assert.deepEqual(opNames('tx'), []);
  });

  // /cancel y /no-show comparten `transition`: siguen respondiendo igual y escribiendo en la tx.
  test('comportamiento previo: /cancel → 200 CANCELLED, historial en la tx', async () => {
    const r = await call(bookingsRouter, 'POST', '/bA/cancel');

    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'CANCELLED');
    assert.deepEqual(opNames('tx'), ['booking.update', 'bookingStatusHistory.create']);
    assert.deepEqual(rootClientUse(), []);
    assert.equal(transactionCount(), 1);
  });

  test('comportamiento previo: /no-show → 200 NO_SHOW', async () => {
    const r = await call(bookingsRouter, 'POST', '/bA/no-show');

    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'NO_SHOW');
    assert.deepEqual(opNames('tx'), ['booking.update', 'bookingStatusHistory.create']);
    assert.deepEqual(rootClientUse(), []);
  });
});

// checkAvailability gana un cliente opcional: sin segundo argumento debe seguir usando el
// global, igual que antes, para POST /check-availability (y PATCH /:id).
describe('comportamiento previo — checkAvailability con el cliente por defecto', () => {
  test('POST /check-availability con ids propios → 200 ok', async () => {
    const r = await call(bookingsRouter, 'POST', '/check-availability', {
      locationId: 'lA', serviceId: 'sA', employeeId: 'eA', start: '2026-12-01T10:00:00.000Z',
    });

    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.equal(r.body.startAt, START);
    assert.equal(r.body.endAt, '2026-12-01T10:30:00.000Z');
    assert.deepEqual(dataWrites('tx'), [], 'una comprobación de disponibilidad no escribe');
  });
});

describe('PATCH /:id — la revalidación corre con lock dentro de la tx', () => {
  const patchBooking = {
    id: 'bA', businessId: 'A', status: 'PENDING', customerId: 'cA', serviceId: 'sA',
    employeeId: 'eA', locationId: 'lA', notes: null,
    startAt: new Date(START), endAt: new Date('2026-12-01T10:30:00.000Z'), eliminadoEn: null,
  };

  beforeEach(() => fake.reset({ ...base, booking: [patchBooking] }));

  test('reprogramar: lock del empleado en la tx y revalidación + escritura por tx', async () => {
    const r = await call(bookingsRouter, 'PATCH', '/bA', { start: '2026-12-01T12:00:00.000Z' });

    assert.equal(r.status, 200);
    assert.equal(r.body.startAt, '2026-12-01T12:00:00.000Z');
    assert.equal(r.body.endAt, '2026-12-01T12:30:00.000Z');
    assert.deepEqual(opNames('tx'), ['booking.update']);
    assert.deepEqual(rootClientUse(), []);
    assert.equal(transactionCount(), 1);

    const lockIdx = fake.writes.findIndex((w) => w.model === '$queryRaw');
    assert.notEqual(lockIdx, -1, 'no se emitió ningún lock de fila');
    assert.equal(fake.writes[lockIdx].client, 'tx');
    assert.deepEqual(rawQuery(fake.writes[lockIdx]), {
      query: 'SELECT id FROM crm.empleado WHERE id = ? FOR UPDATE', values: ['eA'],
    });
    const updateIdx = fake.writes.findIndex((w) => w.model === 'booking' && w.op === 'update');
    assert.ok(lockIdx < updateIdx, 'el lock debe preceder a la escritura');
  });

  test('reprogramar a un hueco ocupado → 409 availability y nada se escribe', async () => {
    fake.reset({
      ...base,
      booking: [patchBooking, {
        id: 'bBusy', businessId: 'A', employeeId: 'eA', locationId: 'lA', serviceId: 'sA',
        status: 'CONFIRMED', startAt: new Date('2026-12-01T11:50:00.000Z'), endAt: new Date('2026-12-01T12:10:00.000Z'),
      }],
    });

    const r = await call(bookingsRouter, 'PATCH', '/bA', { start: '2026-12-01T12:00:00.000Z' });

    assert.equal(r.status, 409);
    assert.equal(r.body?.error?.code, 'availability');
    assert.equal(r.body?.error?.message, 'No disponible');
    assert.equal(r.body?.error?.reason, 'employee_busy');
    assert.deepEqual(dataWrites('tx'), []);
  });

  test('cambiar solo notas: sin revalidación, escritura por tx y 200 como antes', async () => {
    const r = await call(bookingsRouter, 'PATCH', '/bA', { notes: 'Llamar antes' });

    assert.equal(r.status, 200);
    assert.equal(r.body.notes, 'Llamar antes');
    assert.deepEqual(opNames('tx'), ['booking.update']);
    assert.deepEqual(locks(), [], 'sin reprogramación no se toma lock de disponibilidad');
    assert.deepEqual(rootClientUse(), []);
  });

  test('comportamiento previo: cita inexistente → 404 y status inválido → 422, sin escribir', async () => {
    const missing = await call(bookingsRouter, 'PATCH', '/nope', { status: 'CONFIRMED' });
    assert.equal(missing.status, 404);
    assert.equal(missing.body?.error?.code, 'not_found');

    const invalid = await call(bookingsRouter, 'PATCH', '/bA', { status: 'NOPE' });
    assert.equal(invalid.status, 422);
    assert.equal(invalid.body?.error?.code, 'validation');

    assert.deepEqual(rootClientUse(), []);
    assert.deepEqual(dataWrites('tx'), []);
  });
});
