import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { hashPassword, verifyPassword, signToken } from '../lib/auth.js';
import { authenticate } from '../middleware/auth.js';
import type { AuthedRequest } from '../middleware/types.js';

export const authRouter = Router();

const registerSchema = z.object({
  businessName: z.string().min(1),
  vertical: z.string().default('custom'),
  email: z.string().email(),
  password: z.string().min(6),
  firstName: z.string().min(1),
  lastName: z.string().optional(),
});

// Registro: crea empresa + usuario Owner + membership + sede por defecto.
authRouter.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: { code: 'validation', message: 'Datos inválidos', details: parsed.error.flatten() } });
  const d = parsed.data;
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

authRouter.post('/login', async (req, res) => {
  const schema = z.object({ email: z.string().email(), password: z.string() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: { code: 'validation', message: 'Datos inválidos' } });
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
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
