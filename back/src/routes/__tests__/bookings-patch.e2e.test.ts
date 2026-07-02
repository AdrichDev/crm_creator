// E2E tests: PATCH /bookings/:id (crm-editar-cita-persistencia WU1).
// El editor de citas debe persistir TODOS los campos editados, no solo `start`:
// status (validado contra el enum, registrado en el historial) y serviceId
// (revalida disponibilidad). Reprogramación/servicio en conflicto → 409 atómico.
// Requires the back running at localhost:4001 + live Supabase credentials.
//
// Runner: node --import tsx --test
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../prisma.js';
import {
  api, probeBack, resetRateLimits, registerAndToken, cleanup, uniq, SUPABASE_LIVE,
} from './_shared.e2e.js';

let backUp = false;

before(async () => { backUp = await probeBack(); if (!backUp) console.warn('[e2e] back no responde — tests saltados'); });
beforeEach(async () => { if (backUp) await resetRateLimits('register'); });
after(async () => { await cleanup(backUp); });

function futureDate(daysAhead: number): { date: string; dow: number } {
  const d = new Date(); d.setDate(d.getDate() + daysAhead);
  const date = d.toISOString().slice(0, 10);
  return { date, dow: new Date(date).getDay() };
}

test('PATCH /bookings/:id con status+employeeId persiste y registra el historial de estado', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const auth = await registerAndToken(`bkpatch_ok_${uniq()}@test.local`, 'Bkpatch-pass-1234', t);
  if (!auth) return;
  const { token, businessId, userId } = auth;

  const location = await prisma.location.create({ data: { businessId, nombre: 'Sede' } });
  const service = await prisma.service.create({ data: { businessId, nombre: 'Corte', duracion: 30, precio: 0, requiereProfesional: false } });
  const empA = await prisma.employee.create({ data: { businessId, nombre: 'Ana' } });
  const empB = await prisma.employee.create({ data: { businessId, nombre: 'Bea' } });
  const { date } = futureDate(20);
  // Z: convención wall-clock-como-UTC (crm-editar-cita-persistencia WU0).
  const start = new Date(`${date}T09:00:00Z`);
  const end = new Date(`${date}T09:30:00Z`);
  const booking = await prisma.booking.create({
    data: { businessId, locationId: location.id, serviceId: service.id, employeeId: empA.id, startAt: start, endAt: end, status: 'PENDING' },
  });

  const r = await api(`/bookings/${booking.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'CONFIRMED', employeeId: empB.id }),
  }, token, businessId);
  assert.equal(r.status, 200, `expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
  assert.equal(r.body!.status, 'CONFIRMED');
  assert.equal(r.body!.employeeId, empB.id);

  const row = await prisma.booking.findUnique({ where: { id: booking.id } });
  assert.equal(row?.status, 'CONFIRMED');
  assert.equal(row?.employeeId, empB.id);

  const history = await prisma.bookingStatusHistory.findMany({ where: { bookingId: booking.id } });
  assert.equal(history.length, 1, 'debe registrar una entrada de historial');
  assert.equal(history[0].estadoAnterior, 'PENDING');
  assert.equal(history[0].estadoNuevo, 'CONFIRMED');
  assert.equal(history[0].cambiadoPor, userId);
});

test('PATCH /bookings/:id con status inválido → 422 y no persiste', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const auth = await registerAndToken(`bkpatch_422_${uniq()}@test.local`, 'Bkpatch-pass-1234', t);
  if (!auth) return;
  const { token, businessId } = auth;

  const location = await prisma.location.create({ data: { businessId, nombre: 'Sede' } });
  const service = await prisma.service.create({ data: { businessId, nombre: 'Corte', duracion: 30, precio: 0, requiereProfesional: false } });
  const { date } = futureDate(21);
  const start = new Date(`${date}T09:00:00Z`);
  const end = new Date(`${date}T09:30:00Z`);
  const booking = await prisma.booking.create({
    data: { businessId, locationId: location.id, serviceId: service.id, startAt: start, endAt: end, status: 'PENDING' },
  });

  const r = await api(`/bookings/${booking.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'NO_EXISTE' }),
  }, token, businessId);
  assert.equal(r.status, 422, `expected 422, got ${r.status}: ${JSON.stringify(r.body)}`);

  const row = await prisma.booking.findUnique({ where: { id: booking.id } });
  assert.equal(row?.status, 'PENDING', 'el status inválido no debe persistir');
  const history = await prisma.bookingStatusHistory.findMany({ where: { bookingId: booking.id } });
  assert.equal(history.length, 0, 'no debe registrar historial si la validación falla');
});

test('PATCH /bookings/:id reprogramando a un hueco ocupado → 409 y nada se persiste (atómico)', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const auth = await registerAndToken(`bkpatch_409_${uniq()}@test.local`, 'Bkpatch-pass-1234', t);
  if (!auth) return;
  const { token, businessId } = auth;

  const location = await prisma.location.create({ data: { businessId, nombre: 'Sede' } });
  const { date, dow } = futureDate(22);
  await prisma.openingHour.create({ data: { locationId: location.id, diaSemana: dow, apertura: '09:00', cierre: '20:00' } });
  const employee = await prisma.employee.create({ data: { businessId, nombre: 'Ana' } });
  const service = await prisma.service.create({
    data: { businessId, nombre: 'Corte', duracion: 30, precio: 0, employees: { connect: { id: employee.id } } },
  });

  // Cita a mover (09:00-09:30) y cita bloqueante del mismo empleado (10:00-10:30).
  const editable = await prisma.booking.create({
    data: {
      businessId, locationId: location.id, serviceId: service.id, employeeId: employee.id,
      startAt: new Date(`${date}T09:00:00Z`), endAt: new Date(`${date}T09:30:00Z`), status: 'PENDING', notes: 'original',
    },
  });
  await prisma.booking.create({
    data: {
      businessId, locationId: location.id, serviceId: service.id, employeeId: employee.id,
      startAt: new Date(`${date}T10:00:00Z`), endAt: new Date(`${date}T10:30:00Z`), status: 'CONFIRMED',
    },
  });

  const r = await api(`/bookings/${editable.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ start: `${date}T10:00:00`, status: 'CONFIRMED', notes: 'no debería guardarse' }),
  }, token, businessId);
  assert.equal(r.status, 409, `expected 409, got ${r.status}: ${JSON.stringify(r.body)}`);

  const row = await prisma.booking.findUnique({ where: { id: editable.id } });
  assert.equal(row?.status, 'PENDING', 'el conflicto no debe cambiar el status');
  assert.equal(row?.notes, 'original', 'el conflicto no debe cambiar las notas');
  assert.equal(row?.startAt.toISOString(), new Date(`${date}T09:00:00Z`).toISOString(), 'el conflicto no debe mover la hora');
  const history = await prisma.bookingStatusHistory.findMany({ where: { bookingId: editable.id } });
  assert.equal(history.length, 0, 'no debe registrar historial si la disponibilidad falla');
});
