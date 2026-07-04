// E2E tests: notificaciones (Notification) read-only en /notifications.
// Cubre 3.2.d: GET devuelve solo las del negocio activo, filtrables por estado/tipo.
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

// 3.2.d — GET solo las del negocio activo, filtrables por estado
test('GET /notifications devuelve solo las del negocio activo y filtra por estado', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const a = await registerAndToken(`ntf1a_${uniq()}@test.local`, 'Ntf-pass-1234', t);
  const b = await registerAndToken(`ntf1b_${uniq()}@test.local`, 'Ntf-pass-1234', t);
  if (!a || !b) return;

  // Sembrar: 2 del negocio A (una pending, una sent) + 1 del negocio B.
  await prisma.notification.createMany({
    data: [
      { businessId: a.businessId, tipo: 'test.a', destino: `x${uniq()}@t.local`, estado: 'pending' },
      { businessId: a.businessId, tipo: 'test.a', destino: `x${uniq()}@t.local`, estado: 'sent' },
      { businessId: b.businessId, tipo: 'test.b', destino: `x${uniq()}@t.local`, estado: 'pending' },
    ],
  });

  const all = await api('/notifications', {}, a.token, a.businessId);
  assert.equal((all.body!.items as unknown[]).length, 2, 'A ve solo sus 2 notificaciones');

  const pend = await api('/notifications?estado=pending', {}, a.token, a.businessId);
  const pendItems = pend.body!.items as { estado: string }[];
  assert.equal(pendItems.length, 1, 'filtro estado=pending → 1');
  assert.ok(pendItems.every((n) => n.estado === 'pending'));

  await prisma.notification.deleteMany({ where: { businessId: { in: [a.businessId, b.businessId] } } }).catch((e) => console.error('[e2e cleanup]', e instanceof Error ? e.message : e));
});
