// E2E sobre el back en marcha (localhost:4001) con la BD de desarrollo.
// Cubre las correcciones de seguridad del devil: invitación (sin password en
// claro), token un-solo-uso/expiración, no fuga de passwordHash, forgot neutro,
// rate limit, invalidación de sesión al cambiar password.
//
// Requiere el back levantado (npm run dev). Si no responde, los tests se saltan.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { hashToken } from '../../lib/password.js';

const BASE = process.env.TEST_API_URL ?? 'http://localhost:4001';
const prisma = new PrismaClient();

let backUp = false;
const uniq = () => crypto.randomBytes(4).toString('hex');

// Datos creados para limpiar al final.
const created = { businessIds: new Set<string>(), userIds: new Set<string>() };

async function api(path: string, init: RequestInit = {}, token?: string, businessId?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init.headers as Record<string, string>) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (businessId) headers['x-business-id'] = businessId;
  const res = await fetch(`${BASE}/api${path}`, { ...init, headers });
  const text = await res.text();
  let body: unknown = undefined;
  try { body = text ? JSON.parse(text) : undefined; } catch { body = text; }
  return { status: res.status, body: body as Record<string, unknown> | undefined };
}

/** Crea un admin/owner nuevo vía /register y devuelve su sesión. */
async function newAdmin() {
  const email = `admin_${uniq()}@test.local`;
  const r = await api('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ businessName: `Biz ${uniq()}`, email, password: 'admin-pass-123', firstName: 'Admin' }),
  });
  assert.equal(r.status, 201, `register falló: ${JSON.stringify(r.body)}`);
  const token = r.body!.token as string;
  const businessId = (r.body!.business as { id: string }).id;
  const userId = (r.body!.user as { id: string }).id;
  created.businessIds.add(businessId);
  created.userIds.add(userId);
  return { email, token, businessId, userId };
}

before(async () => {
  try {
    const res = await fetch(`${BASE}/health`);
    backUp = res.ok;
  } catch { backUp = false; }
  if (!backUp) { console.warn(`[e2e] back no responde en ${BASE} — tests saltados`); return; }
  // Aísla esta ejecución: reinicia los contadores del rate limiter del server
  // (en memoria, persisten entre ejecuciones dentro de la misma ventana de 15 min).
  await fetch(`${BASE}/api/auth/__test__/reset-rate-limits`, { method: 'POST' }).catch(() => {});
});

after(async () => {
  // Limpieza: borra los usuarios y negocios de prueba (cascade limpia tokens/membership).
  for (const id of created.userIds) await prisma.user.delete({ where: { id } }).catch(() => {});
  for (const id of created.businessIds) await prisma.business.delete({ where: { id } }).catch(() => {});
  await prisma.$disconnect();
});

test('admin crea usuario por invitación: sin password en claro, status invited', async (t) => {
  if (!backUp) return t.skip('back down');
  const admin = await newAdmin();
  const email = `inv_${uniq()}@test.local`;
  const r = await api('/users', { method: 'POST', body: JSON.stringify({ email, firstName: 'Nuevo', role: 'EMPLOYEE' }) }, admin.token, admin.businessId);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  created.userIds.add(r.body!.id as string);
  // La respuesta NO trae passwordHash ni password en claro.
  assert.ok(!('passwordHash' in r.body!));
  assert.ok(!('password' in r.body!));
  assert.ok(!('plainPassword' in r.body!));
  // El usuario queda 'invited' con passwordHash placeholder no usable.
  const db = await prisma.user.findUnique({ where: { id: r.body!.id as string }, select: { status: true, passwordHash: true } });
  assert.equal(db!.status, 'invited');
  assert.equal(db!.passwordHash, '!');
});

test('GET /users nunca devuelve passwordHash', async (t) => {
  if (!backUp) return t.skip('back down');
  const admin = await newAdmin();
  await api('/users', { method: 'POST', body: JSON.stringify({ email: `l_${uniq()}@test.local`, firstName: 'L', role: 'EMPLOYEE' }) }, admin.token, admin.businessId);
  const r = await api('/users', {}, admin.token, admin.businessId);
  assert.equal(r.status, 200);
  const list = r.body as unknown as Record<string, unknown>[];
  assert.ok(Array.isArray(list) && list.length >= 1);
  for (const u of list) assert.ok(!('passwordHash' in u), 'passwordHash filtrado en lista');
  for (const u of list) created.userIds.add(u.id as string);
});

