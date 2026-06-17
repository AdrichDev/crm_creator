// E2E del auto-registro de cliente + verificación de email.
// Requiere el back levantado (npm run dev) en localhost:4001. Si no responde, se salta.
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { hashToken } from '../../lib/password.js';
import { hashPassword } from '../../lib/auth.js';

const BASE = process.env.TEST_API_URL ?? 'http://localhost:4001';
const prisma = new PrismaClient();
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

/** Crea un negocio nuevo vía /register para tener un businessId válido. */
async function newBusiness() {
  const r = await api('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ businessName: `Biz ${uniq()}`, email: `owner_${uniq()}@test.local`, password: 'owner-pass-123', firstName: 'Owner' }),
  });
  assert.equal(r.status, 201, `register falló: ${JSON.stringify(r.body)}`);
  const businessId = (r.body!.business as { id: string }).id;
  created.businessIds.add(businessId);
  created.userIds.add((r.body!.user as { id: string }).id);
  return businessId;
}

before(async () => {
  try { backUp = (await fetch(`${BASE}/health`)).ok; } catch { backUp = false; }
  if (!backUp) { console.warn(`[e2e] back no responde en ${BASE} — tests saltados`); return; }
  await fetch(`${BASE}/api/auth/__test__/reset-rate-limits`, { method: 'POST' }).catch(() => {});
});

// register-client está limitado a 5/ventana por IP → reinicia contadores entre tests.
beforeEach(async () => {
  if (!backUp) return;
  await fetch(`${BASE}/api/auth/__test__/reset-rate-limits`, { method: 'POST' }).catch(() => {});
});

after(async () => {
  for (const id of created.userIds) await prisma.user.delete({ where: { id } }).catch(() => {});
  for (const id of created.businessIds) await prisma.business.delete({ where: { id } }).catch(() => {});
  await prisma.$disconnect();
});

test('register-client crea cliente pending (CLIENT) con username/phone y responde neutro', async (t) => {
  if (!backUp) return t.skip('back down');
  const businessId = await newBusiness();
  const email = `cli_${uniq()}@test.local`;
  const username = `cli_${uniq()}`;
  const r = await api('/auth/register-client', { method: 'POST', body: JSON.stringify({ firstName: 'Cliente', email, username, phone: '600111222' }) }, undefined, businessId);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(typeof r.body!.message === 'string');
  assert.ok(!('userId' in r.body!), 'no debe filtrar ids (respuesta neutra)');

  const db = await prisma.user.findUnique({ where: { email }, select: { id: true, status: true, username: true, phone: true, emailVerifiedAt: true, memberships: { select: { role: true, businessId: true } } } });
  assert.ok(db, 'usuario creado');
  created.userIds.add(db!.id);
  assert.equal(db!.status, 'pending');
  assert.equal(db!.username, username);
  assert.equal(db!.phone, '600111222');
  assert.equal(db!.emailVerifiedAt, null);
  assert.equal(db!.memberships[0]?.role, 'CLIENT');
  assert.equal(db!.memberships[0]?.businessId, businessId);
});

test('register-client sin x-business-id → 400', async (t) => {
  if (!backUp) return t.skip('back down');
  const r = await api('/auth/register-client', { method: 'POST', body: JSON.stringify({ firstName: 'X', email: `nb_${uniq()}@test.local`, username: `nb_${uniq()}`, phone: '600000000' }) });
  assert.equal(r.status, 400);
});

test('register-client con email repetido responde neutro y NO crea segundo usuario', async (t) => {
  if (!backUp) return t.skip('back down');
  const businessId = await newBusiness();
  const email = `dup_${uniq()}@test.local`;
  const r1 = await api('/auth/register-client', { method: 'POST', body: JSON.stringify({ firstName: 'A', email, username: `a_${uniq()}`, phone: '600111222' }) }, undefined, businessId);
  assert.equal(r1.status, 200);
  const u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  created.userIds.add(u!.id);
  const r2 = await api('/auth/register-client', { method: 'POST', body: JSON.stringify({ firstName: 'B', email, username: `b_${uniq()}`, phone: '600999888' }) }, undefined, businessId);
  assert.equal(r2.status, 200, 'misma respuesta neutra (anti-enumeración)');
  const count = await prisma.user.count({ where: { email } });
  assert.equal(count, 1, 'no se crea un segundo usuario con el mismo email');
});

test('register-client con username ya en uso → 409', async (t) => {
  if (!backUp) return t.skip('back down');
  const businessId = await newBusiness();
  const username = `taken_${uniq()}`;
  const r1 = await api('/auth/register-client', { method: 'POST', body: JSON.stringify({ firstName: 'A', email: `u1_${uniq()}@test.local`, username, phone: '600111222' }) }, undefined, businessId);
  assert.equal(r1.status, 200);
  const u = await prisma.user.findFirst({ where: { username }, select: { id: true } });
  created.userIds.add(u!.id);
  const r2 = await api('/auth/register-client', { method: 'POST', body: JSON.stringify({ firstName: 'B', email: `u2_${uniq()}@test.local`, username, phone: '600999888' }) }, undefined, businessId);
  assert.equal(r2.status, 409);
});

