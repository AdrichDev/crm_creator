// E2E tests: notificaciones (Notification) read-only en /notifications.
// Cubre 3.2.d: GET devuelve solo las del negocio activo, filtrables por estado/tipo.
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

// 3.2.d — GET solo las del negocio activo, filtrables por estado
test('GET /notifications devuelve solo las del negocio activo y filtra por estado', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const a = await registerAndToken(`ntf1a_${uniq()}@test.local`, 'Ntf-pass-1234');
  const b = await registerAndToken(`ntf1b_${uniq()}@test.local`, 'Ntf-pass-1234');

  // Sembrar: 2 del negocio A (una pending, una sent) + 1 del negocio B.
  await prisma.notification.createMany({
    data: [
      { businessId: a.businessId, tipo: 'test.a', destino: `x${uniq()}@t.local`, estado: 'pending' },
      { businessId: a.businessId, tipo: 'test.a', destino: `x${uniq()}@t.local`, estado: 'sent' },
      { businessId: b.businessId, tipo: 'test.b', destino: `x${uniq()}@t.local`, estado: 'pending' },
    ],
  });

  const all = await api('/notifications', {}, a.token, a.businessId);
  assert.equal((all.body!.items as unknown[]).length, 2, 'A ve solo sus 2 notificaciones');

  const pend = await api('/notifications?estado=pending', {}, a.token, a.businessId);
  const pendItems = pend.body!.items as { estado: string }[];
  assert.equal(pendItems.length, 1, 'filtro estado=pending → 1');
  assert.ok(pendItems.every((n) => n.estado === 'pending'));

  await prisma.notification.deleteMany({ where: { businessId: { in: [a.businessId, b.businessId] } } }).catch(() => {});
});
