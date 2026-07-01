import { Router, type Response } from 'express';
import { prisma } from '../prisma.js';
import type { AuthedRequest } from '../middleware/types.js';

// Notas de cliente (RF-11). INMUTABLES (regla de negocio 6): sólo POST (crear) y GET
// (listar cronológico). Deliberadamente NO hay PATCH ni DELETE — el histórico no se
// sobrescribe ni se borra. Autor = usuario autenticado.
export const customerNotesRouter = Router();

customerNotesRouter.get('/', async (req: AuthedRequest, res: Response) => {
  const customerId = String((req.query as Record<string, unknown>).customerId ?? '');
  if (!customerId) return res.status(422).json({ error: { code: 'invalid', message: 'Falta customerId' } });
  const owner = await prisma.customer.findFirst({ where: { id: customerId, businessId: req.businessId, eliminadoEn: null } });
  if (!owner) return res.status(404).json({ error: { code: 'not_found', message: 'Cliente no encontrado' } });
  const rows = await prisma.customerNote.findMany({
    where: { businessId: req.businessId, customerId },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ items: rows });
});

customerNotesRouter.post('/', async (req: AuthedRequest, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const customerId = String(body.customerId ?? '');
  const texto = String(body.texto ?? '').trim();
  if (!customerId || !texto) return res.status(422).json({ error: { code: 'invalid', message: 'Falta customerId o texto' } });
  const owner = await prisma.customer.findFirst({ where: { id: customerId, businessId: req.businessId, eliminadoEn: null } });
  if (!owner) return res.status(404).json({ error: { code: 'not_found', message: 'Cliente no encontrado' } });
  const origen = body.origen === 'AUDIO' || body.origen === 'IMPORT' ? body.origen : 'MANUAL';
  const row = await prisma.customerNote.create({
    data: { businessId: req.businessId!, customerId, texto, origen, autorId: req.userId ?? null },
  });
  res.status(201).json(row);
});