test('verify-email con token válido → activa, fija contraseña y permite login', async (t) => {
  if (!backUp) return t.skip('back down');
  const businessId = await newBusiness();
  const email = `vf_${uniq()}@test.local`;
  await api('/auth/register-client', { method: 'POST', body: JSON.stringify({ firstName: 'Ver', email, username: `vf_${uniq()}`, phone: '600111222' }) }, undefined, businessId);
  const u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  created.userIds.add(u!.id);

  // Simula el enlace del email: inyecta el hash de un token verify_email en BD.
  const plain = crypto.randomBytes(32).toString('base64url');
  await prisma.authToken.updateMany({ where: { userId: u!.id, usedAt: null }, data: { usedAt: new Date() } });
  await prisma.authToken.create({ data: { userId: u!.id, tokenHash: hashToken(plain), purpose: 'verify_email', expiresAt: new Date(Date.now() + 60_000) } });

  const v = await api('/auth/verify-email', { method: 'POST', body: JSON.stringify({ token: plain, newPassword: 'cliente-pass-1', repeatPassword: 'cliente-pass-1' }) });
  assert.equal(v.status, 204, JSON.stringify(v.body));
  const db = await prisma.user.findUnique({ where: { id: u!.id }, select: { status: true, emailVerifiedAt: true } });
  assert.equal(db!.status, 'active');
  assert.ok(db!.emailVerifiedAt, 'emailVerifiedAt sellado');

  // Reuso del token → 400. Login con la nueva contraseña → 200.
  const reuse = await api('/auth/verify-email', { method: 'POST', body: JSON.stringify({ token: plain, newPassword: 'otra-pass-12', repeatPassword: 'otra-pass-12' }) });
  assert.equal(reuse.status, 400);
  const login = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password: 'cliente-pass-1' }) });
  assert.equal(login.status, 200);
});

test('login de cuenta no verificada (status pending) → 403 email_no_verificado', async (t) => {
  if (!backUp) return t.skip('back down');
  const businessId = await newBusiness();
  const email = `pend_${uniq()}@test.local`;
  // Crea directamente un usuario pending CON contraseña conocida para ejercitar el gate.
  const user = await prisma.user.create({ data: { email, firstName: 'Pend', passwordHash: await hashPassword('conocida-pass-1'), status: 'pending' } });
  created.userIds.add(user.id);
  await prisma.membership.create({ data: { userId: user.id, businessId, role: 'CLIENT' } });

  const login = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password: 'conocida-pass-1' }) });
  assert.equal(login.status, 403);
  assert.equal((login.body!.error as { code: string }).code, 'email_no_verificado');
});

test('RBAC: CLIENT recibe 403 en endpoints de staff y solo accede a /me (scoped)', async (t) => {
  if (!backUp) return t.skip('back down');
  const businessId = await newBusiness();
  const email = `rbac_${uniq()}@test.local`;
  // Crea un CLIENT verificado con contraseña conocida (vía prisma para ir directo).
  const user = await prisma.user.create({ data: { email, firstName: 'Cli', passwordHash: await hashPassword('cliente-pass-1'), status: 'active', emailVerifiedAt: new Date() } });
  created.userIds.add(user.id);
  await prisma.membership.create({ data: { userId: user.id, businessId, role: 'CLIENT' } });

  const login = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password: 'cliente-pass-1' }) });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  const token = login.body!.token as string;

  // Endpoints de staff → 403 (antes: leía/borraba toda la PII del negocio).
  for (const path of ['/customers', '/employees', '/invoices', '/dashboard']) {
    const r = await api(path, {}, token, businessId);
    assert.equal(r.status, 403, `${path} debería ser 403 para CLIENT, fue ${r.status}`);
  }
  // Escritura también bloqueada.
  const w = await api('/customers', { method: 'POST', body: JSON.stringify({ firstName: 'Hack' }) }, token, businessId);
  assert.equal(w.status, 403);

  // Endpoints client-scoped → 200 (sus propios datos; vacío si no tiene ficha de Customer).
  const mine = await api('/me/bookings', {}, token, businessId);
  assert.equal(mine.status, 200);
  assert.ok(Array.isArray(mine.body));
  const prof = await api('/me/profile', {}, token, businessId);
  assert.equal(prof.status, 200);
});

test('catálogo: CLIENT puede LEER servicios/productos pero NO escribir', async (t) => {
  if (!backUp) return t.skip('back down');
  const businessId = await newBusiness();
  const email = `cat_${uniq()}@test.local`;
  const user = await prisma.user.create({ data: { email, firstName: 'Cat', passwordHash: await hashPassword('cliente-pass-1'), status: 'active', emailVerifiedAt: new Date() } });
  created.userIds.add(user.id);
  await prisma.membership.create({ data: { userId: user.id, businessId, role: 'CLIENT' } });
  const login = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password: 'cliente-pass-1' }) });
  const token = login.body!.token as string;

  // Lectura de catálogo → 200.
  for (const path of ['/services', '/products', '/locations']) {
    const r = await api(path, {}, token, businessId);
    assert.equal(r.status, 200, `${path} GET debería ser 200 para CLIENT, fue ${r.status}`);
  }
  // Escritura de catálogo → 403.
  const w = await api('/services', { method: 'POST', body: JSON.stringify({ name: 'Hack', durationMin: 30, price: 0 }) }, token, businessId);
  assert.equal(w.status, 403);
});
