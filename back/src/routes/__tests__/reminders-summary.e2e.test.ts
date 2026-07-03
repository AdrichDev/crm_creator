// E2E test: contadores de recordatorios en GET /reminders/summary (crm-comercial-colores-seguimiento WU3).
// Cubre AC5 (validation.md): cuenta vencidos/hoy/próximos 7 días escopado por negocio Y por el
// usuario del token (responsableId) — ni cross-tenant ni cross-user contaminan el resultado.
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
const customerIds = new Set<string>();

before(async () => { backUp = await probeBack(); if (!backUp) console.warn('[e2e] back no responde — tests saltados'); });
beforeEach(async () => { if (backUp) await resetRateLimits('register'); });
after(async () => {
  if (backUp) {
    await prisma.reminder.deleteMany({ where: { customerId: { in: [...customerIds] } } }).catch((e) => console.error('[e2e cleanup]', e instanceof Error ? e.message : e));
    await prisma.customer.deleteMany({ where: { id: { in: [...customerIds] } } }).catch((e) => console.error('[e2e cleanup]', e instanceof Error ? e.message : e));
  }
  await cleanup(backUp);
});

test('GET /reminders/summary cuenta vencidos/hoy/próximos 7d escopado por negocio y usuario', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const a = await registerAndToken(`sumA_${uniq()}@test.local`, 'Sum-pass-1234', t);
  if (!a) return;
  const b = await registerAndToken(`sumB_${uniq()}@test.local`, 'Sum-pass-1234', t);
  if (!b) return;

  const custA = await prisma.customer.create({ data: { businessId: a.businessId, nombre: 'Cliente A' } });
  const custB = await prisma.customer.create({ data: { businessId: b.businessId, nombre: 'Cliente B' } });
  customerIds.add(custA.id); customerIds.add(custB.id);

  const now = new Date();
  const ayer = new Date(now); ayer.setDate(ayer.getDate() - 1);
  const hoy = new Date(now); hoy.setHours(12, 0, 0, 0);
  const en3dias = new Date(now); en3dias.setDate(en3dias.getDate() + 3);

  await prisma.reminder.createMany({
    data: [
      // Negocio A, usuario A (responsableId = a.userId): 2 vencidos, 1 hoy, 3 próximos.
      { businessId: a.businessId, customerId: custA.id, titulo: 'v1', estado: 'PENDING', fechaPrevista: ayer, responsableId: a.userId },
      { businessId: a.businessId, customerId: custA.id, titulo: 'v2', estado: 'PENDING', fechaPrevista: ayer, responsableId: a.userId },
      { businessId: a.businessId, customerId: custA.id, titulo: 'h1', estado: 'PENDING', fechaPrevista: hoy, responsableId: a.userId },
      { businessId: a.businessId, customerId: custA.id, titulo: 'p1', estado: 'PENDING', fechaPrevista: en3dias, responsableId: a.userId },
      { businessId: a.businessId, customerId: custA.id, titulo: 'p2', estado: 'PENDING', fechaPrevista: en3dias, responsableId: a.userId },
      { businessId: a.businessId, customerId: custA.id, titulo: 'p3', estado: 'PENDING', fechaPrevista: en3dias, responsableId: a.userId },
      // Ruido dentro del MISMO negocio A pero de OTRO usuario (responsableId ajeno) → no debe contar para A.
      { businessId: a.businessId, customerId: custA.id, titulo: 'ajeno', estado: 'PENDING', fechaPrevista: ayer, responsableId: b.userId },
      // Ruido de otro negocio (B) con su propio usuario → aislamiento cross-tenant.
      { businessId: b.businessId, customerId: custB.id, titulo: 'y1', estado: 'PENDING', fechaPrevista: ayer, responsableId: b.userId },
    ],
  });

  const res = await api('/reminders/summary', {}, a.token, a.businessId);
  assert.equal(res.status, 200, `expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body!.vencidos, 2, 'solo los 2 vencidos de A, sin el ajeno ni el de B');
  assert.equal(res.body!.hoy, 1);
  assert.equal(res.body!.proximos7d, 3);

  // B ve sus propios contadores, sin contaminación de A.
  const resB = await api('/reminders/summary', {}, b.token, b.businessId);
  assert.equal(resB.status, 200);
  assert.equal(resB.body!.vencidos, 1);
  assert.equal(resB.body!.hoy, 0);
  assert.equal(resB.body!.proximos7d, 0);
});
