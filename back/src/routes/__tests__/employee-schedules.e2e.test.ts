// E2E tests: horario semanal del empleado (EmployeeSchedule) en /employees/:id/horario.
// Cubre 3.2.a: reemplazo atómico (PUT 3 tramos → GET exactamente esos), validación
// diaSemana/HH:MM, y scoping tenant (empleado de otro negocio → 404).
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

// 3.2.a — PUT 3 tramos → GET devuelve exactamente esos (reemplazo atómico)
test('PUT /employees/:id/horario con 3 tramos → GET devuelve exactamente esos', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const auth = await registerAndToken(`sched1_${uniq()}@test.local`, 'Sched-pass-1234', t);
  if (!auth) return;
  const { token, businessId } = auth;
  const emp = await prisma.employee.create({ data: { businessId, nombre: 'Ana', rol: 'Estilista' } });

  // Horario inicial (2 tramos) para probar que el PUT REEMPLAZA, no acumula.
  await prisma.employeeSchedule.create({ data: { employeeId: emp.id, diaSemana: 3, inicio: '08:00', fin: '12:00' } });

  const tramos = [
    { diaSemana: 1, inicio: '09:00', fin: '13:00' },
    { diaSemana: 1, inicio: '16:00', fin: '20:00' },
    { diaSemana: 5, inicio: '10:00', fin: '14:00' },
  ];
  const put = await api(`/employees/${emp.id}/horario`, { method: 'PUT', body: JSON.stringify({ tramos }) }, token, businessId);
  assert.equal(put.status, 200, `expected 200, got ${put.status}: ${JSON.stringify(put.body)}`);

  const get = await api(`/employees/${emp.id}/horario`, {}, token, businessId);
  const got = (get.body!.tramos as { diaSemana: number; inicio: string; fin: string }[]).map((x) => ({ diaSemana: x.diaSemana, inicio: x.inicio, fin: x.fin }));
  assert.deepEqual(got, tramos, 'GET debe devolver exactamente los 3 tramos del PUT (ordenados por dia/inicio)');

  await prisma.employee.delete({ where: { id: emp.id } }).catch((e) => console.error('[e2e cleanup]', e instanceof Error ? e.message : e));
});

// 3.2.a — validación de formato (diaSemana fuera de rango / HH:MM inválido → 400)
test('PUT /employees/:id/horario con diaSemana o HH:MM inválido → 400', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const auth = await registerAndToken(`sched2_${uniq()}@test.local`, 'Sched-pass-1234', t);
  if (!auth) return;
  const { token, businessId } = auth;
  const emp = await prisma.employee.create({ data: { businessId, nombre: 'Bea', rol: 'Barbero' } });

  const badDay = await api(`/employees/${emp.id}/horario`, { method: 'PUT', body: JSON.stringify({ tramos: [{ diaSemana: 9, inicio: '09:00', fin: '10:00' }] }) }, token, businessId);
  assert.equal(badDay.status, 400, `expected 400 dia, got ${badDay.status}`);

  const badHora = await api(`/employees/${emp.id}/horario`, { method: 'PUT', body: JSON.stringify({ tramos: [{ diaSemana: 2, inicio: '9am', fin: '10:00' }] }) }, token, businessId);
  assert.equal(badHora.status, 400, `expected 400 hora, got ${badHora.status}`);

  await prisma.employee.delete({ where: { id: emp.id } }).catch((e) => console.error('[e2e cleanup]', e instanceof Error ? e.message : e));
});

// 3.2.a — empleado de OTRO negocio → 404 (scoping tenant)
test('PUT /employees/:id/horario de empleado ajeno → 404', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const a = await registerAndToken(`sched3a_${uniq()}@test.local`, 'Sched-pass-1234', t);
  const b = await registerAndToken(`sched3b_${uniq()}@test.local`, 'Sched-pass-1234', t);
  if (!a || !b) return;
  const empB = await prisma.employee.create({ data: { businessId: b.businessId, nombre: 'Ajeno', rol: 'Estilista' } });

  // A intenta editar el horario de un empleado de B → 404 (no existe en su negocio).
  const put = await api(`/employees/${empB.id}/horario`, { method: 'PUT', body: JSON.stringify({ tramos: [] }) }, a.token, a.businessId);
  assert.equal(put.status, 404, `expected 404, got ${put.status}: ${JSON.stringify(put.body)}`);

  await prisma.employee.delete({ where: { id: empB.id } }).catch((e) => console.error('[e2e cleanup]', e instanceof Error ? e.message : e));
});
