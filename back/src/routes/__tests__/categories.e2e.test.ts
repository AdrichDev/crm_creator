// E2E tests for /categories routes (teams + team members).
// Tests: XOR validation, minor-age validation, soft-delete isolation.
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
      email,
      password,
      firstName: 'Own',
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
  try {
    backUp = (await fetch(`${BASE}/health`)).ok;
  } catch {
    backUp = false;
  }
  if (!backUp) {
    console.warn(`[e2e] back no responde en ${BASE} — tests saltados`);
    return;
  }
  await fetch(`${BASE}/api/auth/__test__/reset-rate-limits?buckets=register`, { method: 'POST' }).catch(() => {});
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

// ---------------------------------------------------------------------------
// 5.1 POST /categories/:id/members sin FKs → 400 XOR_REQUIRED
// ---------------------------------------------------------------------------
test('POST /members sin employeeId ni customerId → 400 XOR_REQUIRED', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const { token, businessId } = await registerAndToken(`cat_xor1_${uniq()}@test.local`, 'Cat-pass-1234');

  // Crear equipo
  const teamRes = await api('/categories', {
    method: 'POST',
    body: JSON.stringify({ nombre: 'Equipo A', deporte: 'FUTBOL_11' }),
  }, token, businessId);
  assert.equal(teamRes.status, 201, `create team failed: ${JSON.stringify(teamRes.body)}`);
  const teamId = (teamRes.body as { id: string }).id;

  // POST sin FKs
  const r = await api(`/categories/${teamId}/members`, {
    method: 'POST',
    body: JSON.stringify({ rol: 'Jugador' }),
  }, token, businessId);
  assert.equal(r.status, 400, `expected 400, got ${r.status}: ${JSON.stringify(r.body)}`);
  assert.equal((r.body!.error as { code: string }).code, 'XOR_REQUIRED');
});

// ---------------------------------------------------------------------------
// 5.2 POST /categories/:id/members con employeeId + customerId a la vez → 400 XOR_REQUIRED
// ---------------------------------------------------------------------------
test('POST /members con employeeId + customerId a la vez → 400 XOR_REQUIRED', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const { token, businessId } = await registerAndToken(`cat_xor2_${uniq()}@test.local`, 'Cat-pass-1234');

  const teamRes = await api('/categories', {
    method: 'POST',
    body: JSON.stringify({ nombre: 'Equipo B' }),
  }, token, businessId);
  assert.equal(teamRes.status, 201);
  const teamId = (teamRes.body as { id: string }).id;

  // Crear Employee + Customer directamente en DB
  const employee = await prisma.employee.create({
    data: { businessId, nombre: 'Staff', rol: 'Entrenador' },
  });
  const customer = await prisma.customer.create({
    data: { businessId, nombre: 'Socio' },
  });

  const r = await api(`/categories/${teamId}/members`, {
    method: 'POST',
    body: JSON.stringify({ employeeId: employee.id, customerId: customer.id, rol: 'Jugador' }),
  }, token, businessId);
  assert.equal(r.status, 400, `expected 400, got ${r.status}: ${JSON.stringify(r.body)}`);
  assert.equal((r.body!.error as { code: string }).code, 'XOR_REQUIRED');

  // Cleanup
  await prisma.employee.delete({ where: { id: employee.id } }).catch((e) => console.error('[e2e cleanup]', e instanceof Error ? e.message : e));
  await prisma.customer.delete({ where: { id: customer.id } }).catch((e) => console.error('[e2e cleanup]', e instanceof Error ? e.message : e));
});

// ---------------------------------------------------------------------------
// 5.3 XOR válido: solo customerId (adulto) → 201
// ---------------------------------------------------------------------------
test('POST /members solo customerId (adulto) → 201', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const { token, businessId } = await registerAndToken(`cat_xor3_${uniq()}@test.local`, 'Cat-pass-1234');

  const teamRes = await api('/categories', {
    method: 'POST',
    body: JSON.stringify({ nombre: 'Equipo C', deporte: 'BALONCESTO' }),
  }, token, businessId);
  assert.equal(teamRes.status, 201);
  const teamId = (teamRes.body as { id: string }).id;

  // Customer adulto (30 años)
  const dob = new Date();
  dob.setFullYear(dob.getFullYear() - 30);
  const customer = await prisma.customer.create({
    data: { businessId, nombre: 'Adulto', fechaNacimiento: dob },
  });

  const r = await api(`/categories/${teamId}/members`, {
    method: 'POST',
    body: JSON.stringify({ customerId: customer.id, rol: 'Jugador' }),
  }, token, businessId);
  assert.equal(r.status, 201, `expected 201, got ${r.status}: ${JSON.stringify(r.body)}`);
  const memberId = (r.body as { id: string }).id;
  assert.ok(memberId, 'response should include id');

  // Cleanup
  await prisma.teamMember.delete({ where: { id: memberId } }).catch((e) => console.error('[e2e cleanup]', e instanceof Error ? e.message : e));
  await prisma.customer.delete({ where: { id: customer.id } }).catch((e) => console.error('[e2e cleanup]', e instanceof Error ? e.message : e));
});

