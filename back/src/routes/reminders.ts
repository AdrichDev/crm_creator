import { Router, type Response } from 'express';
import { prisma } from '../prisma.js';
import type { AuthedRequest } from '../middleware/types.js';
import { pickFields } from '../lib/nombre.js';

// Recordatorios de usuario ligados a cliente (RF-16). Estado pendiente/completado/cancelado.
// "Vencido" = PENDING con fechaPrevista < now → se puede filtrar con ?vencidos=1.
export const remindersRouter = Router();

const CREATE_FIELDS = ['customerId', 'titulo', 'descripcion', 'fechaPrevista'] as const;
const UPDATE_FIELDS = ['titulo', 'descripcion', 'fechaPrevista', 'estado'] as const;

remindersRouter.get('/', async (req: AuthedRequest, res: Response) => {
  const q = req.query as Record<string, unknown>;
  const where: Record<string, unknown> = { businessId: req.businessId, eliminadoEn: null };
  if (typeof q.customerId === 'string') where.customerId = q.customerId;
  if (q.estado === 'PENDING' || q.estado === 'DONE' || q.estado === 'CANCELLED') where.estado = q.estado;
  if (String(q.vencidos ?? '') === '1') {
    where.estado = 'PENDING';
    where.fechaPrevista = { lt: new Date() };
  }
  const rows = await prisma.reminder.findMany({ where, orderBy: [{ fechaPrevista: 'asc' }, { createdAt: 'desc' }] });
  res.json({ items: rows });
});

remindersRouter.post('/', async (req: AuthedRequest, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const customerId = String(body.customerId ?? '');
  const titulo = String(body.titulo ?? '').trim();
  if (!customerId || !titulo) return res.status(422).json({ error: { code: 'invalid', message: 'Falta customerId o titulo' } });
  const owner = await prisma.customer.findFirst({ where: { id: customerId, businessId: req.businessId, eliminadoEn: null } });
  if (!owner) return res.status(404).json({ error: { code: 'not_found', message: 'Cliente no encontrado' } });
  const data = pickFields(body, CREATE_FIELDS);
  if (data.fechaPrevista) data.fechaPrevista = new Date(String(data.fechaPrevista));
  const row = await prisma.reminder.create({
    data: { ...data, businessId: req.businessId!, customerId, responsableId: req.userId ?? null } as never,
  });
  res.status(201).json(row);
});

remindersRouter.patch('/:id', async (req: AuthedRequest, res: Response) => {
  const existing = await prisma.reminder.findFirst({ where: { id: req.params.id, businessId: req.businessId, eliminadoEn: null } });
  if (!existing) return res.status(404).json({ error: { code: 'not_found', message: 'No encontrado' } });
  const data = pickFields(req.body ?? {}, UPDATE_FIELDS);
  if (data.fechaPrevista) data.fechaPrevista = new Date(String(data.fechaPrevista));
  const row = await prisma.reminder.update({ where: { id: req.params.id }, data: data as never });
  res.json(row);
});

remindersRouter.delete('/:id', async (req: AuthedRequest, res: Response) => {
  const existing = await prisma.reminder.findFirst({ where: { id: req.params.id, businessId: req.businessId, eliminadoEn: null } });
  if (!existing) return res.status(404).json({ error: { code: 'not_found', message: 'No encontrado' } });
  await prisma.reminder.update({ where: { id: req.params.id }, data: { eliminadoEn: new Date() } });
  res.status(204).end();
});
