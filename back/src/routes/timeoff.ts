import { Router, type Response } from 'express';
import { prisma } from '../prisma.js';
import { requireRole } from '../middleware/rbac.js';
import type { AuthedRequest } from '../middleware/types.js';

export const timeOffRouter = Router();

timeOffRouter.get('/', async (req: AuthedRequest, res: Response) => {
  const rows = await prisma.timeOffRequest.findMany({ where: { businessId: req.businessId }, include: { employee: true }, orderBy: { startDate: 'desc' } });
  res.json(rows);
});

timeOffRouter.post('/', async (req: AuthedRequest, res: Response) => {
  const { employeeId, type = 'VACATION', startDate, endDate, days, reason } = req.body ?? {};
  if (!employeeId || !startDate || !endDate) return res.status(422).json({ error: { code: 'validation', message: 'employeeId, startDate y endDate requeridos' } });
  const row = await prisma.timeOffRequest.create({ data: { businessId: req.businessId!, employeeId, type, startDate: new Date(startDate), endDate: new Date(endDate), days, reason, status: 'PENDING' } });
  res.status(201).json(row);
});

async function decide(req: AuthedRequest, res: Response, status: 'APPROVED' | 'REJECTED') {
  const existing = await prisma.timeOffRequest.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!existing) return res.status(404).json({ error: { code: 'not_found', message: 'No encontrado' } });
  const row = await prisma.timeOffRequest.update({ where: { id: existing.id }, data: { status, decidedBy: req.userId, decidedAt: new Date() } });
  res.json(row);
}
timeOffRouter.patch('/:id/approve', requireRole('OWNER', 'ADMIN', 'MANAGER'), (req: AuthedRequest, res) => decide(req, res, 'APPROVED'));
timeOffRouter.patch('/:id/reject', requireRole('OWNER', 'ADMIN', 'MANAGER'), (req: AuthedRequest, res) => decide(req, res, 'REJECTED'));
