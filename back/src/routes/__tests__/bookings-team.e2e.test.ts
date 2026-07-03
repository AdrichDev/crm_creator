// E2E tests: reserva de equipo (entrenamiento) en /bookings.
// XOR customerId/teamId (spec crm-citas-por-sector, escenarios C-S4/C-S5).
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
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (businessId) headers['x-business-id'] = businessId;
  const res = await fetch(`${BASE}/api${path}`, { ...init, headers });
  const text = await res.text();
  let body: unknown;
  try { body = text ? JSON.parse(text) : undefined; } catch { body = text; }
  return { status: res.status, body: body as Record<string, unknown> | undefined };
}

async function registerAndToken(
  email: string,
  password: string,
): Promise<{ token: string; businessId: string; userId: string }> {
  const reg = await api('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      businessName: `Biz ${crypto.randomBytes(3).toString('hex')}`,
      email, password, firstName: 'Own',
    }),
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

test('POST /bookings con customerId + teamId a la vez → 400 XOR_REQUIRED', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const { token, businessId } = await registerAndToken(`bk_xor1_${uniq()}@test.local`, 'Book-pass-1234');
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

  const { token, businessId } = await registerAndToken(`bk_team1_${uniq()}@test.local`, 'Book-pass-1234');
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
