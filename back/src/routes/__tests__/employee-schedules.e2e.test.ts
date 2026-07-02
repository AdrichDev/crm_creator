// E2E tests: horario semanal del empleado (EmployeeSchedule) en /employees/:id/horario.
// Cubre 3.2.a: reemplazo atómico (PUT 3 tramos → GET exactamente esos), validación
// diaSemana/HH:MM, y scoping tenant (empleado de otro negocio → 404).
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

// 3.2.a — PUT 3 tramos → GET devuelve exactamente esos (reemplazo atómico)
test('PUT /employees/:id/horario con 3 tramos → GET devuelve exactamente esos', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const { token, businessId } = await registerAndToken(`sched1_${uniq()}@test.local`, 'Sched-pass-1234');
  const emp = await prisma.employee.create({ data: { businessId, nombre: 'Ana', rol: 'Estilista' } });

  // Horario inicial (2 tramos) para probar que el PUT REEMPLAZA, no acumula.
  await prisma.employeeSchedule.create({ data: { employeeId: emp.id, diaSemana: 3, inicio: '08:00', fin: '12:00' } });

  const tramos = [
    { diaSemana: 1, inicio: '09:00', fin: '13:00' },
    { diaSemana: 1, inicio: '16:00', fin: '20:00' },
    { diaSemana: 5, inicio: '10:00', fin: '14:00' },
  ];
  const put = await api(`/employees/${emp.id}/horario`, { method: 'PUT', body: JSON.stringify({ tramos }) }, token, businessId);
  assert.equal(put.status, 200, `expected 200, got ${put.status}: ${JSON.stringify(put.body)}`);

  const get = await api(`/employees/${emp.id}/horario`, {}, token, businessId);
  const got = (get.body!.tramos as { diaSemana: number; inicio: string; fin: string }[]).map((x) => ({ diaSemana: x.diaSemana, inicio: x.inicio, fin: x.fin }));
  assert.deepEqual(got, tramos, 'GET debe devolver exactamente los 3 tramos del PUT (ordenados por dia/inicio)');

  await prisma.employee.delete({ where: { id: emp.id } }).catch(() => {});
});

// 3.2.a — validación de formato (diaSemana fuera de rango / HH:MM inválido → 400)
test('PUT /employees/:id/horario con diaSemana o HH:MM inválido → 400', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const { token, businessId } = await registerAndToken(`sched2_${uniq()}@test.local`, 'Sched-pass-1234');
  const emp = await prisma.employee.create({ data: { businessId, nombre: 'Bea', rol: 'Barbero' } });

  const badDay = await api(`/employees/${emp.id}/horario`, { method: 'PUT', body: JSON.stringify({ tramos: [{ diaSemana: 9, inicio: '09:00', fin: '10:00' }] }) }, token, businessId);
  assert.equal(badDay.status, 400, `expected 400 dia, got ${badDay.status}`);

  const badHora = await api(`/employees/${emp.id}/horario`, { method: 'PUT', body: JSON.stringify({ tramos: [{ diaSemana: 2, inicio: '9am', fin: '10:00' }] }) }, token, businessId);
  assert.equal(badHora.status, 400, `expected 400 hora, got ${badHora.status}`);

  await prisma.employee.delete({ where: { id: emp.id } }).catch(() => {});
});

// 3.2.a — empleado de OTRO negocio → 404 (scoping tenant)
test('PUT /employees/:id/horario de empleado ajeno → 404', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const a = await registerAndToken(`sched3a_${uniq()}@test.local`, 'Sched-pass-1234');
  const b = await registerAndToken(`sched3b_${uniq()}@test.local`, 'Sched-pass-1234');
  const empB = await prisma.employee.create({ data: { businessId: b.businessId, nombre: 'Ajeno', rol: 'Estilista' } });

  // A intenta editar el horario de un empleado de B → 404 (no existe en su negocio).
  const put = await api(`/employees/${empB.id}/horario`, { method: 'PUT', body: JSON.stringify({ tramos: [] }) }, a.token, a.businessId);
  assert.equal(put.status, 404, `expected 404, got ${put.status}: ${JSON.stringify(put.body)}`);

  await prisma.employee.delete({ where: { id: empB.id } }).catch(() => {});
});
