import { Router, type Response } from 'express';
import { prisma } from '../prisma.js';
import type { AuthedRequest } from '../middleware/types.js';

export const packagesRouter = Router();

packagesRouter.get('/', async (req: AuthedRequest, res: Response) => {
  const rows = await prisma.package.findMany({ where: { businessId: req.businessId }, include: { services: true }, orderBy: { createdAt: 'desc' } });
  res.json(rows);
});

packagesRouter.post('/', async (req: AuthedRequest, res: Response) => {
  const { name, sessionsTotal, validityDays = 365, price, serviceIds = [] } = req.body ?? {};
  if (!name || !sessionsTotal) return res.status(422).json({ error: { code: 'validation', message: 'name y sessionsTotal requeridos' } });
  const row = await prisma.package.create({ data: { businessId: req.businessId!, name, sessionsTotal, validityDays, price, services: serviceIds.length ? { connect: serviceIds.map((id: string) => ({ id })) } : undefined } });
  res.status(201).json(row);
});

// Asignar un bono a un cliente.
packagesRouter.post('/assign', async (req: AuthedRequest, res: Response) => {
  const { customerId, packageId } = req.body ?? {};
  if (!customerId || !packageId) return res.status(422).json({ error: { code: 'validation', message: 'customerId y packageId requeridos' } });
  const tpl = await prisma.package.findFirst({ where: { id: packageId, businessId: req.businessId } });
  if (!tpl) return res.status(404).json({ error: { code: 'not_found', message: 'Bono no encontrado' } });
  const expiresAt = new Date(Date.now() + tpl.validityDays * 86400000);
  const cp = await prisma.customerPackage.create({ data: { businessId: req.businessId!, customerId, packageId, sessionsTotal: tpl.sessionsTotal, expiresAt } });
  res.status(201).json(cp);
});

// Consumir una sesión manualmente (R9).
packagesRouter.post('/customer-packages/:id/consume-session', async (req: AuthedRequest, res: Response) => {
  const cp = await prisma.customerPackage.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!cp) return res.status(404).json({ error: { code: 'not_found', message: 'No encontrado' } });
  if (cp.status !== 'ACTIVE') return res.status(409).json({ error: { code: 'inactive', message: 'Bono no activo' } });
  if (cp.sessionsUsed >= cp.sessionsTotal) return res.status(409).json({ error: { code: 'exhausted', message: 'Bono agotado' } });
  if (cp.expiresAt && cp.expiresAt < new Date()) return res.status(409).json({ error: { code: 'expired', message: 'Bono caducado' } });
  const updated = await prisma.customerPackage.update({ where: { id: cp.id }, data: { sessionsUsed: { increment: 1 }, sessions: { create: { bookingId: req.body?.bookingId } } } });
  res.json(updated);
});
