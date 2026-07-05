// E2E tests: GET /fichaje/hoy + POST /fichaje (crm-operaos WU6, AC6).
// Máquina de estados del fichaje: bloquea saltos, repetidos y fichajes extra tras
// completar la jornada. Requires the back running at localhost:4001 + live Supabase
// credentials.
//
// Runner: node --import tsx --test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../prisma.js';
import { api, probeBack, registerAndToken, cleanup, uniq, SUPABASE_LIVE } from './_shared.e2e.js';

let backUp = false;
before(async () => { backUp = await probeBack(); if (!backUp) console.warn('[e2e] back no responde — tests saltados'); });
after(async () => { await cleanup(backUp); });

/** Registra un owner + lo vincula como Employee del negocio (fichaje es self-service). */
async function withEmployee(t: import('node:test').TestContext) {
  const auth = await registerAndToken(`fichaje_${uniq()}@test.local`, 'Fichaje-pass-1234', t);
  if (!auth) return null;
  const employee = await prisma.employee.create({ data: { businessId: auth.businessId, userId: auth.userId, nombre: 'Empleada Test' } });
  return { ...auth, employeeId: employee.id };
}

test('GET /fichaje/hoy sin eventos → modo null, siguientePaso null', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');
  const ctx = await withEmployee(t);
  if (!ctx) return;

  const r = await api('/fichaje/hoy', {}, ctx.token, ctx.businessId);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body!.modo, null);
  assert.equal(r.body!.siguientePaso, null);
  assert.deepEqual(r.body!.eventos, []);
});

test('jornada intensiva: entrada → salida_final → bloquea un tercer fichaje', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');
  const ctx = await withEmployee(t);
  if (!ctx) return;

  const r1 = await api('/fichaje', { method: 'POST', body: JSON.stringify({ modo: 'intensiva' }) }, ctx.token, ctx.businessId);
  assert.equal(r1.status, 201, JSON.stringify(r1.body));
  assert.equal(r1.body!.paso, 'entrada');

  const hoy = await api('/fichaje/hoy', {}, ctx.token, ctx.businessId);
  assert.equal(hoy.body!.siguientePaso, 'salida_final');

  const r2 = await api('/fichaje', { method: 'POST', body: JSON.stringify({ modo: 'intensiva' }) }, ctx.token, ctx.businessId);
  assert.equal(r2.status, 201, JSON.stringify(r2.body));
  assert.equal(r2.body!.paso, 'salida_final');

  const r3 = await api('/fichaje', { method: 'POST', body: JSON.stringify({ modo: 'intensiva' }) }, ctx.token, ctx.businessId);
  assert.equal(r3.status, 409, 'una jornada completa no debe admitir un tercer fichaje');
  assert.equal((r3.body!.error as { code: string }).code, 'jornada_completa');
});

test('jornada partida: no permite saltar salida_comida/entrada_comida directo a salida_final', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');
  const ctx = await withEmployee(t);
  if (!ctx) return;

  const entrada = await api('/fichaje', { method: 'POST', body: JSON.stringify({ modo: 'partida' }) }, ctx.token, ctx.businessId);
  assert.equal(entrada.body!.paso, 'entrada');

  // El back ficha SIEMPRE el siguiente paso permitido — no hay forma de "pedir" saltar
  // uno, así que la garantía se valida vía /hoy: el siguiente sigue siendo salida_comida.
  const hoy = await api('/fichaje/hoy', {}, ctx.token, ctx.businessId);
  assert.equal(hoy.body!.siguientePaso, 'salida_comida');

  const salidaComida = await api('/fichaje', { method: 'POST', body: JSON.stringify({ modo: 'partida' }) }, ctx.token, ctx.businessId);
  assert.equal(salidaComida.body!.paso, 'salida_comida');
  const entradaComida = await api('/fichaje', { method: 'POST', body: JSON.stringify({ modo: 'partida' }) }, ctx.token, ctx.businessId);
  assert.equal(entradaComida.body!.paso, 'entrada_comida');
  const salidaFinal = await api('/fichaje', { method: 'POST', body: JSON.stringify({ modo: 'partida' }) }, ctx.token, ctx.businessId);
  assert.equal(salidaFinal.body!.paso, 'salida_final');

  const extra = await api('/fichaje', { method: 'POST', body: JSON.stringify({ modo: 'partida' }) }, ctx.token, ctx.businessId);
  assert.equal(extra.status, 409);
});

test('no permite cambiar de modo a mitad de la jornada del día', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');
  const ctx = await withEmployee(t);
  if (!ctx) return;

  await api('/fichaje', { method: 'POST', body: JSON.stringify({ modo: 'intensiva' }) }, ctx.token, ctx.businessId);
  const r = await api('/fichaje', { method: 'POST', body: JSON.stringify({ modo: 'partida' }) }, ctx.token, ctx.businessId);
  assert.equal(r.status, 409);
  assert.equal((r.body!.error as { code: string }).code, 'modo_mismatch');
});

test('usuario sin Employee vinculado → 404 no_employee', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');
  const auth = await registerAndToken(`fichaje_noemp_${uniq()}@test.local`, 'Fichaje-pass-1234', t);
  if (!auth) return;

  const r = await api('/fichaje/hoy', {}, auth.token, auth.businessId);
  assert.equal(r.status, 404);
  assert.equal((r.body!.error as { code: string }).code, 'no_employee');
});
