// E2E tests: líneas de venta (SaleLine) en /sales/:id/lineas.
// Cubre 3.2.b: POST calcula subtotal y recalcula Sale.total = Σ subtotales;
// DELETE recalcula; scoping de la venta por negocio.
// Requires the back running at localhost:4001 + live Supabase credentials.
//
// Runner: node --import tsx --test
import 'dotenv/config'; // el runner de tests no pasa por src/env.ts; sin esto el cleanup de prisma no tiene DATABASE_URL
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { prisma } from '../../prisma.js';
import { createClient } from '@supabase/supabase-js';

const BASE = process.env.TEST_API_URL ?? 'http://localhost:4001';
const SB_URL = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '').replace(/\.$/, '');
const SB_SRK = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const PLACEHOLDER_PATTERNS = ['CHANGE_ME', 'placeholder', 'fake', 'hardening-fake'];
const SUPABASE_LIVE = !!SB_SRK && !PLACEHOLDER_PATTERNS.some((p) => SB_SRK.toLowerCase().includes(p));

let backUp = false;
const uniq = () => crypto.randomBytes(4).toString('hex');
const created = { businessIds: new Set<string>(), userIds: new Set<string>() };

async function api(path: string, init: RequestInit = {}, token?: string, businessId?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init.headers as Record<string, string>) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (businessId) headers['x-business-id'] = businessId;
  const res = await fetch(`${BASE}/api${path}`, { ...init, headers });
  const text = await res.text();
  let body: unknown;
  try { body = text ? JSON.parse(text) : undefined; } catch { body = text; }
  return { status: res.status, body: body as Record<string, unknown> | undefined };
}

async function registerAndToken(email: string, password: string): Promise<{ token: string; businessId: string; userId: string }> {
  const reg = await api('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ businessName: `Biz ${crypto.randomBytes(3).toString('hex')}`, email, password, firstName: 'Own' }),
  });
  assert.equal(reg.status, 201, `register failed: ${JSON.stringify(reg.body)}`);
  const businessId = (reg.body!.business as { id: string }).id;
  const userId = (reg.body!.user as { id: string }).id;
  created.businessIds.add(businessId);
  created.userIds.add(userId);
  const sb = createClient(SB_URL, SB_SRK, { auth: { persistSession: false } });
  const { data: si, error } = await sb.auth.signInWithPassword({ email, password });
  assert.ok(!error && si.session, `signIn failed: ${error?.message}`);
  return { token: si.session.access_token, businessId, userId };
}

before(async () => {
  try { backUp = (await fetch(`${BASE}/health`)).ok; } catch { backUp = false; }
  if (!backUp) console.warn(`[e2e] back no responde en ${BASE} — tests saltados`);
});
beforeEach(async () => {
  if (!backUp) return;
  await fetch(`${BASE}/api/auth/__test__/reset-rate-limits?buckets=register`, { method: 'POST' }).catch(() => {});
});
after(async () => {
  if (!backUp || !SB_URL) return;
  const cleanup = createClient(SB_URL, SB_SRK, { auth: { persistSession: false } });
  for (const id of created.userIds) await cleanup.auth.admin.deleteUser(id).catch((e) => console.error('[e2e cleanup]', e instanceof Error ? e.message : e));
  for (const id of created.businessIds) await prisma.business.delete({ where: { id } }).catch((e) => console.error('[e2e cleanup]', e instanceof Error ? e.message : e));
  await prisma.$disconnect();
});

// 3.2.b — POST calcula subtotal y Sale.total = Σ; DELETE recalcula
test('POST /sales/:id/lineas calcula subtotal y Sale.total = Σ; DELETE recalcula', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const { token, businessId } = await registerAndToken(`line1_${uniq()}@test.local`, 'Line-pass-1234');
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

  const { token, businessId } = await registerAndToken(`line3_${uniq()}@test.local`, 'Line-pass-1234');
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

  const a = await registerAndToken(`line2a_${uniq()}@test.local`, 'Line-pass-1234');
  const b = await registerAndToken(`line2b_${uniq()}@test.local`, 'Line-pass-1234');
  const saleB = await prisma.sale.create({ data: { businessId: b.businessId, cliente: 'Contado' } });

  const r = await api(`/sales/${saleB.id}/lineas`, { method: 'POST', body: JSON.stringify({ concepto: 'X', cantidad: 1, precioUnitario: 1 }) }, a.token, a.businessId);
  assert.equal(r.status, 404, `expected 404, got ${r.status}: ${JSON.stringify(r.body)}`);

  await prisma.sale.delete({ where: { id: saleB.id } }).catch((e) => console.error('[e2e cleanup]', e instanceof Error ? e.message : e));
});