test('set-password con token válido funciona y es de un solo uso', async (t) => {
  if (!backUp) return t.skip('back down');
  const admin = await newAdmin();
  const email = `sp_${uniq()}@test.local`;
  const c = await api('/users', { method: 'POST', body: JSON.stringify({ email, firstName: 'SP', role: 'EMPLOYEE' }) }, admin.token, admin.businessId);
  const userId = c.body!.id as string;
  created.userIds.add(userId);

  // El token en claro no se devuelve por API: se fabrica uno y se inyecta su hash
  // directamente en BD para simular el enlace del email (mismo mecanismo).
  const plain = crypto.randomBytes(32).toString('base64url');
  await prisma.authToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } });
  await prisma.authToken.create({ data: { userId, tokenHash: hashToken(plain), purpose: 'invite', expiresAt: new Date(Date.now() + 60_000) } });

  const set = await api('/auth/set-password', { method: 'POST', body: JSON.stringify({ token: plain, newPassword: 'nueva-pass-1', repeatPassword: 'nueva-pass-1' }) });
  assert.equal(set.status, 204);
  // Segundo uso del mismo token → 400 invalid_token.
  const reuse = await api('/auth/set-password', { method: 'POST', body: JSON.stringify({ token: plain, newPassword: 'otra-pass-22', repeatPassword: 'otra-pass-22' }) });
  assert.equal(reuse.status, 400);
  // Ahora puede loguear con la nueva contraseña.
  const login = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password: 'nueva-pass-1' }) });
  assert.equal(login.status, 200);
});

test('token expirado no sirve', async (t) => {
  if (!backUp) return t.skip('back down');
  const admin = await newAdmin();
  const email = `exp_${uniq()}@test.local`;
  const c = await api('/users', { method: 'POST', body: JSON.stringify({ email, firstName: 'EX', role: 'EMPLOYEE' }) }, admin.token, admin.businessId);
  const userId = c.body!.id as string;
  created.userIds.add(userId);
  const plain = crypto.randomBytes(32).toString('base64url');
  await prisma.authToken.create({ data: { userId, tokenHash: hashToken(plain), purpose: 'invite', expiresAt: new Date(Date.now() - 1000) } });
  const set = await api('/auth/set-password', { method: 'POST', body: JSON.stringify({ token: plain, newPassword: 'nueva-pass-1', repeatPassword: 'nueva-pass-1' }) });
  assert.equal(set.status, 400);
});

