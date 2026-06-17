import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { hashPassword, verifyPassword, signToken, DUMMY_PASSWORD_HASH } from '../lib/auth.js';
import { authenticate } from '../middleware/auth.js';
import type { AuthedRequest } from '../middleware/types.js';
import { validatePassword, generateAuthToken, hashToken, TOKEN_TTL_MS } from '../lib/password.js';
import { rateLimit, ipKey, ipEmailKey, resetRateLimits } from '../lib/rateLimit.js';
import { emit } from '../lib/automation/index.js';

export const authRouter = Router();

// Limiters en memoria para los endpoints sensibles (fuerza bruta / spam de email).
// H1: login usa ip:email como clave para impedir fuerza bruta por email aunque
// el atacante rote IPs. forgot/set/reset siguen por IP (protegen spam de email).
const loginLimiter = rateLimit({ bucket: 'login', windowMs: 15 * 60_000, max: 20, keyOf: ipEmailKey });
const forgotLimiter = rateLimit({ bucket: 'forgot', windowMs: 15 * 60_000, max: 5, keyOf: ipKey });
const tokenLimiter = rateLimit({ bucket: 'token', windowMs: 15 * 60_000, max: 10, keyOf: ipKey });

// Endpoint de test: reinicia los contadores del rate limiter. Solo fuera de
// producción (los tests e2e lo usan para aislarse entre ejecuciones). En
// producción NODE_ENV=production lo deja deshabilitado (404).
if (process.env.NODE_ENV !== 'production') {
  authRouter.post('/__test__/reset-rate-limits', (_req, res) => { resetRateLimits(); res.status(204).end(); });
}

const registerSchema = z.object({
  businessName: z.string().min(1),
  vertical: z.string().default('custom'),
  // Email normalizado en un único punto (trim + lowercase) para que lookup,
  // unicidad y clave de rate-limit no diverjan (blueteam MEDIA).
  email: z.string().trim().email().transform((s) => s.toLowerCase()),
  // H4: política mínima en schema para feedback rápido; validatePassword es la
  // verdad canónica (mismo mínimo que set/reset/change-password).
  password: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().optional(),
});

// Registro: crea empresa + usuario Owner + membership + sede por defecto.
authRouter.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: { code: 'validation', message: 'Datos inválidos', details: parsed.error.flatten() } });
  const d = parsed.data;
  // H4: política de contraseña coherente con set/reset/change-password.
  if (validatePassword(d.password)) return res.status(422).json({ error: { code: 'weak_password', message: 'La contraseña no cumple la política (mínimo 12 caracteres, con al menos una letra y un número)' } });
  const exists = await prisma.user.findUnique({ where: { email: d.email } });
  if (exists) return res.status(409).json({ error: { code: 'email_taken', message: 'Email ya registrado' } });

  const result = await prisma.$transaction(async (tx) => {
    const business = await tx.business.create({ data: { name: d.businessName, vertical: d.vertical } });
    await tx.location.create({ data: { businessId: business.id, name: d.businessName } });
    const user = await tx.user.create({ data: { email: d.email, passwordHash: await hashPassword(d.password), firstName: d.firstName, lastName: d.lastName } });
    await tx.membership.create({ data: { userId: user.id, businessId: business.id, role: 'OWNER' } });
    return { business, user };
  });

  const token = signToken({ userId: result.user.id });
  res.status(201).json({ token, user: { id: result.user.id, email: d.email, firstName: d.firstName }, business: result.business });
});

authRouter.post('/login', loginLimiter, async (req, res) => {
  const schema = z.object({ email: z.string().trim().email().transform((s) => s.toLowerCase()), password: z.string() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: { code: 'validation', message: 'Datos inválidos' } });
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  // Siempre pagamos un bcrypt.compare (contra un hash dummy si el usuario no
  // existe) para igualar el tiempo de respuesta → sin oráculo de enumeración.
  const passwordOk = await verifyPassword(parsed.data.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!user || !passwordOk) {
    return res.status(401).json({ error: { code: 'bad_credentials', message: 'Credenciales incorrectas' } });
  }
  const memberships = await prisma.membership.findMany({ where: { userId: user.id } });
  res.json({ token: signToken({ userId: user.id }), user: { id: user.id, email: user.email, firstName: user.firstName }, memberships });
});

authRouter.get('/me', authenticate, async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  const memberships = await prisma.membership.findMany({ where: { userId: req.userId } });
  res.json({ user: user && { id: user.id, email: user.email, firstName: user.firstName }, memberships, activeBusinessId: req.businessId, role: req.role });
});

// ---------------------------------------------------------------------------
// Credenciales: fijar contraseña (invitación o reset), cambiar, recuperar.
// Política de password centralizada en lib/password.ts. Tokens hasheados,
// un solo uso, expiración. Cambiar password sella passwordChangedAt → invalida
// los JWT previos (ver middleware/auth.ts).
// ---------------------------------------------------------------------------

const setPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string(),
  repeatPassword: z.string(),
});

