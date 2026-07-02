// E2E tests: POST /customers/geocode/rerun (crm-geo-real-clientes WU1).
// Batch de geocodificación: procesa PENDING/FAILED con dirección; `force=true` incluye
// también OK (corrige sembrados sintéticos); lote acotado por invocación; resumen
// {ok, failed, skipped}. El back corre como proceso aparte (localhost:4001): el
// geocoder de prueba se inyecta vía HTTP (POST /customers/__test__/set-geocoder,
// mismo patrón que /auth/__test__/reset-rate-limits) — nunca llama a Nominatim real.
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

/** Activa el geocoder de prueba en el back (proceso aparte). "FAIL" en la dirección no resuelve. */
async function useFakeGeocoder(token: string, businessId: string): Promise<void> {
  await api('/customers/__test__/set-geocoder', { method: 'POST', body: JSON.stringify({ mode: 'fake' }) }, token, businessId);
}
async function restoreRealGeocoder(token: string, businessId: string): Promise<void> {
  await api('/customers/__test__/set-geocoder', { method: 'POST', body: JSON.stringify({ mode: 'real' }) }, token, businessId);
}

test('POST /customers/geocode/rerun: procesa PENDING/FAILED con dirección, salta sin dirección, no toca OK', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const auth = await registerAndToken(`geo_rerun_ok_${uniq()}@test.local`, 'Geo-pass-1234', t);
  if (!auth) return;
  const { token, businessId } = auth;
  await useFakeGeocoder(token, businessId);
  try {
    const cOk = await prisma.customer.create({ data: { businessId, nombre: 'Resuelve', direccion: 'Calle Mayor 1', geoEstado: 'PENDING' } });
    const cFail = await prisma.customer.create({ data: { businessId, nombre: 'NoResuelve', direccion: 'FAIL Street', geoEstado: 'FAILED' } });
    const cSinDireccion = await prisma.customer.create({ data: { businessId, nombre: 'SinDireccion', geoEstado: 'PENDING' } });
    const cYaOk = await prisma.customer.create({ data: { businessId, nombre: 'YaUbicado', direccion: 'Calle Vieja', geoEstado: 'OK', latitud: 1, longitud: 1 } });

    const r = await api('/customers/geocode/rerun', { method: 'POST', body: JSON.stringify({}) }, token, businessId);
    assert.equal(r.status, 200, `expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert.deepEqual(r.body, { ok: 1, failed: 1, skipped: 1 });

    const rows = await prisma.customer.findMany({ where: { id: { in: [cOk.id, cFail.id, cSinDireccion.id, cYaOk.id] } } });
    const byId = new Map(rows.map((x) => [x.id, x]));
    assert.equal(byId.get(cOk.id)?.geoEstado, 'OK');
    assert.equal(byId.get(cOk.id)?.latitud, 40.4);
    assert.equal(byId.get(cFail.id)?.geoEstado, 'FAILED');
    assert.equal(byId.get(cSinDireccion.id)?.geoEstado, 'PENDING', 'sin dirección no se toca (queda pendiente)');
    assert.equal(byId.get(cYaOk.id)?.latitud, 1, 'sin force, un cliente ya OK no se reprocesa');
  } finally {
    await restoreRealGeocoder(token, businessId);
  }
});

test('POST /customers/geocode/rerun con force=true reprocesa también los OK (corrige sembrados)', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const auth = await registerAndToken(`geo_rerun_force_${uniq()}@test.local`, 'Geo-pass-1234', t);
  if (!auth) return;
  const { token, businessId } = auth;
  await useFakeGeocoder(token, businessId);
  try {
    const cSintetico = await prisma.customer.create({
      data: { businessId, nombre: 'Sintetico', direccion: 'Calle Alcalá 20', geoEstado: 'OK', latitud: 40.3768, longitud: -3.7438 },
    });

    const r = await api('/customers/geocode/rerun', { method: 'POST', body: JSON.stringify({ force: true }) }, token, businessId);
    assert.equal(r.status, 200, `expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert.equal((r.body as { ok: number }).ok, 1);

    const row = await prisma.customer.findUnique({ where: { id: cSintetico.id } });
    assert.equal(row?.geoEstado, 'OK');
    assert.equal(row?.latitud, 40.4, 'force debe recalcular las coords aunque ya estuviera OK');
  } finally {
    await restoreRealGeocoder(token, businessId);
  }
});

test('POST /customers/geocode/rerun respeta el lote máximo por invocación', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const auth = await registerAndToken(`geo_rerun_batch_${uniq()}@test.local`, 'Geo-pass-1234', t);
  if (!auth) return;
  const { token, businessId } = auth;
  await useFakeGeocoder(token, businessId);
  try {
    const TOTAL = 61;
    await prisma.customer.createMany({
      data: Array.from({ length: TOTAL }, (_, i) => ({ businessId, nombre: `Batch ${i}`, direccion: `Calle ${i}`, geoEstado: 'PENDING' as const })),
    });

    const r = await api('/customers/geocode/rerun', { method: 'POST', body: JSON.stringify({}) }, token, businessId);
    assert.equal(r.status, 200, `expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    const body = r.body as { ok: number; failed: number; skipped: number };
    assert.equal(body.ok + body.failed + body.skipped, 60, 'el lote no debe procesar más de 60 por invocación');

    const stillPending = await prisma.customer.count({ where: { businessId, geoEstado: 'PENDING' } });
    assert.equal(stillPending, 1, 'el resto queda pendiente para una invocación posterior');
  } finally {
    await restoreRealGeocoder(token, businessId);
  }
});
