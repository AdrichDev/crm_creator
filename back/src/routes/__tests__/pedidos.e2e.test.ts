// Tests de CONTRATO de /api/pedidos (crm-paridad-facturas-pedidos-aa, Fase 1.2 / PR-2).
//
// Fijan el comportamiento de la ruta nueva de Presupuestos/Pedidos documentales:
//   - alta con totales SERVER-SIDE (no se confían los importes al cliente);
//   - scoping por negocio (un pedido de otro negocio es invisible → 404);
//   - máquina de estados generada|aceptada|rechazada|caducada vía PUT /:id/status,
//     SIN efecto factura en PR-2 (la auto-factura llega en PR-2b).
//
// Requiere back en localhost:4001 + Supabase live Y la migración 20260704010000_pedido
// APLICADA (crm.pedido / crm.linea_pedido). El agente NO aplicó la migración (convención
// PR-1): este e2e queda verde una vez el responsable la despliegue. Excluido de `npm test`
// (solo `npm run test:e2e`).
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

// ---------------------------------------------------------------------------
// POST /pedidos — totales SERVER-SIDE desde las líneas (no del cliente)
// ---------------------------------------------------------------------------
test('POST /pedidos calcula totales server-side desde las líneas e ignora importes del cliente', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const auth = await registerAndToken(`ped_new_${uniq()}@test.local`, 'Ped-pass-1234', t);
  if (!auth) return;
  const { token, businessId } = auth;

  const r = await api('/pedidos', {
    method: 'POST',
    body: JSON.stringify({
      numero: 'AD-2026-001',
      tasaIva: 0.21,
      // Importes basura enviados por el cliente: deben ser ignorados (se recalculan).
      subtotalImpl: 999999, totalImpl: 999999,
      lines: [
        { servicioId: 's1', nombre: 'Puesta en marcha', cantidad: 2, precioImpl: 100, precioMant: 10 },
        { servicioId: 's2', nombre: 'Extra', cantidad: 1, precioImpl: 50, precioMant: 5 },
      ],
    }),
  }, token, businessId);
  assert.equal(r.status, 201, `create failed: ${JSON.stringify(r.body)}`);
  const body = r.body as Record<string, unknown>;
  assert.equal(body.estado, 'generada');
  assert.equal(Number(body.subtotalImpl), 250);
  assert.equal(Number(body.subtotalMant), 25);
  assert.equal(Number(body.totalImpl), 302.5);
  assert.equal(Number(body.totalMant), 30.25);
  assert.equal((body.lines as unknown[]).length, 2);

  await prisma.pedido.deleteMany({ where: { businessId } }).catch(() => {});
});

// ---------------------------------------------------------------------------
// GET /pedidos — listado paginado + scoping por negocio
// ---------------------------------------------------------------------------
test('GET /pedidos devuelve { items, total, page, limit } solo del negocio activo', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const auth = await registerAndToken(`ped_list_${uniq()}@test.local`, 'Ped-pass-1234', t);
  if (!auth) return;
  const { token, businessId } = auth;

  await api('/pedidos', { method: 'POST', body: JSON.stringify({ numero: 'AD-2026-002', lines: [] }) }, token, businessId);

  const list = await api('/pedidos', {}, token, businessId);
  assert.equal(list.status, 200);
  const body = list.body as { items: unknown[]; total: number; page: number; limit: number };
  assert.ok(Array.isArray(body.items));
  assert.equal(body.total, 1);
  assert.equal(body.page, 1);
  assert.ok(body.limit > 0);

  await prisma.pedido.deleteMany({ where: { businessId } }).catch(() => {});
});

// ---------------------------------------------------------------------------
// GET /pedidos/:id — 404 para inexistente o de otro negocio
// ---------------------------------------------------------------------------
test('GET /pedidos/:id → 404 si no existe o pertenece a otro negocio', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const a = await registerAndToken(`ped_geta_${uniq()}@test.local`, 'Ped-pass-1234', t);
  const b = await registerAndToken(`ped_getb_${uniq()}@test.local`, 'Ped-pass-1234', t);
  if (!a || !b) return;

  const created = await api('/pedidos', { method: 'POST', body: JSON.stringify({ numero: 'AD-2026-003', lines: [] }) }, b.token, b.businessId);
  const pedidoBId = (created.body as { id: string }).id;

  const notFound = await api('/pedidos/does-not-exist', {}, a.token, a.businessId);
  assert.equal(notFound.status, 404);

  const crossTenant = await api(`/pedidos/${pedidoBId}`, {}, a.token, a.businessId);
  assert.equal(crossTenant.status, 404, 'un pedido de OTRO negocio debe ser invisible (scoping por businessId)');

  const ok = await api(`/pedidos/${pedidoBId}`, {}, b.token, b.businessId);
  assert.equal(ok.status, 200);

  await prisma.pedido.deleteMany({ where: { businessId: b.businessId } }).catch(() => {});
});

// ---------------------------------------------------------------------------
// PUT /pedidos/:id/status — máquina de estados (SIN factura en PR-2)
// ---------------------------------------------------------------------------
test('PUT /pedidos/:id/status transiciona el estado y NO crea factura (efecto factura es PR-2b)', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const auth = await registerAndToken(`ped_status_${uniq()}@test.local`, 'Ped-pass-1234', t);
  if (!auth) return;
  const { token, businessId } = auth;

  const created = await api('/pedidos', { method: 'POST', body: JSON.stringify({ numero: 'AD-2026-004', lines: [] }) }, token, businessId);
  const id = (created.body as { id: string }).id;

  const invoicesBefore = await prisma.invoice.count({ where: { businessId } });

  const accepted = await api(`/pedidos/${id}/status`, { method: 'PUT', body: JSON.stringify({ estado: 'aceptada' }) }, token, businessId);
  assert.equal(accepted.status, 200, `status change failed: ${JSON.stringify(accepted.body)}`);
  assert.equal((accepted.body as { estado: string }).estado, 'aceptada');

  // PR-2: aceptar NO debe crear factura todavía (eso es PR-2b).
  const invoicesAfter = await prisma.invoice.count({ where: { businessId } });
  assert.equal(invoicesAfter, invoicesBefore, 'aceptar un pedido no crea factura en PR-2');

  // Estado inválido → 422.
  const bad = await api(`/pedidos/${id}/status`, { method: 'PUT', body: JSON.stringify({ estado: 'cobrada' }) }, token, businessId);
  assert.equal(bad.status, 422);

  await prisma.pedido.deleteMany({ where: { businessId } }).catch(() => {});
});
