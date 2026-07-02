// E2E tests: GET /bookings/slots (crm-citas-ux-agenda WU2).
// Chips de hora para nueva cita: horario de apertura + paso = duración del servicio +
// solapes de bookings no cancelados (AC2 en validation.md).
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

type Slot = { hora: string; disponible: boolean };

/** Fecha (YYYY-MM-DD) a N días vista, junto con el día de semana que resolverá
 * `new Date(fecha).getDay()` en el back — mismo cómputo que iterateDaySlots, así
 * el test crea el OpeningHour para el día correcto sin depender de qué día es hoy. */
function futureDate(daysAhead: number): { date: string; dow: number } {
  const d = new Date(); d.setDate(d.getDate() + daysAhead);
  const date = d.toISOString().slice(0, 10);
  return { date, dow: new Date(date).getDay() };
}

test('GET /bookings/slots básico: horario 9-20, servicio 30min → chips 09:00..19:30 cada 30', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const auth = await registerAndToken(`slots_basic_${uniq()}@test.local`, 'Slots-pass-1234', t);
  if (!auth) return;
  const { token, businessId } = auth;

  const location = await prisma.location.create({ data: { businessId, nombre: 'Sede' } });
  const { date, dow } = futureDate(10);
  await prisma.openingHour.create({ data: { locationId: location.id, diaSemana: dow, apertura: '09:00', cierre: '20:00' } });
  const service = await prisma.service.create({ data: { businessId, nombre: 'Corte', duracion: 30, precio: 0, requiereProfesional: false } });

  const r = await api(`/bookings/slots?date=${date}&serviceId=${service.id}&locationId=${location.id}`, {}, token, businessId);
  assert.equal(r.status, 200, `expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
  const slots = r.body!.slots as Slot[];
  assert.equal(slots.length, 22, `esperaba 22 chips (09:00..19:30 cada 30'), recibí ${slots.length}`);
  assert.equal(slots[0].hora, '09:00');
  assert.equal(slots.at(-1)!.hora, '19:30');
  assert.ok(slots.every((s) => s.disponible === true), 'sin citas, todos deberían estar disponibles');
});

test('GET /bookings/slots ocupado: cita 10:00-10:30 del empleado X → 10:00 disponible:false, 10:30 true', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const auth = await registerAndToken(`slots_busy_${uniq()}@test.local`, 'Slots-pass-1234', t);
  if (!auth) return;
  const { token, businessId } = auth;

  const location = await prisma.location.create({ data: { businessId, nombre: 'Sede' } });
  const { date, dow } = futureDate(11);
  await prisma.openingHour.create({ data: { locationId: location.id, diaSemana: dow, apertura: '09:00', cierre: '20:00' } });
  const employee = await prisma.employee.create({ data: { businessId, nombre: 'Ana' } });
  const service = await prisma.service.create({
    data: { businessId, nombre: 'Corte', duracion: 30, precio: 0, employees: { connect: { id: employee.id } } },
  });
  // Z: convención wall-clock-como-UTC (crm-editar-cita-persistencia WU0) — el mismo
  // instante "10:00" que interpretaría el back al recibir `start` sin TZ.
  const start = new Date(`${date}T10:00:00Z`);
  const end = new Date(`${date}T10:30:00Z`);
  await prisma.booking.create({
    data: { businessId, locationId: location.id, serviceId: service.id, employeeId: employee.id, startAt: start, endAt: end, status: 'CONFIRMED' },
  });

  const r = await api(`/bookings/slots?date=${date}&serviceId=${service.id}&employeeId=${employee.id}&locationId=${location.id}`, {}, token, businessId);
  assert.equal(r.status, 200, `expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
  const slots = r.body!.slots as Slot[];
  const at10 = slots.find((s) => s.hora === '10:00');
  const at1030 = slots.find((s) => s.hora === '10:30');
  assert.equal(at10?.disponible, false, '10:00 solapa con la cita del empleado');
  assert.equal(at1030?.disponible, true, '10:30 ya está libre');
});

test('GET /bookings/slots empleado concreto vs cualquiera: sin employeeId el hueco ocupado de un empleado no bloquea', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const auth = await registerAndToken(`slots_anyemp_${uniq()}@test.local`, 'Slots-pass-1234', t);
  if (!auth) return;
  const { token, businessId } = auth;

  const location = await prisma.location.create({ data: { businessId, nombre: 'Sede' } });
  const { date, dow } = futureDate(12);
  await prisma.openingHour.create({ data: { locationId: location.id, diaSemana: dow, apertura: '09:00', cierre: '20:00' } });
  const employee = await prisma.employee.create({ data: { businessId, nombre: 'Bea' } });
  const service = await prisma.service.create({
    data: { businessId, nombre: 'Corte', duracion: 30, precio: 0, requiereProfesional: false, employees: { connect: { id: employee.id } } },
  });
  // Z: convención wall-clock-como-UTC (crm-editar-cita-persistencia WU0) — el mismo
  // instante "10:00" que interpretaría el back al recibir `start` sin TZ.
  const start = new Date(`${date}T10:00:00Z`);
  const end = new Date(`${date}T10:30:00Z`);
  await prisma.booking.create({
    data: { businessId, locationId: location.id, serviceId: service.id, employeeId: employee.id, startAt: start, endAt: end, status: 'CONFIRMED' },
  });

  // Con empleado concreto: 10:00 ocupado.
  const withEmp = await api(`/bookings/slots?date=${date}&serviceId=${service.id}&employeeId=${employee.id}&locationId=${location.id}`, {}, token, businessId);
  const slotsWithEmp = withEmp.body!.slots as Slot[];
  assert.equal(slotsWithEmp.find((s) => s.hora === '10:00')?.disponible, false);

  // Sin employeeId ("cualquiera"): el hueco ocupado de ESE empleado no bloquea el chip.
  const anyEmp = await api(`/bookings/slots?date=${date}&serviceId=${service.id}&locationId=${location.id}`, {}, token, businessId);
  assert.equal(anyEmp.status, 200, `expected 200, got ${anyEmp.status}: ${JSON.stringify(anyEmp.body)}`);
  const slotsAnyEmp = anyEmp.body!.slots as Slot[];
  assert.equal(slotsAnyEmp.find((s) => s.hora === '10:00')?.disponible, true);
});

test('GET /bookings/slots día cerrado: sin OpeningHour → lista vacía', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const auth = await registerAndToken(`slots_closed_${uniq()}@test.local`, 'Slots-pass-1234', t);
  if (!auth) return;
  const { token, businessId } = auth;

  const location = await prisma.location.create({ data: { businessId, nombre: 'Sede' } });
  const service = await prisma.service.create({ data: { businessId, nombre: 'Corte', duracion: 30, precio: 0, requiereProfesional: false } });
  const { date } = futureDate(13); // sin OpeningHour creado para este día → cerrado

  const r = await api(`/bookings/slots?date=${date}&serviceId=${service.id}&locationId=${location.id}`, {}, token, businessId);
  assert.equal(r.status, 200, `expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
  assert.deepEqual(r.body!.slots, []);
});

test('GET /bookings/slots sin date/serviceId → 422 validation', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const auth = await registerAndToken(`slots_valid_${uniq()}@test.local`, 'Slots-pass-1234', t);
  if (!auth) return;
  const { token, businessId } = auth;

  const r = await api('/bookings/slots', {}, token, businessId);
  assert.equal(r.status, 422);
});
