// Tests de CONTRATO de /api/invoices (crm-paridad-facturas-pedidos-aa, Fase 1.1 → PR-2b).
//
// Fijan el comportamiento del crudRouter('invoice', ...) genérico (routes/index.ts).
// PR-2b CERRÓ el alta manual por esta superficie: POST /api/invoices responde 405 (la
// factura se crea automáticamente al aceptar un pedido — ver pedidos.e2e.test.ts). GET,
// PATCH y DELETE siguen abiertos para listado/detalle/edición de facturas existentes.
// Las facturas de fixture se siembran con prisma.invoice.create (no por el POST cerrado).
//
// IMPORTANTE: POST /service/operator/invoices (bot de Telegram, numeración secuencial
// F00001…, ver service-operator-write-ops.test.ts) es OTRO router y NO se ve afectado por
// este cierre — usa prisma.invoice.create directamente, no este crudRouter.
//
// Requires the back running at localhost:4001 + live Supabase credentials Y la migración
// 20260704020000_factura_pedido_link aplicada. Runner: node --import tsx --test (excluido de
// `npm test`, incluido en `npm run test:e2e`).
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
// GET /invoices — listado paginado { items, total, page, limit }
// ---------------------------------------------------------------------------
test('GET /invoices devuelve { items, total, page, limit } y solo facturas del negocio activo', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const auth = await registerAndToken(`inv_list_${uniq()}@test.local`, 'Inv-pass-1234', t);
  if (!auth) return;
  const { token, businessId } = auth;

  // Fixture sembrado en BD (el POST de esta ruta está cerrado desde PR-2b).
  await prisma.invoice.create({ data: { businessId, numero: 'F00001', cliente: 'Ana', fecha: '2026-07-01', total: 100 } });

  const list = await api('/invoices', {}, token, businessId);
  assert.equal(list.status, 200);
  const body = list.body as { items: unknown[]; total: number; page: number; limit: number };
  assert.ok(Array.isArray(body.items));
  assert.equal(body.total, 1);
  assert.equal(body.page, 1);
  assert.ok(body.limit > 0);
  assert.equal((body.items[0] as { numero: string }).numero, 'F00001');

  await prisma.invoice.deleteMany({ where: { businessId } }).catch(() => {});
});

// ---------------------------------------------------------------------------
// POST /invoices — CERRADO (PR-2b): la creación por esta superficie responde 405
// ---------------------------------------------------------------------------
test('POST /invoices está cerrado: responde 405 (la factura se crea al aceptar un pedido)', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const auth = await registerAndToken(`inv_closed_${uniq()}@test.local`, 'Inv-pass-1234', t);
  if (!auth) return;
  const { token, businessId } = auth;

  const r = await api('/invoices', {
    method: 'POST',
    body: JSON.stringify({ numero: 'CUALQUIERA-123', cliente: 'Ana', fecha: '2026-07-01', total: 50 }),
  }, token, businessId);
  assert.equal(r.status, 405, `el alta manual debe estar cerrada: ${JSON.stringify(r.body)}`);
  assert.equal((r.body as { error: { code: string } }).error.code, 'method_not_allowed');

  // No se creó nada por el camino cerrado.
  assert.equal(await prisma.invoice.count({ where: { businessId } }), 0);
});

// ---------------------------------------------------------------------------
// GET /invoices/:id — 404 para inexistente o de otro negocio
// ---------------------------------------------------------------------------
test('GET /invoices/:id → 404 si no existe o pertenece a otro negocio', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const a = await registerAndToken(`inv_geta_${uniq()}@test.local`, 'Inv-pass-1234', t);
  const b = await registerAndToken(`inv_getb_${uniq()}@test.local`, 'Inv-pass-1234', t);
  if (!a || !b) return;

  const invoiceB = await prisma.invoice.create({
    data: { businessId: b.businessId, numero: 'F00001', cliente: 'Bea', fecha: '2026-07-01', total: 10 },
  });

  const notFound = await api('/invoices/does-not-exist', {}, a.token, a.businessId);
  assert.equal(notFound.status, 404);

  const crossTenant = await api(`/invoices/${invoiceB.id}`, {}, a.token, a.businessId);
  assert.equal(crossTenant.status, 404, 'una factura de OTRO negocio debe ser invisible (scoping por businessId)');

  const ok = await api(`/invoices/${invoiceB.id}`, {}, b.token, b.businessId);
  assert.equal(ok.status, 200);

  await prisma.invoice.delete({ where: { id: invoiceB.id } }).catch(() => {});
});

// ---------------------------------------------------------------------------
// PATCH /invoices/:id — actualiza campos de la whitelist
// ---------------------------------------------------------------------------
test('PATCH /invoices/:id actualiza estado y total', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const auth = await registerAndToken(`inv_patch_${uniq()}@test.local`, 'Inv-pass-1234', t);
  if (!auth) return;
  const { token, businessId } = auth;

  const created = await prisma.invoice.create({
    data: { businessId, numero: 'F00003', cliente: 'Ana', fecha: '2026-07-01', total: 20, estado: 'Pendiente' },
  });
  const id = created.id;

  const patched = await api(`/invoices/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ estado: 'Pagada', total: 25 }),
  }, token, businessId);
  assert.equal(patched.status, 200, `patch failed: ${JSON.stringify(patched.body)}`);
  assert.equal((patched.body as { estado: string }).estado, 'Pagada');
  assert.equal(Number((patched.body as { total: unknown }).total), 25);

  await prisma.invoice.deleteMany({ where: { businessId } }).catch(() => {});
});

// ---------------------------------------------------------------------------
// DELETE /invoices/:id — soft delete (eliminadoEn), desaparece de listado y GET :id
// ---------------------------------------------------------------------------
test('DELETE /invoices/:id hace soft delete: 204, desaparece del listado y de GET /:id (404)', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const auth = await registerAndToken(`inv_del_${uniq()}@test.local`, 'Inv-pass-1234', t);
  if (!auth) return;
  const { token, businessId } = auth;

  const created = await prisma.invoice.create({
    data: { businessId, numero: 'F00004', cliente: 'Ana', fecha: '2026-07-01', total: 15 },
  });
  const id = created.id;

  const del = await api(`/invoices/${id}`, { method: 'DELETE' }, token, businessId);
  assert.equal(del.status, 204);

  const got = await api(`/invoices/${id}`, {}, token, businessId);
  assert.equal(got.status, 404, 'soft-deleted → invisible vía GET /:id (eliminadoEn filtrado)');

  const list = await api('/invoices', {}, token, businessId);
  assert.equal((list.body as { total: number }).total, 0, 'soft-deleted → no cuenta en el listado');

  // Fila sigue existiendo en BD con eliminadoEn set (soft delete, no hard delete).
  const raw = await prisma.invoice.findUnique({ where: { id } });
  assert.ok(raw, 'la fila NO se borra físicamente (soft delete)');
  assert.ok(raw!.eliminadoEn != null);

  await prisma.invoice.delete({ where: { id } }).catch(() => {});
});
