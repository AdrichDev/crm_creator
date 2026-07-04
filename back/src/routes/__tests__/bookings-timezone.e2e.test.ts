// E2E tests: AC0 (crm-editar-cita-persistencia WU0) — convención wall-clock única.
// Bug reportado: "pongo una hora y automáticamente pone otra". Causa: `checkAvailability`
// parseaba `start` (sin TZ) como hora LOCAL del servidor, pero se mostraba en UTC — la
// hora introducida y la mostrada divergían según la TZ del proceso Node. Fix: todo el
// pipeline (routes/bookings.ts + lib/availability.ts) trata `start` como wall-clock UTC.
//
// Este fichero prueba dos veces la MISMA aserción (POST hora H → GET hora H):
//   1) contra el back ya arrancado (localhost:4001, TZ del proceso que sea). Se ejecuta
//      siempre.
//   2) contra una instancia AISLADA del back, arrancada aquí mismo con TZ=America/New_York
//      forzada — descarta cualquier dependencia residual de hora local. OPT-IN
//      (RUN_TZ_FORCED_E2E=1): arrancar un server completo abre su propio pool de
//      conexiones Prisma: corriendo junto al resto de la suite en paralelo (75 ficheros,
//      cada uno con su propio pool) puede agotar el límite de conexiones del pooler de
//      Supabase (EMAXCONNSESSION) y tumbar tests de OTROS ficheros por colateral. Correr
//      manualmente con `RUN_TZ_FORCED_E2E=1 node --import tsx --test
//      src/routes/__tests__/bookings-timezone.e2e.test.ts` para la verificación completa.
//
// Requires the back running at localhost:4001 + live Supabase credentials.
//
// Runner: node --import tsx --test
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { prisma } from '../../prisma.js';
import {
  api, probeBack, resetRateLimits, registerAndToken, cleanup, uniq, SUPABASE_LIVE, SB_URL, SB_SRK,
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

/** Día siguiente (YYYY-MM-DD) en UTC — usado como `to` exclusivo-superior para que
 * el filtro `from/to` de GET /bookings cubra el día completo sin ambigüedad de TZ. */
function nextDateStr(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

test('AC0: POST con hora H → GET devuelve la MISMA hora H (wall-clock, sin desplazamiento de TZ)', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const auth = await registerAndToken(`tz_wallclock_${uniq()}@test.local`, 'Tz-pass-1234', t);
  if (!auth) return;
  const { token, businessId } = auth;

  const location = await prisma.location.create({ data: { businessId, nombre: 'Sede' } });
  const { date, dow } = futureDate(30);
  await prisma.openingHour.create({ data: { locationId: location.id, diaSemana: dow, apertura: '09:00', cierre: '20:00' } });
  const service = await prisma.service.create({ data: { businessId, nombre: 'Corte', duracion: 30, precio: 0, requiereProfesional: false } });

  const create = await api('/bookings', {
    method: 'POST',
    body: JSON.stringify({ locationId: location.id, serviceId: service.id, start: `${date}T09:30:00` }),
  }, token, businessId);
  assert.equal(create.status, 201, `expected 201, got ${create.status}: ${JSON.stringify(create.body)}`);

  const list = await api(`/bookings?from=${date}&to=${nextDateStr(date)}`, {}, token, businessId);
  assert.equal(list.status, 200);
  const row = (list.body!.items as Array<{ hora: string; fecha: string }>).find((x) => x.fecha === date);
  assert.equal(row?.hora, '09:30', 'la hora mostrada debe ser IDÉNTICA a la introducida');

  // Slots del día: la apertura 09:00 configurada debe ser el primer chip, sin desplazarse.
  const slots = await api(`/bookings/slots?date=${date}&serviceId=${service.id}&locationId=${location.id}`, {}, token, businessId);
  const slotList = slots.body!.slots as Array<{ hora: string; disponible: boolean }>;
  assert.equal(slotList[0]?.hora, '09:00', 'el primer slot debe coincidir con la apertura configurada');
});

/** Sondea /health hasta que responda 2xx o expire el timeout. */
async function waitForHealth(base: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${base}/health`);
      if (r.ok) return true;
    } catch { /* aún arrancando */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

test('AC0 (TZ forzada): idéntico resultado en una instancia aislada del back con TZ=America/New_York', async (t) => {
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');
  if (process.env.RUN_TZ_FORCED_E2E !== '1') {
    return t.skip('opt-in: set RUN_TZ_FORCED_E2E=1 (arranca un server completo con su propio pool de conexiones — agota el pooler de Supabase si corre junto al resto de la suite en paralelo)');
  }

  const port = 4300 + Math.floor(Math.random() * 500);
  const base = `http://localhost:${port}`;
  let child: ChildProcess | undefined;
  let userId: string | undefined;
  let businessId: string | undefined;

  try {
    child = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(port), TZ: 'America/New_York', NODE_ENV: 'test', DB_POOL_MAX: '2' },
      stdio: 'ignore',
    });
    const up = await waitForHealth(base, 20000);
    if (!up) return t.skip('no se pudo arrancar la instancia aislada del back con TZ forzada');

    // Fixture creado por inserción directa (Supabase admin + Prisma), NO vía HTTP
    // contra la instancia aislada: POST /auth/register fue retirado
    // (crm-retirar-auth-register). El sign-in es directo contra Supabase, así que
    // es independiente de qué instancia del back esté arrancada.
    const email = `tz_forced_${uniq()}@test.local`;
    const password = 'Tz-pass-1234';
    const auth = await registerAndToken(email, password, t);
    if (!auth) return;
    businessId = auth.businessId;
    userId = auth.userId;
    const token = auth.token;

    const location = await prisma.location.create({ data: { businessId, nombre: 'Sede TZ' } });
    const { date, dow } = futureDate(31);
    await prisma.openingHour.create({ data: { locationId: location.id, diaSemana: dow, apertura: '09:00', cierre: '20:00' } });
    const service = await prisma.service.create({ data: { businessId, nombre: 'Corte', duracion: 30, precio: 0, requiereProfesional: false } });

    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'x-business-id': businessId };
    const create = await fetch(`${base}/api/bookings`, {
      method: 'POST', headers,
      body: JSON.stringify({ locationId: location.id, serviceId: service.id, start: `${date}T09:30:00` }),
    });
    assert.equal(create.status, 201, `expected 201, got ${create.status}: ${await create.text()}`);

    const list = await fetch(`${base}/api/bookings?from=${date}&to=${nextDateStr(date)}`, { headers });
    const listBody = await list.json() as { items: Array<{ hora: string; fecha: string }> };
    const row = listBody.items.find((x) => x.fecha === date);
    assert.equal(row?.hora, '09:30', 'con TZ=America/New_York forzada, la hora mostrada sigue siendo IDÉNTICA a la introducida');

    const slots = await fetch(`${base}/api/bookings/slots?date=${date}&serviceId=${service.id}&locationId=${location.id}`, { headers });
    const slotsBody = await slots.json() as { slots: Array<{ hora: string; disponible: boolean }> };
    assert.equal(slotsBody.slots[0]?.hora, '09:00', 'con TZ forzada, el primer slot sigue coincidiendo con la apertura configurada');
  } finally {
    child?.kill();
    if (userId) {
      const sb = createClient(SB_URL, SB_SRK, { auth: { persistSession: false } });
      await sb.auth.admin.deleteUser(userId).catch((e) => console.error('[e2e cleanup]', e instanceof Error ? e.message : e));
    }
    if (businessId) await prisma.business.delete({ where: { id: businessId } }).catch((e) => console.error('[e2e cleanup]', e instanceof Error ? e.message : e));
  }
});
