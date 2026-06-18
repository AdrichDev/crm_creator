import { Router, type Response } from 'express';
import { z } from 'zod';
import type { MemberRole } from '@prisma/client';
import { prisma } from '../prisma.js';
import { requireRole } from '../middleware/rbac.js';
import type { AuthedRequest } from '../middleware/types.js';
import { supabaseAdmin } from '../lib/auth.js';

export const usersRouter = Router();

// Mounted after `authenticate` global (req.userId/businessId/role already resolved).
// All /users endpoints require OWNER or ADMIN role on the active business.
usersRouter.use(requireRole('OWNER', 'ADMIN'));

// Explicit field selection — NEVER include passwordHash (removed from schema).
const USER_PUBLIC = { id: true, email: true, firstName: true, lastName: true, createdAt: true } as const;

const ADMIN_ROLES: MemberRole[] = ['OWNER', 'ADMIN'];

const assignableRole = z.enum(['ADMIN', 'EMPLOYEE']);

interface UserRow { id: string; email: string; firstName: string; lastName: string | null; createdAt: Date; }

/**
 * Sends a Supabase invite email via inviteUserByEmail.
 * If the user already exists in auth.users, Supabase may return an error or resend.
 * Returns { sent: boolean, alreadyExists: boolean }.
 */
async function sendInvite(
  email: string,
  businessId: string,
  role: string,
  firstName?: string,
): Promise<{ sent: boolean; alreadyExists: boolean }> {
  // Branding del tenant en metadata -> email de invitación personalizado por negocio
  // (plantilla Supabase usa {{ .Data.businessName }} / {{ .Data.brandPrimary }}).
  const biz = await prisma.business.findUnique({ where: { id: businessId }, select: { name: true, brandPrimary: true, logoUrl: true } });
  const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    data: { businessId, role, firstName, businessName: biz?.name, brandPrimary: biz?.brandPrimary, logoUrl: biz?.logoUrl ?? undefined },
  });
  if (!error) return { sent: true, alreadyExists: false };
  // Supabase returns a 422 / "User already registered" when email exists.
  const msg = error.message?.toLowerCase() ?? '';
  const alreadyExists = msg.includes('already registered') || msg.includes('already been invited') || error.code === 'email_exists';
  return { sent: false, alreadyExists };
}

// GET /users — list users with membership in the active business.
usersRouter.get('/', async (req: AuthedRequest, res: Response) => {
  const memberships = await prisma.membership.findMany({
    where: { businessId: req.businessId },
    select: { role: true, user: { select: USER_PUBLIC } },
    orderBy: { createdAt: 'asc' },
  });
  res.json(memberships.map((m) => ({ ...(m.user as UserRow), role: m.role })));
});

// POST /users — invite a user to the active business via Supabase inviteUserByEmail.
const createSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().optional(),
  role: assignableRole,
});

usersRouter.post('/', async (req: AuthedRequest, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({ error: { code: 'validation', message: 'Datos inválidos', details: parsed.error.flatten() } });
  }
  const d = parsed.data;
  const businessId = req.businessId!;
  const email = d.email.toLowerCase();

  // Check if this email is already a member of THIS business.
  const existingMembership = await prisma.membership.findFirst({
    where: { businessId, user: { email } },
    select: { id: true },
  });
  if (existingMembership) {
    return res.status(409).json({ error: { code: 'email_taken', message: 'Ese email ya es miembro de este negocio' } });
  }

  // Case A: user already exists in crm.User (has a UUID from auth.users).
  const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, firstName: true } });
  if (existingUser) {
    // Link the account by creating a Membership — no re-invite needed.
    await prisma.membership.create({ data: { userId: existingUser.id, businessId, role: d.role } });
    return res.status(201).json({
      id: existingUser.id, email: existingUser.email, firstName: existingUser.firstName,
      role: d.role, linked: true, emailSent: false,
    });
  }

  // Case B: new user — send Supabase invite.
  const { sent, alreadyExists } = await sendInvite(email, businessId, d.role, d.firstName);

  if (alreadyExists) {
    // Q-B resolution: existing Supabase user not yet in crm.User — upsert crm.User + Membership.
    // We can't get the UUID from inviteUserByEmail on error; look them up via listUsers.
    const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
    const found = listData?.users?.find((u) => u.email?.toLowerCase() === email);
    if (found) {
      await prisma.user.upsert({
        where: { id: found.id },
        create: { id: found.id, email, firstName: d.firstName, lastName: d.lastName },
        update: {},
      });
      await prisma.membership.upsert({
        where: { userId_businessId: { userId: found.id, businessId } },
        create: { userId: found.id, businessId, role: d.role },
        update: { role: d.role },
      });
      return res.status(201).json({
        id: found.id, email, firstName: d.firstName, role: d.role, linked: true, emailSent: false,
      });
    }
    // Could not resolve — surface 409.
    return res.status(409).json({ error: { code: 'user_exists', message: 'El usuario ya existe en Supabase. El email ya fue invitado.' } });
  }

  // Invite sent — crm.User will be created when the user accepts the invite
  // and first authenticates (their UUID from auth.users will be populated then).
  // We create a placeholder crm.User row when the invite is accepted on the front.
  res.status(201).json({ email, firstName: d.firstName, role: d.role, emailSent: sent });
});

