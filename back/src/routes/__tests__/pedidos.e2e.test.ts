// Tests de CONTRATO de /api/pedidos (crm-paridad-facturas-pedidos-aa, Fase 1.2 / PR-2 + PR-2b).
//
// Fijan el comportamiento de la ruta nueva de Presupuestos/Pedidos documentales:
//   - alta con totales SERVER-SIDE (no se confían los importes al cliente);
//   - scoping por negocio (un pedido de otro negocio es invisible → 404);
//   - máquina de estados generada|aceptada|rechazada|caducada vía PUT /:id/status;
//   - PR-2b: aceptar auto-crea la factura (idempotente); des-aceptar con factura → 400.
//
// Requiere back en localhost:4001 + Supabase live Y las migraciones 20260704010000_pedido
// (crm.pedido / crm.linea_pedido) Y 20260704020000_factura_pedido_link (crm.factura.pedido_id)
// APLICADAS. El agente NO aplica migraciones (convención PR-1/PR-2): este e2e queda verde una
// vez el responsable las despliegue. Excluido de `npm test` (solo `npm run test:e2e`).
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
// GET /pedidos — `metrics` server-side sobre TODOS los pedidos (fix post-PR-4)
// ---------------------------------------------------------------------------
test('GET /pedidos adjunta metrics calculadas sobre TODO el negocio, aunque haya más pedidos que el page size', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const auth = await registerAndToken(`ped_metrics_${uniq()}@test.local`, 'Ped-pass-1234', t);
  if (!auth) return;
  const { token, businessId } = auth;

  // 25 pedidos > page size por defecto (20). Antes del fix, los KPIs del front se
  // calculaban sobre la página (máx. 20) → subconteo. Ahora vienen del back sobre los 25.
  // Mismo fix que GET /invoices en PR-3.
  const data = [
    ...Array.from({ length: 15 }, (_v, i) => ({ businessId, numero: `PM-G-${i}`, estado: 'generada', totalImpl: 100 })),
    ...Array.from({ length: 10 }, (_v, i) => ({ businessId, numero: `PM-A-${i}`, estado: 'aceptada', totalImpl: 200 })),
  ];
  await prisma.pedido.createMany({ data });

  const list = await api('/pedidos', {}, token, businessId);
  assert.equal(list.status, 200);
  const body = list.body as {
    items: unknown[]; total: number; limit: number;
    metrics: { totalPedidos: number; aceptados: number; importeTotal: number };
  };

  // El listado sigue paginado: como mucho `limit` filas (20 por defecto), NO los 25.
  assert.ok(body.items.length <= body.limit, 'el listado sigue paginado');
  assert.equal(body.total, 25);

  // Las métricas reflejan el conjunto COMPLETO (25), no la página.
  assert.ok(body.metrics, 'la respuesta debe incluir metrics');
  assert.equal(body.metrics.totalPedidos, 25, 'metrics cuenta TODOS los pedidos, no solo la página');
  assert.equal(body.metrics.aceptados, 10);
  assert.equal(body.metrics.importeTotal, 15 * 100 + 10 * 200); // 1500 + 2000 = 3500

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
// PUT /pedidos/:id/status — aceptar auto-crea la factura, idempotente (PR-2b)
// ---------------------------------------------------------------------------
test('PUT /pedidos/:id/status aceptar auto-crea UNA factura vinculada; reaceptar es idempotente', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const auth = await registerAndToken(`ped_status_${uniq()}@test.local`, 'Ped-pass-1234', t);
  if (!auth) return;
  const { token, businessId } = auth;

  const created = await api('/pedidos', {
    method: 'POST',
    body: JSON.stringify({
      numero: 'AD-2026-004', clienteSnapshot: { nombre: 'Ana' },
      lines: [{ nombre: 'Puesta en marcha', cantidad: 1, precioImpl: 100, precioMant: 10 }],
    }),
  }, token, businessId);
  const id = (created.body as { id: string }).id;

  const invoicesBefore = await prisma.invoice.count({ where: { businessId } });

  const accepted = await api(`/pedidos/${id}/status`, { method: 'PUT', body: JSON.stringify({ estado: 'aceptada' }) }, token, businessId);
  assert.equal(accepted.status, 200, `status change failed: ${JSON.stringify(accepted.body)}`);
  assert.equal((accepted.body as { estado: string }).estado, 'aceptada');

  // Aceptar crea exactamente UNA factura, vinculada al pedido, con numero derivado.
  const invoicesAfter = await prisma.invoice.count({ where: { businessId } });
  assert.equal(invoicesAfter, invoicesBefore + 1, 'aceptar un pedido crea su factura (PR-2b)');
  const factura = await prisma.invoice.findFirst({ where: { pedidoId: id } });
  assert.ok(factura, 'la factura debe quedar vinculada al pedido por pedidoId');
  assert.equal(factura!.numero, 'FAC - 2026-004', 'numero derivado del pedido (prefijo AD- → FAC - )');
  assert.equal(factura!.estado, 'Pendiente');
  // total = totalImpl + totalMant = (100*1.21) + (10*1.21) = 121 + 12.1 = 133.1
  assert.equal(Number(factura!.total), 133.1, 'total factura = totalImpl + totalMant del pedido (ambos con IVA)');

  // Reaceptar (aceptada → aceptada) NO crea una segunda factura (idempotente vía pedido_id @unique).
  const reaccept = await api(`/pedidos/${id}/status`, { method: 'PUT', body: JSON.stringify({ estado: 'aceptada' }) }, token, businessId);
  assert.equal(reaccept.status, 200);
  const invoicesAfterReaccept = await prisma.invoice.count({ where: { businessId } });
  assert.equal(invoicesAfterReaccept, invoicesBefore + 1, 'reaceptar no crea una 2ª factura');

  // Estado inválido → 422.
  const bad = await api(`/pedidos/${id}/status`, { method: 'PUT', body: JSON.stringify({ estado: 'cobrada' }) }, token, businessId);
  assert.equal(bad.status, 422);

  await prisma.invoice.deleteMany({ where: { businessId } }).catch(() => {});
  await prisma.pedido.deleteMany({ where: { businessId } }).catch(() => {});
});