/** Consume un token (invite|reset) y fija la nueva contraseña. Sella todo en una transacción. */
async function consumeTokenAndSetPassword(plainToken: string, newPassword: string): Promise<'ok' | 'invalid_token'> {
  const tokenHash = hashToken(plainToken);
  const record = await prisma.authToken.findFirst({
    where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, userId: true },
  });
  if (!record) return 'invalid_token';
  const passwordHash = await hashPassword(newPassword);
  const now = new Date();
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash, status: 'active', passwordChangedAt: now } }),
    prisma.authToken.update({ where: { id: record.id }, data: { usedAt: now } }),
    // Invalida CUALQUIER otro token abierto del usuario (invite o reset).
    prisma.authToken.updateMany({ where: { userId: record.userId, usedAt: null }, data: { usedAt: now } }),
  ]);
  return 'ok';
}

// POST /auth/set-password — alta: el invitado fija su primera contraseña vía token.
authRouter.post('/set-password', tokenLimiter, async (req, res) => {
  const parsed = setPasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: { code: 'validation', message: 'Datos inválidos' } });
  const { token, newPassword, repeatPassword } = parsed.data;
  if (newPassword !== repeatPassword) return res.status(422).json({ error: { code: 'mismatch', message: 'Las contraseñas no coinciden' } });
  if (validatePassword(newPassword)) return res.status(422).json({ error: { code: 'weak_password', message: 'La contraseña no cumple la política (mínimo 12 caracteres, con al menos una letra y un número)' } });
  const result = await consumeTokenAndSetPassword(token, newPassword);
  if (result === 'invalid_token') return res.status(400).json({ error: { code: 'invalid_token', message: 'Enlace inválido o caducado' } });
  res.status(204).end();
});

// POST /auth/reset-password — restablecer con token de "olvidé mi contraseña".
authRouter.post('/reset-password', tokenLimiter, async (req, res) => {
  const parsed = setPasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: { code: 'validation', message: 'Datos inválidos' } });
  const { token, newPassword, repeatPassword } = parsed.data;
  if (newPassword !== repeatPassword) return res.status(422).json({ error: { code: 'mismatch', message: 'Las contraseñas no coinciden' } });
  if (validatePassword(newPassword)) return res.status(422).json({ error: { code: 'weak_password', message: 'La contraseña no cumple la política (mínimo 12 caracteres, con al menos una letra y un número)' } });
  const result = await consumeTokenAndSetPassword(token, newPassword);
  if (result === 'invalid_token') return res.status(400).json({ error: { code: 'invalid_token', message: 'Enlace inválido o caducado' } });
  res.status(204).end();
});

// POST /auth/forgot-password — respuesta SIEMPRE neutra (no revela si el email existe).
authRouter.post('/forgot-password', forgotLimiter, async (req, res) => {
  const parsed = z.object({ email: z.string().email() }).safeParse(req.body);
  // Incluso un email mal formado recibe la misma respuesta neutra.
  if (parsed.success) {
    const email = parsed.data.email.toLowerCase();
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, firstName: true, status: true, memberships: { select: { businessId: true }, take: 1 } } });
    if (user && user.status !== 'disabled') {
      const { token, tokenHash } = generateAuthToken();
      const expiresAt = new Date(Date.now() + TOKEN_TTL_MS.reset);
      // Invalida resets previos sin usar antes de emitir uno nuevo.
      await prisma.authToken.updateMany({ where: { userId: user.id, purpose: 'reset', usedAt: null }, data: { usedAt: new Date() } });
      await prisma.authToken.create({ data: { userId: user.id, tokenHash, purpose: 'reset', expiresAt } });
      // Fire-and-forget: no se espera a n8n (no ramificar timing de forma observable).
      void emit('password.reset_requested', {
        userId: user.id,
        email: user.email,
        firstName: user.firstName,
        resetUrl: `${process.env.FRONT_URL ?? 'http://localhost:3002'}/reset-password?token=${token}`,
        expiresAt: expiresAt.toISOString(),
      }, { businessId: user.memberships[0]?.businessId ?? 'unknown' });
    }
  }
  res.status(200).json({ message: 'Si el email existe, enviaremos instrucciones' });
});

// POST /auth/change-password — usuario logueado: antigua + nueva + repetir.
const changeSchema = z.object({
  oldPassword: z.string(),
  newPassword: z.string(),
  repeatPassword: z.string(),
});
authRouter.post('/change-password', authenticate, async (req: AuthedRequest, res) => {
  const parsed = changeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: { code: 'validation', message: 'Datos inválidos' } });
  const { oldPassword, newPassword, repeatPassword } = parsed.data;
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(404).json({ error: { code: 'not_found', message: 'Usuario no encontrado' } });
  if (!(await verifyPassword(oldPassword, user.passwordHash))) {
    return res.status(401).json({ error: { code: 'bad_credentials', message: 'Contraseña actual incorrecta' } });
  }
  if (newPassword !== repeatPassword) return res.status(422).json({ error: { code: 'mismatch', message: 'Las contraseñas no coinciden' } });
  if (validatePassword(newPassword)) return res.status(422).json({ error: { code: 'weak_password', message: 'La contraseña no cumple la política (mínimo 12 caracteres, con al menos una letra y un número)' } });
  if (newPassword === oldPassword) return res.status(422).json({ error: { code: 'same_password', message: 'La nueva contraseña debe ser distinta de la actual' } });
  const now = new Date();
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword), passwordChangedAt: now } }),
    prisma.authToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } }),
  ]);
  res.status(204).end();
});
