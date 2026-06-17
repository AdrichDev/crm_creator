import { Router, type Response } from 'express';
import { z } from 'zod';
import type { MemberRole } from '@prisma/client';
import { prisma } from '../prisma.js';
import { requireRole } from '../middleware/rbac.js';
import type { AuthedRequest } from '../middleware/types.js';
import { generateAuthToken, TOKEN_TTL_MS } from '../lib/password.js';
import { emit } from '../lib/automation/index.js';

export const usersRouter = Router();

// Se monta tras `authenticate` global (req.userId/businessId/role ya resueltos).
// Todo /users exige rol admin del negocio activo (OWNER o ADMIN).
usersRouter.use(requireRole('OWNER', 'ADMIN'));

// Selección explícita: NUNCA se devuelve passwordHash.
const USER_PUBLIC = { id: true, email: true, firstName: true, lastName: true, status: true, createdAt: true } as const;

const ADMIN_ROLES: MemberRole[] = ['OWNER', 'ADMIN'];

// Roles asignables desde la UI (no se permite crear/asignar OWNER por aquí).
const assignableRole = z.enum(['ADMIN', 'EMPLOYEE']);

interface UserRow { id: string; email: string; firstName: string; lastName: string | null; status: string; createdAt: Date; }

/** Crea token de invitación/reset para un usuario y emite el evento n8n. Fallo suave. */
async function sendInvite(
  user: { id: string; email: string; firstName: string },
  businessId: string,
  businessName: string | undefined,
): Promise<boolean> {
  const { token, tokenHash } = generateAuthToken();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS.invite);
  // Invalida invitaciones previas sin usar antes de crear la nueva (un enlace vivo a la vez).
  await prisma.authToken.updateMany({
    where: { userId: user.id, purpose: 'invite', usedAt: null },
    data: { usedAt: new Date() },
  });
  await prisma.authToken.create({ data: { userId: user.id, tokenHash, purpose: 'invite', expiresAt } });
  const result = await emit('user.invited', {
    userId: user.id,
    email: user.email,
    firstName: user.firstName,
    businessName,
    inviteUrl: `${process.env.FRONT_URL ?? 'http://localhost:3002'}/set-password?token=${token}`,
    expiresAt: expiresAt.toISOString(),
  }, { businessId });
  return result.status === 'sent' || result.status === 'skipped';
}

// GET /users — lista usuarios con membership en el negocio activo. Sin passwordHash.
usersRouter.get('/', async (req: AuthedRequest, res: Response) => {
  const memberships = await prisma.membership.findMany({
    where: { businessId: req.businessId },
    select: { role: true, user: { select: USER_PUBLIC } },
    orderBy: { createdAt: 'asc' },
  });
  res.json(memberships.map((m) => ({ ...(m.user as UserRow), role: m.role })));
});

// POST /users — crea (o enlaza) un usuario en el negocio activo + invitación.
const createSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().optional(),
  role: assignableRole,
});
usersRouter.post('/', async (req: AuthedRequest, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: { code: 'validation', message: 'Datos inválidos', details: parsed.error.flatten() } });
  const d = parsed.data;
  const businessId = req.businessId!;
  const email = d.email.toLowerCase();

  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { name: true } });
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, firstName: true, memberships: { select: { businessId: true } } },
  });

  // Caso A: el email ya pertenece a ESTE negocio → 409 (no se filtra nada cross-tenant).
  if (existing && existing.memberships.some((m) => m.businessId === businessId)) {
    return res.status(409).json({ error: { code: 'email_taken', message: 'Ese email ya es miembro de este negocio' } });
  }

  // Caso B: el email existe en OTRO negocio → se enlaza la cuenta global creando un
  // Membership para este negocio. NUNCA se tocan/leen sus credenciales ni se reenvía
  // invitación (su cuenta ya está activa en otro tenant).
  if (existing) {
    await prisma.membership.create({ data: { userId: existing.id, businessId, role: d.role } });
    return res.status(201).json({ id: existing.id, email: existing.email, firstName: existing.firstName, role: d.role, status: 'active', linked: true, emailSent: false });
  }

  // Caso C: usuario nuevo. Se crea con passwordHash placeholder no usable (nunca se
  // genera password en claro): el usuario FIJA su contraseña vía el enlace de invitación.
  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email, firstName: d.firstName, lastName: d.lastName, passwordHash: '!', status: 'invited' },
      select: { id: true, email: true, firstName: true, lastName: true, status: true, createdAt: true },
    });
    await tx.membership.create({ data: { userId: user.id, businessId, role: d.role } });
    return user;
  });

  const emailSent = await sendInvite(created, businessId, business?.name);
  res.status(201).json({ ...created, role: d.role, emailSent });
});

