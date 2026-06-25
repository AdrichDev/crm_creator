import { Router } from 'express';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { prisma } from '../prisma.js';
import { supabaseAdmin } from '../lib/auth.js';
import { env } from '../env.js';
import { authenticate } from '../middleware/auth.js';
import type { AuthedRequest } from '../middleware/types.js';
import { rateLimit, ipKey, ipEmailKey, resetRateLimits } from '../lib/rateLimit.js';
import { validatePassword } from '../lib/password.js';
import { loadActiveBusiness } from '../lib/business.js';

export const authRouter = Router();

// ---------------------------------------------------------------------------
// Rate limiters — same buckets as before; kept to protect Supabase API quota.
// ---------------------------------------------------------------------------
const loginLimiter = rateLimit({ bucket: 'login', windowMs: 15 * 60_000, max: 20, keyOf: ipEmailKey });
const forgotLimiter = rateLimit({ bucket: 'forgot', windowMs: 15 * 60_000, max: 5, keyOf: ipKey });
const tokenLimiter = rateLimit({ bucket: 'token', windowMs: 15 * 60_000, max: 10, keyOf: ipKey });
const registerLimiter = rateLimit({ bucket: 'register', windowMs: 15 * 60_000, max: 5, keyOf: ipKey });
// Protege el cambio de contraseña: cada intento verifica la antigua contra GoTrue
// (signInWithPassword). Limita el brute-force de la contraseña actual.
const changePwLimiter = rateLimit({ bucket: 'changepw', windowMs: 15 * 60_000, max: 10, keyOf: ipKey });

// Test-only endpoint to reset in-memory rate-limit counters (excluded from prod).
if (process.env.NODE_ENV !== 'production') {
  authRouter.post('/__test__/reset-rate-limits', (_req, res) => { resetRateLimits(); res.status(204).end(); });
}

// ---------------------------------------------------------------------------
// POST /auth/register
// Creates a Supabase auth.users entry + crm.User profile + Business + Membership.
// The user is immediately confirmed (email_confirm: true) because register is
// owner self-service — they supply a real password and are trusted.
// ---------------------------------------------------------------------------
const registerSchema = z.object({
  businessName: z.string().min(1),
  vertical: z.string().default('custom'),
  email: z.string().trim().email().transform((s) => s.toLowerCase()),
  password: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().optional(),
});

authRouter.post('/register', registerLimiter, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({ error: { code: 'validation', message: 'Datos inválidos', details: parsed.error.flatten() } });
  }
  const d = parsed.data;
  const pwError = validatePassword(d.password);
  if (pwError) {
    return res.status(422).json({ error: { code: 'weak_password', message: 'La contraseña no cumple la política (mínimo 12 caracteres, con mayúscula, minúscula, número y símbolo especial)' } });
  }

  // Create the auth.users entry first. Branding del tenant en user_metadata para que
  // las plantillas de email de Supabase ({{ .Data.* }}) salgan personalizadas por negocio.
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: d.email,
    password: d.password,
    email_confirm: true,
    user_metadata: { firstName: d.firstName, businessName: d.businessName, brandPrimary: '#1b431c' },
  });
  if (authError) {
    if (authError.message?.toLowerCase().includes('already registered') || authError.code === 'email_exists') {
      return res.status(409).json({ error: { code: 'email_taken', message: 'Email ya registrado' } });
    }
    return res.status(500).json({ error: { code: 'supabase_error', message: authError.message } });
  }

  const supabaseUserId = authData.user.id;

  // Create business + location + crm.User profile + membership in a single tx.
  // SAGA: auth.users was already created in Supabase (a separate system, no shared
  // transaction). If the DB tx fails we must COMPENSATE by deleting that auth user,
  // otherwise the email is orphaned (auth row exists, no profile) and blocked forever.
  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      const business = await tx.business.create({ data: { nombre: d.businessName, vertical: d.vertical } });
      await tx.location.create({ data: { businessId: business.id, nombre: d.businessName } });
      // crm.User.id = auth.users.id (UUID from Supabase).
      const user = await tx.user.create({
        data: {
          id: supabaseUserId,
          email: d.email,
          firstName: d.firstName,
          lastName: d.lastName,
        },
      });
      await tx.membership.create({ data: { userId: user.id, businessId: business.id, role: 'OWNER' } });
      return { business, user };
    });
  } catch {
    await supabaseAdmin.auth.admin.deleteUser(supabaseUserId).catch(() => { /* best-effort compensation */ });
    return res.status(500).json({ error: { code: 'register_failed', message: 'No se pudo crear la cuenta, inténtalo de nuevo' } });
  }

  res.status(201).json({
    user: { id: result.user.id, email: d.email, firstName: d.firstName },
    business: result.business,
  });
});

