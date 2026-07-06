// E2E tests: GET /bookings/stats (crm-operaos fix 2).
// Totales GLOBALES por estado para el resumen de /citas — independientes del rango
// visible del calendario y de la paginación. Requires the back running at
// localhost:4001 + live Supabase credentials.
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

test('GET /bookings/stats agrega por estado sobre TODAS las citas (ignora rango y paginación)', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const auth = await registerAndToken(`stats_${uniq()}@test.local`, 'Stats-pass-1234', t);
  if (!auth) return;
  const { token, businessId } = auth;

  const location = await prisma.location.create({ data: { businessId, nombre: 'Sede' } });
  const service = await prisma.service.create({ data: { businessId, nombre: 'Corte', duracion: 30, precio: 0, requiereProfesional: false } });

  // Citas repartidas en meses distintos (paged/rango solo vería uno) y en estados
  // variados: 2 CONFIRMED, 1 PENDING, 1 COMPLETED, 1 CANCELLED, 1 borrada (soft delete).
  const mk = (month: string, day: string, status: 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED', eliminadoEn?: Date) =>
    prisma.booking.create({
      data: {
        businessId, locationId: location.id, serviceId: service.id,
        startAt: new Date(`2026-${month}-${day}T10:00:00Z`), endAt: new Date(`2026-${month}-${day}T10:30:00Z`),
        status, eliminadoEn: eliminadoEn ?? null,
      },
    });
  await mk('01', '10', 'CONFIRMED');
  await mk('02', '11', 'CONFIRMED');
  await mk('03', '12', 'PENDING');
  await mk('04', '13', 'COMPLETED');
  await mk('05', '14', 'CANCELLED');
  await mk('06', '15', 'PENDING', new Date()); // borrada: no debe contar

  const r = await api('/bookings/stats', {}, token, businessId);
  assert.equal(r.status, 200, `expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
  const body = r.body as { total: number; confirmadas: number; pendientes: number };
  assert.equal(body.total, 5, 'total cuenta todas las citas no eliminadas (5)');
  assert.equal(body.confirmadas, 2, 'confirmadas = 2 CONFIRMED');
  assert.equal(body.pendientes, 1, 'pendientes = 1 PENDING (la otra está borrada)');
});
