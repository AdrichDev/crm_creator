// E2E tests: documentos (Document) en /documents.
// Cubre 3.2.c: POST crea scoped al negocio; GET lista solo los del negocio activo;
// employeeId de otro negocio → 422 cross_tenant; DELETE hard.
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

// 3.2.c — POST 201 + GET lista solo para ese negocio (scoping)
test('POST /documents → 201 y GET lo lista solo para su negocio', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const a = await registerAndToken(`doc1a_${uniq()}@test.local`, 'Doc-pass-1234', t);
  const b = await registerAndToken(`doc1b_${uniq()}@test.local`, 'Doc-pass-1234', t);
  if (!a || !b) return;

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

  const a = await registerAndToken(`doc2a_${uniq()}@test.local`, 'Doc-pass-1234', t);
  const b = await registerAndToken(`doc2b_${uniq()}@test.local`, 'Doc-pass-1234', t);
  if (!a || !b) return;
  const empB = await prisma.employee.create({ data: { businessId: b.businessId, nombre: 'Ajeno', rol: 'Estilista' } });

  const r = await api('/documents', { method: 'POST', body: JSON.stringify({ titulo: 'Nómina', tipo: 'PAYROLL', rutaArchivo: '/x/nomina.pdf', employeeId: empB.id }) }, a.token, a.businessId);
  assert.equal(r.status, 422, `expected 422, got ${r.status}: ${JSON.stringify(r.body)}`);
  assert.equal((r.body!.error as { code: string }).code, 'cross_tenant');

  await prisma.employee.delete({ where: { id: empB.id } }).catch((e) => console.error('[e2e cleanup]', e instanceof Error ? e.message : e));
});

// 3.2.c — DELETE hard: el documento desaparece físicamente
test('DELETE /documents/:id borra físicamente (sin soft-delete)', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const a = await registerAndToken(`doc3_${uniq()}@test.local`, 'Doc-pass-1234', t);
  if (!a) return;
  const post = await api('/documents', { method: 'POST', body: JSON.stringify({ titulo: 'Temp', rutaArchivo: '/x/temp.pdf' }) }, a.token, a.businessId);
  const id = (post.body as { id: string }).id;

  const del = await api(`/documents/${id}`, { method: 'DELETE' }, a.token, a.businessId);
  assert.equal(del.status, 204);
  const gone = await prisma.document.findUnique({ where: { id } });
  assert.equal(gone, null, 'el documento debe estar borrado físicamente');
});
