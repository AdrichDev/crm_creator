// Tests de CARACTERIZACIÓN de /api/invoices (crm-paridad-facturas-pedidos-aa, Fase 1.1).
//
// Fijan el comportamiento ACTUAL del crudRouter('invoice', ...) genérico (routes/index.ts)
// ANTES de introducir la vista documental de Fase 2. Si estos tests se rompen tras un
// cambio, ese cambio alteró comportamiento observable del contrato vigente: no editar los
// tests para que encajen sin antes confirmar que el cambio es intencional.
//
// Punto clave a fijar: a diferencia de POST /service/operator/invoices (numeración
// server-assigned secuencial F00001…, ver invoices.write-ops.test.ts), este endpoint
// NO genera `numero` — `numero` es un campo más de la whitelist (`fields`) y el cliente
// lo envía tal cual en el body. Dos negocios pueden tener facturas con el mismo `numero`
// sin colisión (no hay índice único ni conteo por negocio en este camino).
//
// Requires the back running at localhost:4001 + live Supabase credentials.
// Runner: node --import tsx --test (excluido de `npm test`, incluido en `npm run test:e2e`).
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

  const created = await api('/invoices', {
    method: 'POST',
    body: JSON.stringify({ numero: 'F00001', cliente: 'Ana', fecha: '2026-07-01', total: 100 }),
  }, token, businessId);
  assert.equal(created.status, 201, `create failed: ${JSON.stringify(created.body)}`);

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
// POST /invoices — `numero` es whitelisted y pasa TAL CUAL (sin auto-numeración)
// ---------------------------------------------------------------------------
test('POST /invoices acepta el `numero` enviado por el cliente sin generar uno propio (sin numeración F00001 automática aquí)', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const auth = await registerAndToken(`inv_num_${uniq()}@test.local`, 'Inv-pass-1234', t);
  if (!auth) return;
  const { token, businessId } = auth;

  // Numeración NO secuencial ni con el formato Fnnnnn: el endpoint la acepta igual,
  // porque no hay lógica de asignación server-side en este camino (a diferencia de
  // POST /service/operator/invoices).
  const r = await api('/invoices', {
    method: 'POST',
    body: JSON.stringify({ numero: 'CUALQUIERA-123', cliente: 'Ana', fecha: '2026-07-01', total: 50 }),
  }, token, businessId);
  assert.equal(r.status, 201, `create failed: ${JSON.stringify(r.body)}`);
  assert.equal((r.body as { numero: string }).numero, 'CUALQUIERA-123');

  // Repetir el mismo `numero` en el mismo negocio no colisiona (no hay índice único).
  const r2 = await api('/invoices', {
    method: 'POST',
    body: JSON.stringify({ numero: 'CUALQUIERA-123', cliente: 'Bea', fecha: '2026-07-02', total: 60 }),
  }, token, businessId);
  assert.equal(r2.status, 201, `duplicate numero should be accepted today: ${JSON.stringify(r2.body)}`);

  await prisma.invoice.deleteMany({ where: { businessId } }).catch(() => {});
});

// ---------------------------------------------------------------------------
// POST /invoices — whitelist de campos (fields de crudRouter) + estado por defecto
// ---------------------------------------------------------------------------
test('POST /invoices ignora campos fuera de la whitelist y por defecto no fija `estado` (llega como el cliente lo mande, o vacío/null en BD)', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const auth = await registerAndToken(`inv_wl_${uniq()}@test.local`, 'Inv-pass-1234', t);
  if (!auth) return;
  const { token, businessId } = auth;

  const r = await api('/invoices', {
    method: 'POST',
    body: JSON.stringify({
      numero: 'F00002', cliente: 'Ana', fecha: '2026-07-01', total: 30, estado: 'Pagada',
      campoDesconocido: 'no debería persistir',
    }),
  }, token, businessId);
  assert.equal(r.status, 201, `create failed: ${JSON.stringify(r.body)}`);
  const body = r.body as Record<string, unknown>;
  assert.equal(body.estado, 'Pagada');
  assert.equal(body.campoDesconocido, undefined, 'campo fuera de la whitelist no debe persistir ni devolverse');

  await prisma.invoice.deleteMany({ where: { businessId } }).catch(() => {});
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

  const created = await api('/invoices', {
    method: 'POST',
    body: JSON.stringify({ numero: 'F00003', cliente: 'Ana', fecha: '2026-07-01', total: 20, estado: 'Pendiente' }),
  }, token, businessId);
  const id = (created.body as { id: string }).id;

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

  const created = await api('/invoices', {
    method: 'POST',
    body: JSON.stringify({ numero: 'F00004', cliente: 'Ana', fecha: '2026-07-01', total: 15 }),
  }, token, businessId);
  const id = (created.body as { id: string }).id;

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