/** Resuelve el membership de :id en el negocio activo o responde 404. */
async function loadMember(req: AuthedRequest, res: Response) {
  const membership = await prisma.membership.findFirst({
    where: { userId: req.params.id, businessId: req.businessId },
    select: { id: true, role: true, user: { select: { id: true, email: true, firstName: true } } },
  });
  if (!membership) { res.status(404).json({ error: { code: 'not_found', message: 'Usuario no encontrado en este negocio' } }); return null; }
  return membership;
}

// PATCH /users/:id — cambia rol y/o estado dentro del negocio activo.
const patchSchema = z.object({
  role: assignableRole.optional(),
  status: z.enum(['active', 'disabled', 'invited']).optional(),
});
usersRouter.patch('/:id', async (req: AuthedRequest, res: Response) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: { code: 'validation', message: 'Datos inválidos', details: parsed.error.flatten() } });
  const member = await loadMember(req, res);
  if (!member) return;

  // No se edita a un OWNER desde aquí (es el dueño del negocio).
  if (member.role === 'OWNER') return res.status(403).json({ error: { code: 'owner_protected', message: 'No se puede editar al propietario' } });

  const { role, status } = parsed.data;

  // Guarda anti lock-out: si esta edición degrada al último admin/owner → 409.
  if (role && role !== 'ADMIN' && ADMIN_ROLES.includes(member.role)) {
    const admins = await prisma.membership.count({ where: { businessId: req.businessId, role: { in: ADMIN_ROLES } } });
    if (admins <= 1) return res.status(409).json({ error: { code: 'last_admin', message: 'No puedes dejar el negocio sin administradores' } });
  }

  if (role) await prisma.membership.update({ where: { id: member.id }, data: { role } });
  if (status) await prisma.user.update({ where: { id: member.user.id }, data: { status } });

  const updated = await prisma.membership.findFirst({
    where: { id: member.id },
    select: { role: true, user: { select: USER_PUBLIC } },
  });
  res.json({ ...(updated!.user as UserRow), role: updated!.role });
});

// DELETE /users/:id — quita el membership del negocio activo (y el User si era el último).
usersRouter.delete('/:id', async (req: AuthedRequest, res: Response) => {
  const member = await loadMember(req, res);
  if (!member) return;
  if (member.role === 'OWNER') return res.status(403).json({ error: { code: 'owner_protected', message: 'No se puede eliminar al propietario' } });
  if (member.user.id === req.userId) return res.status(403).json({ error: { code: 'self_delete', message: 'No puedes eliminarte a ti mismo' } });

  // No dejar el negocio sin administradores.
  if (ADMIN_ROLES.includes(member.role)) {
    const admins = await prisma.membership.count({ where: { businessId: req.businessId, role: { in: ADMIN_ROLES } } });
    if (admins <= 1) return res.status(409).json({ error: { code: 'last_admin', message: 'No puedes dejar el negocio sin administradores' } });
  }

  const otherMemberships = await prisma.membership.count({ where: { userId: member.user.id, businessId: { not: req.businessId } } });
  await prisma.membership.delete({ where: { id: member.id } });
  // Si no le quedan otros negocios, se borra la cuenta global (cascade limpia tokens).
  if (otherMemberships === 0) await prisma.user.delete({ where: { id: member.user.id } });
  res.status(204).end();
});

// POST /users/:id/resend-invite — reenvía la invitación (solo si sigue 'invited').
usersRouter.post('/:id/resend-invite', async (req: AuthedRequest, res: Response) => {
  const member = await loadMember(req, res);
  if (!member) return;
  const user = await prisma.user.findUnique({ where: { id: member.user.id }, select: { id: true, email: true, firstName: true, status: true } });
  if (!user || user.status !== 'invited') return res.status(409).json({ error: { code: 'not_invitable', message: 'El usuario ya tiene cuenta activa' } });
  const business = await prisma.business.findUnique({ where: { id: req.businessId }, select: { name: true } });
  const emailSent = await sendInvite(user, req.businessId!, business?.name);
  res.json({ emailSent });
});
