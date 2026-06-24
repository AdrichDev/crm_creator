import { Router, type Response } from 'express';
import { prisma } from '../prisma.js';
import type { AuthedRequest } from '../middleware/types.js';
import { assertBelongsToBusiness, CrossTenantError } from '../lib/tenant.js';

export const packagesRouter = Router();

packagesRouter.get('/', async (req: AuthedRequest, res: Response) => {
  const rows = await prisma.package.findMany({ where: { businessId: req.businessId }, include: { services: true }, orderBy: { createdAt: 'desc' } });
  res.json(rows);
});

packagesRouter.post('/', async (req: AuthedRequest, res: Response) => {
  const { nombre, sesionesTotal, diasValidez = 365, precio, serviceIds = [] } = req.body ?? {};
  if (!nombre || !sesionesTotal) return res.status(422).json({ error: { code: 'validation', message: 'nombre y sesionesTotal requeridos' } });
  const row = await prisma.package.create({ data: { businessId: req.businessId!, nombre, sesionesTotal, diasValidez, precio, services: serviceIds.length ? { connect: serviceIds.map((id: string) => ({ id })) } : undefined } });
  res.status(201).json(row);
});

// Asignar un bono a un cliente.
packagesRouter.post('/assign', async (req: AuthedRequest, res: Response) => {
  const { customerId, packageId } = req.body ?? {};
  if (!customerId || !packageId) return res.status(422).json({ error: { code: 'validation', message: 'customerId y packageId requeridos' } });
  try {
    await assertBelongsToBusiness('customer', customerId, req.businessId, 'customerId');
  } catch (e) {
    if (e instanceof CrossTenantError) return res.status(422).json({ error: { code: 'cross_tenant', message: e.message } });
    throw e;
  }
  const tpl = await prisma.package.findFirst({ where: { id: packageId, businessId: req.businessId } });
  if (!tpl) return res.status(404).json({ error: { code: 'not_found', message: 'Bono no encontrado' } });
  const expiraEn = new Date(Date.now() + tpl.diasValidez * 86400000);
  const cp = await prisma.customerPackage.create({ data: { businessId: req.businessId!, customerId, packageId, sesionesTotal: tpl.sesionesTotal, expiraEn } });
  res.status(201).json(cp);
});

// Consumir una sesión manualmente (R9).
packagesRouter.post('/customer-packages/:id/consume-session', async (req: AuthedRequest, res: Response) => {
  const cp = await prisma.customerPackage.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!cp) return res.status(404).json({ error: { code: 'not_found', message: 'No encontrado' } });
  if (cp.estado !== 'ACTIVE') return res.status(409).json({ error: { code: 'inactive', message: 'Bono no activo' } });
  if (cp.sesionesUsadas >= cp.sesionesTotal) return res.status(409).json({ error: { code: 'exhausted', message: 'Bono agotado' } });
  if (cp.expiraEn && cp.expiraEn < new Date()) return res.status(409).json({ error: { code: 'expired', message: 'Bono caducado' } });
  const updated = await prisma.customerPackage.update({ where: { id: cp.id }, data: { sesionesUsadas: { increment: 1 }, sessions: { create: { bookingId: req.body?.bookingId } } } });
  res.json(updated);
});
