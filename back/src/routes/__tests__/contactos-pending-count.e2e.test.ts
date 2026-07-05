// E2E test for GET /contactos/pending-count (badge del sidebar, front/components/layout/sidebar.tsx).
// Requires the back running at localhost:4001 + live Supabase credentials.
//
// Runner: node --import tsx --test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { api, probeBack, registerAndToken, cleanup, uniq, SUPABASE_LIVE } from './_shared.e2e.js';

let backUp = false;

before(async () => { backUp = await probeBack(); if (!backUp) console.warn('[e2e] back no responde — tests saltados'); });
after(async () => { await cleanup(backUp); });

// ---------------------------------------------------------------------------
// GET /contactos/pending-count aísla por negocio: un contacto pendiente del
// negocio A nunca debe sumar al contador del negocio B (real multi-tenant CRM,
// a diferencia de agents-agency que es single-tenant).
// ---------------------------------------------------------------------------
test('GET /contactos/pending-count no cuenta contactos de otro negocio', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const a = await registerAndToken(`pend_a_${uniq()}@test.local`, 'Pend-pass-1234', t);
  if (!a) return;
  const b = await registerAndToken(`pend_b_${uniq()}@test.local`, 'Pend-pass-1234', t);
  if (!b) return;

  // Negocio A: 2 contactos pendientes (contactado default 'no') + 1 ya contactado.
  for (const nombre of ['Pendiente A1', 'Pendiente A2']) {
    const r = await api('/contactos', { method: 'POST', body: JSON.stringify({ nombre }) }, a.token, a.businessId);
    assert.equal(r.status, 201, `create failed: ${JSON.stringify(r.body)}`);
  }
  const contactado = await api('/contactos', {
    method: 'POST', body: JSON.stringify({ nombre: 'Ya contactado A', contactado: 'si' }),
  }, a.token, a.businessId);
  assert.equal(contactado.status, 201);

  // Negocio B: sin contactos.
  const countB = await api('/contactos/pending-count', {}, b.token, b.businessId);
  assert.equal(countB.status, 200, `expected 200, got ${countB.status}: ${JSON.stringify(countB.body)}`);
  assert.equal((countB.body as { count: number }).count, 0, 'el negocio B no debe ver pendientes del negocio A');

  const countA = await api('/contactos/pending-count', {}, a.token, a.businessId);
  assert.equal(countA.status, 200);
  assert.equal((countA.body as { count: number }).count, 2, 'el negocio A debe ver solo sus propios pendientes');
});
