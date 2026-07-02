// E2E tests: documentos (Document) en /documents.
// Cubre 3.2.c: POST crea scoped al negocio; GET lista solo los del negocio activo;
// employeeId de otro negocio → 422 cross_tenant; DELETE hard.
// Requires the back running at localhost:4001 + live Supabase credentials.
//
// Runner: node --import tsx --test
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
  for (const id of created.userIds) await cleanup.auth.admin.deleteUser(id).catch(() => {});
  for (const id of created.businessIds) await prisma.business.delete({ where: { id } }).catch(() => {});
  await prisma.$disconnect();
});

// 3.2.c — POST 201 + GET lista solo para ese negocio (scoping)
test('POST /documents → 201 y GET lo lista solo para su negocio', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const a = await registerAndToken(`doc1a_${uniq()}@test.local`, 'Doc-pass-1234');
  const b = await registerAndToken(`doc1b_${uniq()}@test.local`, 'Doc-pass-1234');

  const post = await api('/documents', { method: 'POST', body: JSON.stringify({ titulo: 'Contrato', tipo: 'CONTRACT', rutaArchivo: '/x/contrato.pdf' }) }, a.token, a.businessId);
  assert.equal(post.status, 201, `expected 201, got ${post.status}: ${JSON.stringify(post.body)}`);

  const listA = await api('/documents', {}, a.token, a.businessId);
  assert.equal((listA.body!.items as unknown[]).length, 1, 'A ve su documento');

  const listB = await api('/documents', {}, b.token, b.businessId);
  assert.equal((listB.body!.items as unknown[]).length, 0, 'B no ve el documento de A');
});

// 3.2.c — employeeId de otro negocio → 422 cross_tenant
test('POST /documents con employeeId ajeno → 422 cross_tenant', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const a = await registerAndToken(`doc2a_${uniq()}@test.local`, 'Doc-pass-1234');
  const b = await registerAndToken(`doc2b_${uniq()}@test.local`, 'Doc-pass-1234');
  const empB = await prisma.employee.create({ data: { businessId: b.businessId, nombre: 'Ajeno', rol: 'Estilista' } });

  const r = await api('/documents', { method: 'POST', body: JSON.stringify({ titulo: 'Nómina', tipo: 'PAYROLL', rutaArchivo: '/x/nomina.pdf', employeeId: empB.id }) }, a.token, a.businessId);
  assert.equal(r.status, 422, `expected 422, got ${r.status}: ${JSON.stringify(r.body)}`);
  assert.equal((r.body!.error as { code: string }).code, 'cross_tenant');

  await prisma.employee.delete({ where: { id: empB.id } }).catch(() => {});
});

// 3.2.c — DELETE hard: el documento desaparece físicamente
test('DELETE /documents/:id borra físicamente (sin soft-delete)', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const a = await registerAndToken(`doc3_${uniq()}@test.local`, 'Doc-pass-1234');
  const post = await api('/documents', { method: 'POST', body: JSON.stringify({ titulo: 'Temp', rutaArchivo: '/x/temp.pdf' }) }, a.token, a.businessId);
  const id = (post.body as { id: string }).id;

  const del = await api(`/documents/${id}`, { method: 'DELETE' }, a.token, a.businessId);
  assert.equal(del.status, 204);
  const gone = await prisma.document.findUnique({ where: { id } });
  assert.equal(gone, null, 'el documento debe estar borrado físicamente');
});
