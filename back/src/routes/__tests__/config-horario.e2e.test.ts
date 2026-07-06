// E2E tests: horario de apertura del negocio (OpeningHour) en /config/horario.
// Espejo del suite de /employees/:id/horario: reemplazo atómico (PUT → GET
// exactamente esos tramos), validación diaSemana/HH:MM, scoping tenant (el PUT
// de un negocio no toca las filas del otro) y resolución de la sucursal del
// negocio activo (patrón [0]: primera Location activa).
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

// PUT con tramos partidos → GET devuelve exactamente esos (reemplazo atómico)
// y resuelve la sucursal del negocio (locationId de la respuesta).
test('PUT /config/horario reemplaza atómicamente y GET devuelve los tramos de la sucursal del negocio', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const auth = await registerAndToken(`horneg1_${uniq()}@test.local`, 'Horario-pass-1234', t);
  if (!auth) return;
  const { token, businessId } = auth;

  // La sucursal existe desde el alta; sembramos una fila previa para probar
  // que el PUT REEMPLAZA (no acumula).
  const location = await prisma.location.findFirst({ where: { businessId }, orderBy: { createdAt: 'asc' } });
  assert.ok(location, 'el alta debe haber creado la sucursal del negocio');
  await prisma.openingHour.create({ data: { locationId: location!.id, diaSemana: 3, apertura: '08:00', cierre: '12:00' } });

  // Horario partido L (2 tramos) + sábado (1 tramo).
  const tramos = [
    { diaSemana: 1, inicio: '09:00', fin: '14:00' },
    { diaSemana: 1, inicio: '16:00', fin: '19:00' },
    { diaSemana: 6, inicio: '10:00', fin: '14:00' },
  ];
  const put = await api('/config/horario', { method: 'PUT', body: JSON.stringify({ tramos }) }, token, businessId);
  assert.equal(put.status, 200, `expected 200, got ${put.status}: ${JSON.stringify(put.body)}`);
  assert.equal(put.body!.locationId, location!.id, 'el PUT debe resolver la sucursal [0] del negocio activo');

  const get = await api('/config/horario', {}, token, businessId);
  assert.equal(get.status, 200);
  assert.equal(get.body!.locationId, location!.id);
  const got = (get.body!.tramos as { diaSemana: number; inicio: string; fin: string }[])
    .map((x) => ({ diaSemana: x.diaSemana, inicio: x.inicio, fin: x.fin }));
  assert.deepEqual(got, tramos, 'GET debe devolver exactamente los 3 tramos del PUT (la fila previa del miércoles desaparece)');
});

// Validación de formato: diaSemana fuera de rango / HH:MM inválido → 400.
test('PUT /config/horario con diaSemana o HH:MM inválido → 400', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const auth = await registerAndToken(`horneg2_${uniq()}@test.local`, 'Horario-pass-1234', t);
  if (!auth) return;
  const { token, businessId } = auth;

  const badDay = await api('/config/horario', { method: 'PUT', body: JSON.stringify({ tramos: [{ diaSemana: 9, inicio: '09:00', fin: '10:00' }] }) }, token, businessId);
  assert.equal(badDay.status, 400, `expected 400 dia, got ${badDay.status}`);

  const badHora = await api('/config/horario', { method: 'PUT', body: JSON.stringify({ tramos: [{ diaSemana: 2, inicio: '9am', fin: '10:00' }] }) }, token, businessId);
  assert.equal(badHora.status, 400, `expected 400 hora, got ${badHora.status}`);

  // Tramo invertido (fin <= inicio) → 400 (validado en la API, no solo en el front).
  const inverted = await api('/config/horario', { method: 'PUT', body: JSON.stringify({ tramos: [{ diaSemana: 2, inicio: '18:00', fin: '09:00' }] }) }, token, businessId);
  assert.equal(inverted.status, 400, `expected 400 tramo invertido, got ${inverted.status}`);
});

// Dedupe: tramos idénticos enviados por el cliente no duplican filas OpeningHour.
test('PUT /config/horario colapsa tramos duplicados', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const auth = await registerAndToken(`horneg4_${uniq()}@test.local`, 'Horario-pass-1234', t);
  if (!auth) return;
  const { token, businessId } = auth;

  const dup = { diaSemana: 4, inicio: '09:00', fin: '17:00' };
  const put = await api('/config/horario', { method: 'PUT', body: JSON.stringify({ tramos: [dup, dup, dup] }) }, token, businessId);
  assert.equal(put.status, 200, `expected 200, got ${put.status}: ${JSON.stringify(put.body)}`);
  assert.deepEqual(put.body!.tramos, [dup], 'los 3 tramos idénticos deben colapsar a 1');
});

// Scoping tenant: el PUT del negocio A escribe SOLO en la sucursal de A;
// la sucursal de B queda intacta y su GET devuelve vacío.
test('PUT /config/horario escribe solo en la sucursal del negocio activo (tenant scoping)', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const a = await registerAndToken(`horneg3a_${uniq()}@test.local`, 'Horario-pass-1234', t);
  const b = await registerAndToken(`horneg3b_${uniq()}@test.local`, 'Horario-pass-1234', t);
  if (!a || !b) return;

  const put = await api('/config/horario', { method: 'PUT', body: JSON.stringify({ tramos: [{ diaSemana: 2, inicio: '09:00', fin: '17:00' }] }) }, a.token, a.businessId);
  assert.equal(put.status, 200, `expected 200, got ${put.status}: ${JSON.stringify(put.body)}`);

  const locB = await prisma.location.findFirst({ where: { businessId: b.businessId }, orderBy: { createdAt: 'asc' } });
  assert.ok(locB);
  const rowsB = await prisma.openingHour.count({ where: { locationId: locB!.id } });
  assert.equal(rowsB, 0, 'el negocio B no debe recibir filas del PUT de A');

  const getB = await api('/config/horario', {}, b.token, b.businessId);
  assert.equal(getB.status, 200);
  assert.deepEqual(getB.body!.tramos, [], 'GET de B debe devolver vacío');
});
