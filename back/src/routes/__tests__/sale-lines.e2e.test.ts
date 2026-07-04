// E2E tests: líneas de venta (SaleLine) en /sales/:id/lineas.
// Cubre 3.2.b: POST calcula subtotal y recalcula Sale.total = Σ subtotales;
// DELETE recalcula; scoping de la venta por negocio.
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

// 3.2.b — POST calcula subtotal y Sale.total = Σ; DELETE recalcula
test('POST /sales/:id/lineas calcula subtotal y Sale.total = Σ; DELETE recalcula', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const auth = await registerAndToken(`line1_${uniq()}@test.local`, 'Line-pass-1234', t);
  if (!auth) return;
  const { token, businessId } = auth;
  const sale = await prisma.sale.create({ data: { businessId, cliente: 'Contado' } });

  // Línea 1: 2 x 10 = 20
  const l1 = await api(`/sales/${sale.id}/lineas`, { method: 'POST', body: JSON.stringify({ concepto: 'Corte', cantidad: 2, precioUnitario: 10 }) }, token, businessId);
  assert.equal(l1.status, 201, `expected 201, got ${l1.status}: ${JSON.stringify(l1.body)}`);
  assert.equal(Number((l1.body as { subtotal: unknown }).subtotal), 20);

  // Línea 2: 3 x 5 = 15 → total 35
  const l2 = await api(`/sales/${sale.id}/lineas`, { method: 'POST', body: JSON.stringify({ concepto: 'Cera', cantidad: 3, precioUnitario: 5 }) }, token, businessId);
  assert.equal(l2.status, 201);

  let saleRow = await prisma.sale.findUnique({ where: { id: sale.id } });
  assert.equal(Number(saleRow!.total), 35, 'Sale.total debe ser 20 + 15 = 35');

  // DELETE línea 2 → total vuelve a 20
  const del = await api(`/sales/${sale.id}/lineas/${(l2.body as { id: string }).id}`, { method: 'DELETE' }, token, businessId);
  assert.equal(del.status, 204);
  saleRow = await prisma.sale.findUnique({ where: { id: sale.id } });
  assert.equal(Number(saleRow!.total), 20, 'Sale.total debe recalcularse a 20 tras borrar la línea');

  const list = await api(`/sales/${sale.id}/lineas`, {}, token, businessId);
  assert.equal((list.body!.lineas as unknown[]).length, 1);

  await prisma.sale.delete({ where: { id: sale.id } }).catch((e) => console.error('[e2e cleanup]', e instanceof Error ? e.message : e));
});

// Regresión (2026-07-02): carrera en el recálculo de total. Sin el lock FOR UPDATE
// de la venta, N POST concurrentes dejaban Sale.total = subtotal de una sola línea
// (cada tx agregaba sin ver las líneas no committeadas de las demás).
test('N líneas concurrentes → total = Σ (lock por venta)', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const auth = await registerAndToken(`line3_${uniq()}@test.local`, 'Line-pass-1234', t);
  if (!auth) return;
  const { token, businessId } = auth;
  const sale = await prisma.sale.create({ data: { businessId, cliente: 'Contado' } });

  const N = 10;
  const results = await Promise.all(
    Array.from({ length: N }, (_, i) =>
      api(`/sales/${sale.id}/lineas`, { method: 'POST', body: JSON.stringify({ concepto: `c${i}`, cantidad: 1, precioUnitario: 1 }) }, token, businessId),
    ),
  );
  for (const r of results) assert.equal(r.status, 201, `expected 201, got ${r.status}: ${JSON.stringify(r.body)}`);

  const saleRow = await prisma.sale.findUnique({ where: { id: sale.id } });
  assert.equal(Number(saleRow!.total), N, `Sale.total debe ser ${N} tras ${N} líneas concurrentes de 1`);
  const list = await api(`/sales/${sale.id}/lineas`, {}, token, businessId);
  assert.equal((list.body!.lineas as unknown[]).length, N);

  await prisma.sale.delete({ where: { id: sale.id } }).catch((e) => console.error('[e2e cleanup]', e instanceof Error ? e.message : e));
});

// 3.2.b — venta de otro negocio → 404
test('POST /sales/:id/lineas sobre venta ajena → 404', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const a = await registerAndToken(`line2a_${uniq()}@test.local`, 'Line-pass-1234', t);
  const b = await registerAndToken(`line2b_${uniq()}@test.local`, 'Line-pass-1234', t);
  if (!a || !b) return;
  const saleB = await prisma.sale.create({ data: { businessId: b.businessId, cliente: 'Contado' } });

  const r = await api(`/sales/${saleB.id}/lineas`, { method: 'POST', body: JSON.stringify({ concepto: 'X', cantidad: 1, precioUnitario: 1 }) }, a.token, a.businessId);
  assert.equal(r.status, 404, `expected 404, got ${r.status}: ${JSON.stringify(r.body)}`);

  await prisma.sale.delete({ where: { id: saleB.id } }).catch((e) => console.error('[e2e cleanup]', e instanceof Error ? e.message : e));
});
