// E2E tests: GET /customers/:id (crm-citas-ux-agenda WU6 — ficha de cliente desde /citas).
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

test('GET /customers/:id devuelve la ficha completa del cliente propio', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const auth = await registerAndToken(`cust_get_${uniq()}@test.local`, 'Cust-pass-1234', t);
  if (!auth) return;
  const { token, businessId } = auth;

  const customer = await prisma.customer.create({
    data: { businessId, nombre: 'Ana', apellido: 'Gómez', email: 'ana@mail.test', telefono: '600111222', direccion: 'Calle Falsa 1' },
  });

  const r = await api(`/customers/${customer.id}`, {}, token, businessId);
  assert.equal(r.status, 200, `expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
  assert.equal(r.body!.nombre, 'Ana Gómez');
  assert.equal(r.body!.email, 'ana@mail.test');
  assert.equal(r.body!.direccion, 'Calle Falsa 1');
});

test('GET /customers/:id de otro negocio → 404 (aislamiento cross-tenant)', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const a = await registerAndToken(`cust_a_${uniq()}@test.local`, 'Cust-pass-1234', t);
  if (!a) return;
  const b = await registerAndToken(`cust_b_${uniq()}@test.local`, 'Cust-pass-1234', t);
  if (!b) return;

  const customerA = await prisma.customer.create({ data: { businessId: a.businessId, nombre: 'Solo de A' } });

  const r = await api(`/customers/${customerA.id}`, {}, b.token, b.businessId);
  assert.equal(r.status, 404);
});

test('GET /customers/:id inexistente → 404', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const auth = await registerAndToken(`cust_404_${uniq()}@test.local`, 'Cust-pass-1234', t);
  if (!auth) return;

  const r = await api('/customers/no-existe', {}, auth.token, auth.businessId);
  assert.equal(r.status, 404);
});

// Segunda pasada Cartera de Clientes: `gastoPendiente` (facturas no pagadas) se
// agrega por nombre — crm.factura no tiene FK a crm.cliente (ver comentario en
// schema.prisma) — igual que el resto del CRM empareja factura↔cliente hoy.
test('GET /customers/:id agrega gastoPendiente sumando solo facturas no pagadas del propio negocio', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const auth = await registerAndToken(`cust_pend_${uniq()}@test.local`, 'Cust-pass-1234', t);
  if (!auth) return;
  const { token, businessId } = auth;

  const customer = await prisma.customer.create({ data: { businessId, nombre: 'Marta', apellido: 'Ruiz' } });
  await prisma.invoice.createMany({ data: [
    { businessId, numero: `PEND-${uniq()}`, cliente: 'Marta Ruiz', fecha: '2026-07-01', total: 100, estado: 'Pendiente' },
    { businessId, numero: `PEND-${uniq()}`, cliente: 'Marta Ruiz', fecha: '2026-07-02', total: 50, estado: 'Pendiente' },
    { businessId, numero: `PAID-${uniq()}`, cliente: 'Marta Ruiz', fecha: '2026-07-03', total: 999, estado: 'Pagada' },
  ] });

  const r = await api(`/customers/${customer.id}`, {}, token, businessId);
  assert.equal(r.status, 200, `expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
  assert.equal(r.body!.gastoPendiente, 150, 'solo suma las 2 facturas Pendiente (100+50), no la Pagada');
});