// ---------------------------------------------------------------------------
// 5.4 customerId menor de edad + 0 contactos de emergencia → 422 MINOR_NO_CONTACTS
// ---------------------------------------------------------------------------
test('POST /members customerId menor de edad, 0 contactos → 422 MINOR_NO_CONTACTS', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const { token, businessId } = await registerAndToken(`cat_minor_${uniq()}@test.local`, 'Cat-pass-1234');

  const teamRes = await api('/categories', {
    method: 'POST',
    body: JSON.stringify({ nombre: 'Equipo D', deporte: 'FUTBOL_7' }),
  }, token, businessId);
  assert.equal(teamRes.status, 201);
  const teamId = (teamRes.body as { id: string }).id;

  // Customer menor (12 años)
  const dob = new Date();
  dob.setFullYear(dob.getFullYear() - 12);
  const customer = await prisma.customer.create({
    data: { businessId, nombre: 'Menor', fechaNacimiento: dob },
  });

  const r = await api(`/categories/${teamId}/members`, {
    method: 'POST',
    body: JSON.stringify({ customerId: customer.id, rol: 'Jugador', contactosEmergencia: [] }),
  }, token, businessId);
  assert.equal(r.status, 422, `expected 422, got ${r.status}: ${JSON.stringify(r.body)}`);
  assert.equal((r.body!.error as { code: string }).code, 'MINOR_NO_CONTACTS');

  // Cleanup
  await prisma.customer.delete({ where: { id: customer.id } }).catch((e) => console.error('[e2e cleanup]', e instanceof Error ? e.message : e));
});

// ---------------------------------------------------------------------------
// 5.5 customerId mayor de edad + 0 contactos → 201
// ---------------------------------------------------------------------------
test('POST /members customerId mayor de edad, 0 contactos → 201', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const { token, businessId } = await registerAndToken(`cat_adult_${uniq()}@test.local`, 'Cat-pass-1234');

  const teamRes = await api('/categories', {
    method: 'POST',
    body: JSON.stringify({ nombre: 'Equipo E', deporte: 'NATACION' }),
  }, token, businessId);
  assert.equal(teamRes.status, 201);
  const teamId = (teamRes.body as { id: string }).id;

  // Customer adulto (25 años, sin contactos de emergencia)
  const dob = new Date();
  dob.setFullYear(dob.getFullYear() - 25);
  const customer = await prisma.customer.create({
    data: { businessId, nombre: 'Mayor', fechaNacimiento: dob },
  });

  const r = await api(`/categories/${teamId}/members`, {
    method: 'POST',
    body: JSON.stringify({ customerId: customer.id, rol: 'Nadador', contactosEmergencia: [] }),
  }, token, businessId);
  assert.equal(r.status, 201, `expected 201, got ${r.status}: ${JSON.stringify(r.body)}`);
  assert.ok((r.body as { id: string }).id, 'response should include id');

  // Cleanup
  const memberId = (r.body as { id: string }).id;
  await prisma.teamMember.delete({ where: { id: memberId } }).catch((e) => console.error('[e2e cleanup]', e instanceof Error ? e.message : e));
  await prisma.customer.delete({ where: { id: customer.id } }).catch((e) => console.error('[e2e cleanup]', e instanceof Error ? e.message : e));
});

// ---------------------------------------------------------------------------
// 5.6 Soft-delete equipo → Customer y Employee vinculados permanecen en BD
// ---------------------------------------------------------------------------
test('soft-delete equipo → Customer y Employee siguen existiendo en BD', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const { token, businessId } = await registerAndToken(`cat_soft_${uniq()}@test.local`, 'Cat-pass-1234');

  // Crear equipo
  const teamRes = await api('/categories', {
    method: 'POST',
    body: JSON.stringify({ nombre: 'Equipo Borrable', deporte: 'OTRO' }),
  }, token, businessId);
  assert.equal(teamRes.status, 201);
  const teamId = (teamRes.body as { id: string }).id;

  // Crear Customer y Employee directamente en DB
  const customer = await prisma.customer.create({ data: { businessId, nombre: 'SocioPersistente' } });
  const employee = await prisma.employee.create({ data: { businessId, nombre: 'StaffPersistente', rol: 'Monitor' } });

  // Añadir miembros
  await prisma.teamMember.create({ data: { teamId, customerId: customer.id, rol: 'Jugador' } });
  await prisma.teamMember.create({ data: { teamId, employeeId: employee.id, rol: 'Entrenador' } });

  // Soft-delete del equipo via API
  const del = await api(`/categories/${teamId}`, { method: 'DELETE' }, token, businessId);
  assert.equal(del.status, 204, `expected 204, got ${del.status}`);

  // Verificar equipo marcado como eliminado
  const deletedTeam = await prisma.team.findUnique({ where: { id: teamId } });
  assert.ok(deletedTeam?.eliminadoEn, 'Team should have eliminadoEn set');

  // Verificar Customer y Employee siguen existiendo
  const stillCustomer = await prisma.customer.findUnique({ where: { id: customer.id } });
  const stillEmployee = await prisma.employee.findUnique({ where: { id: employee.id } });
  assert.ok(stillCustomer, 'Customer debe seguir existiendo tras soft-delete del equipo');
  assert.ok(stillEmployee, 'Employee debe seguir existiendo tras soft-delete del equipo');

  // Cleanup
  await prisma.teamMember.deleteMany({ where: { teamId } }).catch((e) => console.error('[e2e cleanup]', e instanceof Error ? e.message : e));
  await prisma.team.delete({ where: { id: teamId } }).catch((e) => console.error('[e2e cleanup]', e instanceof Error ? e.message : e));
  await prisma.customer.delete({ where: { id: customer.id } }).catch((e) => console.error('[e2e cleanup]', e instanceof Error ? e.message : e));
  await prisma.employee.delete({ where: { id: employee.id } }).catch((e) => console.error('[e2e cleanup]', e instanceof Error ? e.message : e));
});
