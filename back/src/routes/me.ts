import { Router, type Response } from 'express';
import { prisma } from '../prisma.js';
import type { AuthedRequest } from '../middleware/types.js';

// Endpoints client-scoped: el usuario logueado (típicamente CLIENT) solo ve SUS
// propios datos. Se monta ANTES del guard staffOnly, así que es accesible a CLIENT.
export const meRouter = Router();

// Resuelve el Customer del usuario dentro del tenant activo (match por email).
// Si no hay Customer asociado, las listas salen vacías (cliente recién registrado
// sin ficha de cliente en el negocio).
async function myCustomerId(req: AuthedRequest): Promise<string | null> {
  // Robusto: por Customer.userId (FK directa a auth.users, fijada en el auto-registro).
  // Inmune a emails duplicados/cambiados/nulos.
  const byUser = await prisma.customer.findFirst({
    where: { businessId: req.businessId, userId: req.userId, eliminadoEn: null },
    select: { id: true },
  });
  if (byUser) return byUser.id;
  // Fallback SOLO migratorio: clientes antiguos creados sin userId.
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { email: true } });
  if (!user?.email) return null;
  const customer = await prisma.customer.findFirst({
    where: { businessId: req.businessId, email: user.email, eliminadoEn: null },
    select: { id: true },
  });
  return customer?.id ?? null;
}

meRouter.get('/profile', async (req: AuthedRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, email: true, firstName: true, username: true, phone: true },
  });
  res.json({ user, role: req.role, businessId: req.businessId });
});

meRouter.get('/bookings', async (req: AuthedRequest, res: Response) => {
  const cid = await myCustomerId(req);
  if (!cid) return res.json([]);
  const rows = await prisma.booking.findMany({
    where: { businessId: req.businessId, customerId: cid },
    orderBy: { startAt: 'desc' },
    include: { service: true },
  });
  res.json(rows);
});

meRouter.get('/packages', async (req: AuthedRequest, res: Response) => {
  const cid = await myCustomerId(req);
  if (!cid) return res.json([]);
  const rows = await prisma.customerPackage.findMany({
    where: { businessId: req.businessId, customerId: cid },
    include: { package: true },
  });
  res.json(rows);
});