test('forgot-password responde neutro exista o no el email', async (t) => {
  if (!backUp) return t.skip('back down');
  const admin = await newAdmin();
  const r1 = await api('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: admin.email }) });
  const r2 = await api('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: `ghost_${uniq()}@test.local` }) });
  assert.equal(r1.status, 200);
  assert.equal(r2.status, 200);
  assert.deepEqual(r1.body, r2.body);
});

test('reset-password invalida los demás tokens del usuario', async (t) => {
  if (!backUp) return t.skip('back down');
  const admin = await newAdmin();
  // Dos tokens reset abiertos.
  const t1 = crypto.randomBytes(32).toString('base64url');
  const t2 = crypto.randomBytes(32).toString('base64url');
  await prisma.authToken.create({ data: { userId: admin.userId, tokenHash: hashToken(t1), purpose: 'reset', expiresAt: new Date(Date.now() + 60_000) } });
  await prisma.authToken.create({ data: { userId: admin.userId, tokenHash: hashToken(t2), purpose: 'reset', expiresAt: new Date(Date.now() + 60_000) } });
  const reset = await api('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token: t1, newPassword: 'reset-pass-9', repeatPassword: 'reset-pass-9' }) });
  assert.equal(reset.status, 204);
  // El segundo token quedó invalidado.
  const second = await api('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token: t2, newPassword: 'reset-pass-x', repeatPassword: 'reset-pass-x' }) });
  assert.equal(second.status, 400);
});

test('cambiar password invalida los JWT previos (sesión)', async (t) => {
  if (!backUp) return t.skip('back down');
  const admin = await newAdmin();
  // Token viejo válido ahora.
  const me1 = await api('/auth/me', {}, admin.token, admin.businessId);
  assert.equal(me1.status, 200);
  // Espera >1s para que el JWT viejo quede en un segundo anterior al cambio
  // (el `iat` de JWT tiene granularidad de segundo).
  await new Promise((r) => setTimeout(r, 1100));
  // Cambia la contraseña.
  const ch = await api('/auth/change-password', { method: 'POST', body: JSON.stringify({ oldPassword: 'admin-pass-123', newPassword: 'admin-pass-456', repeatPassword: 'admin-pass-456' }) }, admin.token, admin.businessId);
  assert.equal(ch.status, 204, JSON.stringify(ch.body));
  // El JWT viejo (emitido antes del cambio) ya no vale.
  const me2 = await api('/auth/me', {}, admin.token, admin.businessId);
  assert.equal(me2.status, 401);
});

test('change-password rechaza contraseña antigua incorrecta', async (t) => {
  if (!backUp) return t.skip('back down');
  const admin = await newAdmin();
  const ch = await api('/auth/change-password', { method: 'POST', body: JSON.stringify({ oldPassword: 'mal', newPassword: 'admin-pass-456', repeatPassword: 'admin-pass-456' }) }, admin.token, admin.businessId);
  assert.equal(ch.status, 401);
});

test('crear usuario con email ya miembro del mismo negocio → 409', async (t) => {
  if (!backUp) return t.skip('back down');
  const admin = await newAdmin();
  const email = `dup_${uniq()}@test.local`;
  const a = await api('/users', { method: 'POST', body: JSON.stringify({ email, firstName: 'D', role: 'EMPLOYEE' }) }, admin.token, admin.businessId);
  created.userIds.add(a.body!.id as string);
  const b = await api('/users', { method: 'POST', body: JSON.stringify({ email, firstName: 'D', role: 'EMPLOYEE' }) }, admin.token, admin.businessId);
  assert.equal(b.status, 409);
});

test('email de otro negocio se enlaza sin tocar credenciales (linked, sin invitación)', async (t) => {
  if (!backUp) return t.skip('back down');
  const a = await newAdmin();
  const b = await newAdmin();
  // El admin de B intenta "crear" al admin de A por su email → se enlaza membership.
  const r = await api('/users', { method: 'POST', body: JSON.stringify({ email: a.email, firstName: 'X', role: 'EMPLOYEE' }) }, b.token, b.businessId);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body!.linked, true);
  assert.equal(r.body!.emailSent, false);
  // La cuenta de A sigue activa y su passwordHash intacto (no se reseteó).
  const login = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: a.email, password: 'admin-pass-123' }) });
  assert.equal(login.status, 200);
});

test('un trabajador no puede gestionar usuarios (RBAC)', async (t) => {
  if (!backUp) return t.skip('back down');
  const admin = await newAdmin();
  const email = `emp_${uniq()}@test.local`;
  const c = await api('/users', { method: 'POST', body: JSON.stringify({ email, firstName: 'Emp', role: 'EMPLOYEE' }) }, admin.token, admin.businessId);
  const userId = c.body!.id as string;
  created.userIds.add(userId);
  // Fija password al empleado y loguea.
  const plain = crypto.randomBytes(32).toString('base64url');
  await prisma.authToken.create({ data: { userId, tokenHash: hashToken(plain), purpose: 'invite', expiresAt: new Date(Date.now() + 60_000) } });
  await api('/auth/set-password', { method: 'POST', body: JSON.stringify({ token: plain, newPassword: 'emp-pass-123', repeatPassword: 'emp-pass-123' }) });
  const login = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password: 'emp-pass-123' }) });
  const empToken = login.body!.token as string;
  // El empleado intenta listar usuarios → 403.
  const r = await api('/users', {}, empToken, admin.businessId);
  assert.equal(r.status, 403);
});

test('rate limit en forgot-password (max 5 / ventana)', async (t) => {
  if (!backUp) return t.skip('back down');
  // 6ª petición desde la misma IP debe dar 429. Limiter es por IP de proceso.
  let got429 = false;
  for (let i = 0; i < 8; i++) {
    const r = await api('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: `rl_${uniq()}@test.local` }) });
    if (r.status === 429) { got429 = true; break; }
  }
  assert.ok(got429, 'esperaba un 429 tras superar el límite de forgot-password');
});