// ---------------------------------------------------------------------------
// PUT /pedidos/:id/status — guard de des-aceptación (PR-2b)
// ---------------------------------------------------------------------------
test('PUT /pedidos/:id/status NO deja salir de aceptada si ya hay factura vinculada (400)', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const auth = await registerAndToken(`ped_guard_${uniq()}@test.local`, 'Ped-pass-1234', t);
  if (!auth) return;
  const { token, businessId } = auth;

  const created = await api('/pedidos', { method: 'POST', body: JSON.stringify({ numero: 'AD-2026-005', lines: [] }) }, token, businessId);
  const id = (created.body as { id: string }).id;

  await api(`/pedidos/${id}/status`, { method: 'PUT', body: JSON.stringify({ estado: 'aceptada' }) }, token, businessId);

  // Con factura vinculada, cualquier salida de 'aceptada' se rechaza para no huérfanar la factura.
  const rejected = await api(`/pedidos/${id}/status`, { method: 'PUT', body: JSON.stringify({ estado: 'rechazada' }) }, token, businessId);
  assert.equal(rejected.status, 400, `debe bloquear la des-aceptación: ${JSON.stringify(rejected.body)}`);
  assert.equal((rejected.body as { error: { code: string } }).error.code, 'conflict');

  // El pedido sigue en 'aceptada' y su factura intacta.
  const still = await api(`/pedidos/${id}`, {}, token, businessId);
  assert.equal((still.body as { estado: string }).estado, 'aceptada');
  assert.equal(await prisma.invoice.count({ where: { pedidoId: id } }), 1);

  await prisma.invoice.deleteMany({ where: { businessId } }).catch(() => {});
  await prisma.pedido.deleteMany({ where: { businessId } }).catch(() => {});
});
