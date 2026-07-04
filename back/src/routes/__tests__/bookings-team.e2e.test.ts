// E2E tests: reserva de equipo (entrenamiento) en /bookings.
// XOR customerId/teamId (spec crm-citas-por-sector, escenarios C-S4/C-S5).
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

test('POST /bookings con customerId + teamId a la vez → 400 XOR_REQUIRED', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const auth = await registerAndToken(`bk_xor1_${uniq()}@test.local`, 'Book-pass-1234', t);
  if (!auth) return;
  const { token, businessId } = auth;
  const location = await prisma.location.create({ data: { businessId, nombre: 'Sede' } });
  const service = await prisma.service.create({ data: { businessId, nombre: 'Entrenamiento', duracion: 60, precio: 0 } });
  const team = await prisma.team.create({ data: { businessId, nombre: 'Equipo A' } });
  const customer = await prisma.customer.create({ data: { businessId, nombre: 'Socio' } });

  const r = await api('/bookings', {
    method: 'POST',
    body: JSON.stringify({
      locationId: location.id, serviceId: service.id,
      customerId: customer.id, teamId: team.id,
      start: new Date(Date.now() + 86400000).toISOString(),
    }),
  }, token, businessId);
  assert.equal(r.status, 400, `expected 400, got ${r.status}: ${JSON.stringify(r.body)}`);
  assert.equal((r.body!.error as { code: string }).code, 'XOR_REQUIRED');
});

test('POST /bookings solo teamId (entrenamiento) → 201 y aparece como cliente=nombre del equipo', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const auth = await registerAndToken(`bk_team1_${uniq()}@test.local`, 'Book-pass-1234', t);
  if (!auth) return;
  const { token, businessId } = auth;
  const location = await prisma.location.create({ data: { businessId, nombre: 'Sede' } });
  const service = await prisma.service.create({ data: { businessId, nombre: 'Entrenamiento', duracion: 60, precio: 0 } });
  const team = await prisma.team.create({ data: { businessId, nombre: 'Equipo B' } });

  const create = await api('/bookings', {
    method: 'POST',
    body: JSON.stringify({
      locationId: location.id, serviceId: service.id, teamId: team.id,
      start: new Date(Date.now() + 86400000).toISOString(),
    }),
  }, token, businessId);
  assert.equal(create.status, 201, `expected 201, got ${create.status}: ${JSON.stringify(create.body)}`);
  assert.equal((create.body as { teamId: string }).teamId, team.id);
  assert.equal((create.body as { customerId: string | null }).customerId, null);

  const list = await api('/bookings', {}, token, businessId);
  const row = (list.body!.items as { id: string; cliente: string }[]).find((b) => b.id === (create.body as { id: string }).id);
  assert.equal(row?.cliente, 'Equipo B');
});