// ---------------------------------------------------------------------------
// POST /auth/login
// The front uses Supabase SDK signInWithPassword directly.
// This endpoint is a stub returning 410 Gone to signal the migration.
// The front must call supabaseClient.auth.signInWithPassword({ email, password }).
// ---------------------------------------------------------------------------
authRouter.post('/login', loginLimiter, (_req, res) => {
  res.status(410).json({
    error: {
      code: 'login_moved',
      message: 'Login is now handled by the Supabase client SDK. Call signInWithPassword() on the front end.',
    },
  });
});

// ---------------------------------------------------------------------------
// GET /auth/me
// Returns the crm.User profile and memberships for the authenticated user.
// ---------------------------------------------------------------------------
authRouter.get('/me', authenticate, async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  const memberships = await prisma.membership.findMany({ where: { userId: req.userId } });
  // Config del negocio activo (la fuente de verdad del front: nombre, vertical,
  // branding). El front la usa para construir su TenantConfig — sin mocks locales.
  const business = await loadActiveBusiness(req.businessId);
  res.json({
    user: user && { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, phone: user.phone },
    memberships,
    activeBusinessId: req.businessId,
    role: req.role,
    business,
  });
});

// ---------------------------------------------------------------------------
// PATCH /auth/profile
// El usuario logado edita SUS propios datos (nombre, apellido, teléfono).
// Usa req.userId de la sesión; ignora cualquier id del body (no toca a otro usuario).
// ---------------------------------------------------------------------------
const profileSchema = z.object({
  firstName: z.string().trim().min(1).optional(),
  lastName: z.string().trim().optional(),
  phone: z.string().trim().max(30).optional(),
});

authRouter.patch('/profile', authenticate, async (req: AuthedRequest, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({ error: { code: 'validation', message: 'Datos inválidos' } });
  }
  const d = parsed.data;
  if (d.firstName === undefined && d.lastName === undefined && d.phone === undefined) {
    return res.status(422).json({ error: { code: 'empty', message: 'Nada que actualizar' } });
  }
  const user = await prisma.user.update({
    where: { id: req.userId },
    data: {
      ...(d.firstName !== undefined ? { firstName: d.firstName } : {}),
      ...(d.lastName !== undefined ? { lastName: d.lastName } : {}),
      ...(d.phone !== undefined ? { phone: d.phone } : {}),
    },
  });
  res.json({ user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, phone: user.phone } });
});

// ---------------------------------------------------------------------------
// POST /auth/logout
// Sessions are managed by Supabase. The front must call supabaseClient.auth.signOut().
// This endpoint returns 200 to acknowledge the intent.
// ---------------------------------------------------------------------------
authRouter.post('/logout', (_req, res) => {
  res.status(200).json({ message: 'Call supabaseClient.auth.signOut() on the front end to complete logout.' });
});

// ---------------------------------------------------------------------------
// POST /auth/forgot-password
// Delegates to Supabase resetPasswordForEmail. Always returns 200 (anti-enumeration).
// n8n emit removed — Supabase SMTP handles the reset email.
// ---------------------------------------------------------------------------
authRouter.post('/forgot-password', forgotLimiter, async (req, res) => {
  const parsed = z.object({ email: z.string().email() }).safeParse(req.body);
  if (parsed.success) {
    const email = parsed.data.email.toLowerCase();
    // fire-and-forget: always 200 regardless of whether email exists.
    void supabaseAdmin.auth.resetPasswordForEmail(email);
  }
  res.status(200).json({ message: 'Si el email existe, enviaremos instrucciones' });
});

// ---------------------------------------------------------------------------
// POST /auth/set-password
// Called after the user clicks the invite link; token is the Supabase OTP.
// The front exchanges the OTP via verifyOtp (type: 'invite') to get a session,
// then calls this endpoint (authenticated) or updateUser directly via SDK.
// For backwards compat: accepts { token, newPassword } and uses admin API.
// ---------------------------------------------------------------------------
const setPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string(),
  repeatPassword: z.string(),
});

