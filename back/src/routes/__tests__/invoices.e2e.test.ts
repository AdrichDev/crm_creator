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
  BASE, api, probeBack, resetRateLimits, registerAndToken, cleanup, uniq, SUPABASE_LIVE,
} from './_shared.e2e.js';

let backUp = false;

// Token del Operator Agent (bot de Telegram). Cargado por dotenv en _shared.e2e.ts.
// Si no está configurado en el entorno del runner, el test de regresión del operador
// se salta (skip honesto) en lugar de fallar por infra.
const OPERATOR_TOKEN = process.env.OPERATOR_SERVICE_TOKEN ?? '';

/** POST contra el router del operador (montado FUERA de /api, auth por x-service-token). */
async function operatorPost(path: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> | undefined }> {
  const res = await fetch(`${BASE}/service/operator${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-service-token': OPERATOR_TOKEN },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown;
  try { parsed = text ? JSON.parse(text) : undefined; } catch { parsed = text; }
  return { status: res.status, body: parsed as Record<string, unknown> | undefined };
}

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
// GET /invoices — `metrics` server-side sobre TODAS las facturas (fix PR-3)
// ---------------------------------------------------------------------------
test('GET /invoices adjunta metrics calculadas sobre TODO el negocio, aunque haya más facturas que el page size', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const auth = await registerAndToken(`inv_metrics_${uniq()}@test.local`, 'Inv-pass-1234', t);
  if (!auth) return;
  const { token, businessId } = auth;

  // 25 facturas > page size por defecto (20). Antes del fix, las métricas del front se
  // calculaban sobre la página (máx. 20) → subconteo. Ahora vienen del back sobre las 25.
  const data = [
    ...Array.from({ length: 15 }, (_v, i) => ({ businessId, numero: `FP-${i}`, cliente: 'Ana', fecha: '2026-07-01', total: 100, estado: 'Pendiente' })),
    ...Array.from({ length: 10 }, (_v, i) => ({ businessId, numero: `FG-${i}`, cliente: 'Bea', fecha: '2026-07-01', total: 200, estado: 'Pagada' })),
  ];
  await prisma.invoice.createMany({ data });

  const list = await api('/invoices', {}, token, businessId);
  assert.equal(list.status, 200);
  const body = list.body as {
    items: unknown[]; total: number; limit: number;
    metrics: { totalFacturas: number; importeTotal: number; pendientes: number; importePendiente: number; pagadas: number; importePagado: number };
  };

  // El listado sigue paginado: como mucho `limit` filas (20 por defecto), NO las 25.
  assert.ok(body.items.length <= body.limit, 'el listado sigue paginado');
  assert.equal(body.total, 25);

  // Las métricas reflejan el conjunto COMPLETO (25), no la página.
  assert.ok(body.metrics, 'la respuesta debe incluir metrics');
  assert.equal(body.metrics.totalFacturas, 25, 'metrics cuenta TODAS las facturas, no solo la página');
  assert.equal(body.metrics.importeTotal, 15 * 100 + 10 * 200); // 1500 + 2000 = 3500
  assert.equal(body.metrics.pendientes, 15);
  assert.equal(body.metrics.importePendiente, 1500);
  assert.equal(body.metrics.pagadas, 10);
  assert.equal(body.metrics.importePagado, 2000);

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
// Fase 4 (4.1): regresión de numeración F00001 EN VIVO — el cierre de
// POST /api/invoices (405, PR-2b) no afecta al camino del operador.
// La suite unitaria (service-operator-write-ops.test.ts) ya fija el algoritmo
// (F00001 base, secuencia desde count, lock FOR UPDATE, concurrencia) con DI;
// este es el primer test que ejercita POST /service/operator/invoices contra el
// stack REAL (servidor + middleware x-service-token + Postgres), y prueba la
// COEXISTENCIA: mismo negocio, superficie genérica cerrada, camino del bot vivo.
// ---------------------------------------------------------------------------
test('regresión F00001: el operador numera F00001/F00002 en vivo aunque POST /api/invoices esté cerrado (405)', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');
  if (!OPERATOR_TOKEN) return t.skip('OPERATOR_SERVICE_TOKEN no configurado');

  const auth = await registerAndToken(`inv_op_${uniq()}@test.local`, 'Inv-pass-1234', t);
  if (!auth) return;
  const { token, businessId } = auth;

  // 1) La superficie genérica sigue cerrada para el mismo negocio (PR-2b).
  const closed = await api('/invoices', {
    method: 'POST',
    body: JSON.stringify({ numero: 'X-1', cliente: 'Ana', fecha: '2026-07-01', total: 1 }),
  }, token, businessId);
  assert.equal(closed.status, 405);

  // 2) El bot crea con numeración secuencial server-side, intacta: primera → F00001.
  const first = await operatorPost('/invoices', { businessId, cliente: 'Op Ana', servicio: 'Corte', total: 30 });
  assert.equal(first.status, 201, `operator create failed: ${JSON.stringify(first.body)}`);
  assert.equal(first.body?.numero, 'F00001', 'la primera factura del negocio recibe F00001');

  // 3) Segunda del mismo negocio → F00002 (la secuencia avanza en BD real, no en un mock).
  const second = await operatorPost('/invoices', { businessId, cliente: 'Op Bea', total: 45 });
  assert.equal(second.status, 201, `operator create failed: ${JSON.stringify(second.body)}`);
  assert.equal(second.body?.numero, 'F00002');

  // 4) Las facturas del operador aparecen en el listado del tenant (GET /api/invoices)
  //    con pedidoId null (no vienen de un pedido) y las métricas las cuentan.
  const list = await api('/invoices', {}, token, businessId);
  assert.equal(list.status, 200);
  const body = list.body as {
    total: number;
    items: Array<{ numero: string; pedidoId: string | null }>;
    metrics: { totalFacturas: number; importeTotal: number };
  };
  assert.equal(body.total, 2);
  assert.deepEqual(body.items.map((i) => i.numero).sort(), ['F00001', 'F00002']);
  assert.ok(body.items.every((i) => i.pedidoId === null), 'las facturas del operador no tienen pedido vinculado');
  assert.equal(body.metrics.totalFacturas, 2);
  assert.equal(body.metrics.importeTotal, 75);

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
// PATCH /invoices/:id — actualiza campos de la whitelist; `estado` y `total` YA NO
// son parcheables por aquí (crm-operaos 10.3): transiciones SOLO por PUT /:id/status
// (gestiona pagadaEn) y `total` es campo SNAPSHOT/derivado de las líneas — parchearlo
// suelto desincronizaba la cabecera del detalle. pickFields los ignora sin romper el resto.
// ---------------------------------------------------------------------------
test('PATCH /invoices/:id actualiza cliente pero IGNORA estado y total (snapshot/derivados)', async (t) => {
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
    body: JSON.stringify({ cliente: 'Ana Actualizada', estado: 'Pagada', total: 25 }),
  }, token, businessId);
  assert.equal(patched.status, 200, `patch failed: ${JSON.stringify(patched.body)}`);
  assert.equal((patched.body as { cliente: string }).cliente, 'Ana Actualizada', 'cliente sí está en la whitelist');
  assert.equal((patched.body as { estado: string }).estado, 'Pendiente', 'estado fuera de la whitelist: el PATCH lo ignora');
  assert.equal(Number((patched.body as { total: unknown }).total), 20, 'total fuera de la whitelist: el PATCH lo ignora');

  await prisma.invoice.deleteMany({ where: { businessId } }).catch(() => {});
});

// ---------------------------------------------------------------------------
// PUT /invoices/:id/status — set cerrado + pagadaEn (crm-operaos 10.3)
// ---------------------------------------------------------------------------
test('PUT /invoices/:id/status: Pagada fija pagadaEn, volver a Pendiente lo limpia, estado inválido → 422', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const auth = await registerAndToken(`inv_status_${uniq()}@test.local`, 'Inv-pass-1234', t);
  if (!auth) return;
  const { token, businessId } = auth;

  const created = await prisma.invoice.create({
    data: { businessId, numero: 'F00007', cliente: 'Ana', fecha: '2026-07-01', total: 50, estado: 'Pendiente' },
  });
  const id = created.id;

  // Pendiente → Pagada: fija pagadaEn.
  const paid = await api(`/invoices/${id}/status`, { method: 'PUT', body: JSON.stringify({ estado: 'Pagada' }) }, token, businessId);
  assert.equal(paid.status, 200, `status change failed: ${JSON.stringify(paid.body)}`);
  assert.equal((paid.body as { estado: string }).estado, 'Pagada');
  assert.ok((paid.body as { pagadaEn: string | null }).pagadaEn, 'pasar a Pagada debe fijar pagadaEn');

  // KPI "importe cobrado" (metrics.importePagado) refleja el cobro sobre TODO el negocio.
  const list = await api('/invoices', {}, token, businessId);
  const metrics = (list.body as { metrics: { pagadas: number; importePagado: number } }).metrics;
  assert.equal(metrics.pagadas, 1);
  assert.equal(metrics.importePagado, 50, 'importe cobrado = Σ total de facturas Pagadas');

  // Pagada → Pendiente: LIMPIA pagadaEn.
  const unpaid = await api(`/invoices/${id}/status`, { method: 'PUT', body: JSON.stringify({ estado: 'Pendiente' }) }, token, businessId);
  assert.equal(unpaid.status, 200);
  assert.equal((unpaid.body as { pagadaEn: string | null }).pagadaEn, null, 'salir de Pagada debe limpiar pagadaEn');

  // Set CERRADO: literal fuera de Pendiente|Pagada|Anulada → 422 sin tocar la fila.
  const bad = await api(`/invoices/${id}/status`, { method: 'PUT', body: JSON.stringify({ estado: 'cobrada' }) }, token, businessId);
  assert.equal(bad.status, 422);
  const raw = await prisma.invoice.findUnique({ where: { id } });
  assert.equal(raw!.estado, 'Pendiente', 'un estado inválido no debe alterar la factura');

  await prisma.invoice.deleteMany({ where: { businessId } }).catch(() => {});
});

test('PUT /invoices/:id/status → 404 para factura de otro negocio (scoping)', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const a = await registerAndToken(`inv_sta_${uniq()}@test.local`, 'Inv-pass-1234', t);
  const b = await registerAndToken(`inv_stb_${uniq()}@test.local`, 'Inv-pass-1234', t);
  if (!a || !b) return;

  const invoiceB = await prisma.invoice.create({
    data: { businessId: b.businessId, numero: 'F00001', cliente: 'Bea', fecha: '2026-07-01', total: 10 },
  });

  const crossTenant = await api(`/invoices/${invoiceB.id}/status`, { method: 'PUT', body: JSON.stringify({ estado: 'Pagada' }) }, a.token, a.businessId);
  assert.equal(crossTenant.status, 404, 'una factura de OTRO negocio debe ser invisible también para /status');

  await prisma.invoice.delete({ where: { id: invoiceB.id } }).catch(() => {});
});

// ---------------------------------------------------------------------------
// Factura LEGACY (plana, pre-10.3) — se conserva y renderiza: total EXACTO,
// lines [] (el backfill de la migración les crea 1 línea en BD real; una fila
// sembrada sin líneas también debe listarse sin romper el contrato).
// ---------------------------------------------------------------------------
test('factura legacy (sin líneas) se lista con total exacto, lines [] y tasaIva/subtotal presentes', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const auth = await registerAndToken(`inv_legacy_${uniq()}@test.local`, 'Inv-pass-1234', t);
  if (!auth) return;
  const { token, businessId } = auth;

  // Forma EXACTA de una fila legacy migrada: subtotal = total, tasaIva 0, sin desglose inventado.
  await prisma.invoice.create({
    data: { businessId, numero: 'FAC-2026-0001', cliente: 'Ana', servicio: 'Servicio comercial mensual', fecha: '2026-01-15', total: 620.5, estado: 'Pendiente', subtotal: 620.5, tasaIva: 0 },
  });

  const list = await api('/invoices', {}, token, businessId);
  assert.equal(list.status, 200);
  const item = (list.body as { items: Array<{ total: unknown; subtotal: unknown; tasaIva: unknown; lines: unknown[] }> }).items[0];
  assert.equal(Number(item.total), 620.5, 'el total legacy se conserva EXACTO');
  assert.equal(Number(item.subtotal), 620.5, 'legacy: subtotal = total (tasaIva 0, sin IVA inventado)');
  assert.equal(Number(item.tasaIva), 0);
  assert.ok(Array.isArray(item.lines), 'el listado incluye las líneas del documento');

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