/** Resolves the membership for :id in the active business, or responds 404. */
async function loadMember(req: AuthedRequest, res: Response) {
  const membership = await prisma.membership.findFirst({
    where: { userId: req.params.id, businessId: req.businessId },
    select: { id: true, role: true, user: { select: { id: true, email: true, firstName: true } } },
  });
  if (!membership) {
    res.status(404).json({ error: { code: 'not_found', message: 'Usuario no encontrado en este negocio' } });
    return null;
  }
  return membership;
}

// PATCH /users/:id — change role within the active business.
const patchSchema = z.object({
  role: assignableRole.optional(),
});

usersRouter.patch('/:id', async (req: AuthedRequest, res: Response) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({ error: { code: 'validation', message: 'Datos inválidos', details: parsed.error.flatten() } });
  }
  const member = await loadMember(req, res);
  if (!member) return;
  if (member.role === 'OWNER') {
    return res.status(403).json({ error: { code: 'owner_protected', message: 'No se puede editar al propietario' } });
  }

  const { role } = parsed.data;
  if (role && role !== 'ADMIN' && ADMIN_ROLES.includes(member.role)) {
    const admins = await prisma.membership.count({ where: { businessId: req.businessId, role: { in: ADMIN_ROLES } } });
    if (admins <= 1) {
      return res.status(409).json({ error: { code: 'last_admin', message: 'No puedes dejar el negocio sin administradores' } });
    }
  }

  if (role) await prisma.membership.update({ where: { id: member.id }, data: { role } });

  const updated = await prisma.membership.findFirst({
    where: { id: member.id },
    select: { role: true, user: { select: USER_PUBLIC } },
  });
  res.json({ ...(updated!.user as UserRow), role: updated!.role });
});

// DELETE /users/:id — removes the membership from the active business.
usersRouter.delete('/:id', async (req: AuthedRequest, res: Response) => {
  const member = await loadMember(req, res);
  if (!member) return;
  if (member.role === 'OWNER') {
    return res.status(403).json({ error: { code: 'owner_protected', message: 'No se puede eliminar al propietario' } });
  }
  if (member.user.id === req.userId) {
    return res.status(403).json({ error: { code: 'self_delete', message: 'No puedes eliminarte a ti mismo' } });
  }

  if (ADMIN_ROLES.includes(member.role)) {
    const admins = await prisma.membership.count({ where: { businessId: req.businessId, role: { in: ADMIN_ROLES } } });
    if (admins <= 1) {
      return res.status(409).json({ error: { code: 'last_admin', message: 'No puedes dejar el negocio sin administradores' } });
    }
  }

  const otherMemberships = await prisma.membership.count({ where: { userId: member.user.id, businessId: { not: req.businessId } } });
  await prisma.membership.delete({ where: { id: member.id } });
  if (otherMemberships === 0) {
    // Also remove from Supabase auth.users if there are no other memberships.
    await supabaseAdmin.auth.admin.deleteUser(member.user.id);
  }
  res.status(204).end();
});

// POST /users/:id/resend-invite — resends the Supabase invite to an uninvited user.
usersRouter.post('/:id/resend-invite', async (req: AuthedRequest, res: Response) => {
  const member = await loadMember(req, res);
  if (!member) return;
  const { sent, alreadyExists: _ } = await sendInvite(member.user.email, req.businessId!, member.role, member.user.firstName);
  res.json({ emailSent: sent });
});