authRouter.post('/set-password', tokenLimiter, (req, res) => {
  const parsed = setPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({ error: { code: 'validation', message: 'Datos inválidos' } });
  }
  const { newPassword, repeatPassword } = parsed.data;
  if (newPassword !== repeatPassword) {
    return res.status(422).json({ error: { code: 'mismatch', message: 'Las contraseñas no coinciden' } });
  }
  const pwError = validatePassword(newPassword);
  if (pwError) {
    return res.status(422).json({ error: { code: 'weak_password', message: 'La contraseña no cumple la política (mínimo 12 caracteres, con mayúscula, minúscula, número y símbolo especial)' } });
  }
  // Supabase OTP tokens are opaque to the server. The front must use:
  // supabaseClient.auth.verifyOtp({ token_hash, type: 'invite' }) to get a session,
  // then supabase.auth.updateUser({ password: newPassword }).
  res.status(410).json({
    error: {
      code: 'use_sdk',
      message: 'Use supabaseClient.auth.verifyOtp({ token_hash, type: "invite" }) then updateUser({ password }).',
    },
  });
});

// ---------------------------------------------------------------------------
// POST /auth/reset-password
// Same as set-password for the reset flow. Front handles OTP via SDK.
// ---------------------------------------------------------------------------
authRouter.post('/reset-password', tokenLimiter, async (req, res) => {
  const parsed = setPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({ error: { code: 'validation', message: 'Datos inválidos' } });
  }
  const { newPassword, repeatPassword } = parsed.data;
  if (newPassword !== repeatPassword) {
    return res.status(422).json({ error: { code: 'mismatch', message: 'Las contraseñas no coinciden' } });
  }
  const pwError = validatePassword(newPassword);
  if (pwError) {
    return res.status(422).json({ error: { code: 'weak_password', message: 'La contraseña no cumple la política (mínimo 12 caracteres, con mayúscula, minúscula, número y símbolo especial)' } });
  }
  // Front must: supabaseClient.auth.verifyOtp({ token_hash, type: 'recovery' })
  // then supabase.auth.updateUser({ password: newPassword }).
  res.status(410).json({
    error: {
      code: 'use_sdk',
      message: 'Use supabaseClient.auth.verifyOtp({ token_hash, type: "recovery" }) then updateUser({ password }).',
    },
  });
});

// ---------------------------------------------------------------------------
// POST /auth/change-password
// Authenticated user changes their own password.
// Calls admin.updateUserById + admin.signOut(uid, 'others') for session invalidation.
// n8n emit removed — no password event emitted.
// ---------------------------------------------------------------------------
const changeSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string(),
  repeatPassword: z.string(),
});

authRouter.post('/change-password', changePwLimiter, authenticate, async (req: AuthedRequest, res) => {
  const parsed = changeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({ error: { code: 'validation', message: 'Datos inválidos' } });
  }
  const { oldPassword, newPassword, repeatPassword } = parsed.data;
  if (newPassword !== repeatPassword) {
    return res.status(422).json({ error: { code: 'mismatch', message: 'Las contraseñas no coinciden' } });
  }
  const pwError = validatePassword(newPassword);
  if (pwError) {
    return res.status(422).json({ error: { code: 'weak_password', message: 'La contraseña no cumple la política (mínimo 12 caracteres, con mayúscula, minúscula, número y símbolo especial)' } });
  }

  const userId = req.userId!;

  // Verificar la contraseña ACTUAL sin tocar la sesión del navegador del usuario:
  // cliente Supabase efímero (persistSession:false) → signInWithPassword. Si falla,
  // la antigua es incorrecta. No re-dispara onAuthStateChange en el cliente del front.
  const dbUser = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!dbUser?.email) {
    return res.status(404).json({ error: { code: 'no_user', message: 'Usuario no encontrado' } });
  }
  const ephemeral = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: reauthError } = await ephemeral.auth.signInWithPassword({ email: dbUser.email, password: oldPassword });
  if (reauthError) {
    return res.status(401).json({ error: { code: 'wrong_password', message: 'La contraseña actual es incorrecta' } });
  }

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: newPassword });
  if (updateError) {
    // No filtrar el detalle de Supabase al cliente (puede exponer interno). Log server-side.
    console.error('[change-password] updateUserById error:', updateError.message);
    return res.status(500).json({ error: { code: 'update_failed', message: 'No se pudo actualizar la contraseña' } });
  }

  // Invalidate all other sessions (D5 design decision). No bloquea: la contraseña ya cambió;
  // si la invalidación falla, se registra pero la operación se considera correcta.
  const { error: signOutError } = await supabaseAdmin.auth.admin.signOut(userId, 'others');
  if (signOutError) console.error('[change-password] signOut(others) error:', signOutError.message);

  res.status(204).end();
});

// ---------------------------------------------------------------------------
// POST /auth/verify-email
// Supabase GoTrue handles email verification via the confirm link.
// This endpoint is kept for legacy; front should use SDK verifyOtp.
// ---------------------------------------------------------------------------
authRouter.post('/verify-email', tokenLimiter, (_req, res) => {
  res.status(410).json({
    error: {
      code: 'use_sdk',
      message: 'Email verification is handled by Supabase. Use the confirm link from the email or supabaseClient.auth.verifyOtp.',
    },
  });
});

// ---------------------------------------------------------------------------
// POST /auth/register-client
// Auto-registration of a CLIENT user. Creates a Supabase auth.users entry
// (requires email confirmation), creates Customer + Membership(CLIENT).
// n8n emit removed — Supabase SMTP handles confirmation email.
// Q-A resolution: Customer.userId FK added to link auth.uid() → Customer row.
// ---------------------------------------------------------------------------
const registerClientSchema = z.object({
  firstName: z.string().trim().min(1),
  email: z.string().trim().email().transform((s) => s.toLowerCase()),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,30}$/),
  phone: z.string().trim().min(3).max(30),
});

authRouter.post('/register-client', registerLimiter, async (req, res) => {
  const businessId = req.header('x-business-id');
  if (!businessId) {
    return res.status(400).json({ error: { code: 'missing_business', message: 'Falta el negocio' } });
  }
  const parsed = registerClientSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({ error: { code: 'validation', message: 'Datos inválidos', details: parsed.error.flatten() } });
  }
  const d = parsed.data;
  const NEUTRAL = { message: 'Si el email es válido, te enviaremos un enlace de verificación' };

  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { id: true, nombre: true, marcaPrimario: true, logoUrl: true } });
  if (!business) {
    return res.status(400).json({ error: { code: 'invalid_business', message: 'Negocio no válido' } });
  }

  // Create the Supabase auth.users entry (email NOT auto-confirmed — user must verify).
  // Branding del tenant en metadata para el email de verificación.
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: d.email,
    email_confirm: false, // forces email verification flow
    user_metadata: { firstName: d.firstName, businessName: business.nombre, brandPrimary: business.marcaPrimario, logoUrl: business.logoUrl ?? undefined },
  });

  if (authError) {
    // If email already exists in auth.users, return the neutral message (anti-enumeration).
    if (authError.message?.toLowerCase().includes('already registered') || authError.code === 'email_exists') {
      return res.status(200).json(NEUTRAL);
    }
    return res.status(500).json({ error: { code: 'supabase_error', message: authError.message } });
  }

  const supabaseUserId = authData.user.id;

  // SAGA compensation: if the DB tx fails, delete the just-created auth.users entry
  // so the email is not orphaned (auth row without profile = blocked forever).
  try {
    await prisma.$transaction(async (tx) => {
      // Upsert crm.User (id = auth.users.id).
      const user = await tx.user.upsert({
        where: { id: supabaseUserId },
        create: { id: supabaseUserId, email: d.email, username: d.username, phone: d.phone, firstName: d.firstName },
        update: {},
      });
      // Create Customer record linked to auth.uid via Customer.userId.
      const customer = await tx.customer.create({
        data: { businessId, nombre: d.firstName, email: d.email, telefono: d.phone, userId: supabaseUserId },
      });
      await tx.membership.create({ data: { userId: user.id, businessId, role: 'CLIENT' } });
      return { user, customer };
    });
  } catch {
    await supabaseAdmin.auth.admin.deleteUser(supabaseUserId).catch(() => { /* best-effort compensation */ });
    return res.status(500).json({ error: { code: 'supabase_error', message: 'No se pudo completar el registro' } });
  }

  res.status(200).json(NEUTRAL);
});
