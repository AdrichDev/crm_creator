import { Router, type Response } from 'express';
import { prisma } from '../prisma.js';
import type { AuthedRequest } from '../middleware/types.js';
import { pickFields } from '../lib/nombre.js';

// Estados de visita configurables por negocio (RF-19). Conjunto pequeño → sin paginación.
// Los estados de sistema (esSistema) no se pueden borrar; sí editar color/icono/orden/nombre.
export const visitStatesRouter = Router();

const FIELDS = ['nombre', 'color', 'icono', 'orden', 'esPendiente'] as const;

visitStatesRouter.get('/', async (req: AuthedRequest, res: Response) => {
  const rows = await prisma.visitState.findMany({
    where: { businessId: req.businessId, eliminadoEn: null },
    orderBy: { orden: 'asc' },
  });
  res.json({ items: rows });
});

visitStatesRouter.post('/', async (req: AuthedRequest, res: Response) => {
  const data = pickFields(req.body ?? {}, FIELDS);
  if (!data.nombre) return res.status(422).json({ error: { code: 'invalid', message: 'Falta nombre' } });
  const row = await prisma.visitState.create({ data: { ...data, businessId: req.businessId } as never });
  res.status(201).json(row);
});

visitStatesRouter.patch('/:id', async (req: AuthedRequest, res: Response) => {
  const existing = await prisma.visitState.findFirst({ where: { id: req.params.id, businessId: req.businessId, eliminadoEn: null } });
  if (!existing) return res.status(404).json({ error: { code: 'not_found', message: 'No encontrado' } });
  const row = await prisma.visitState.update({ where: { id: req.params.id }, data: pickFields(req.body ?? {}, FIELDS) as never });
  res.json(row);
});

visitStatesRouter.delete('/:id', async (req: AuthedRequest, res: Response) => {
  const existing = await prisma.visitState.findFirst({ where: { id: req.params.id, businessId: req.businessId, eliminadoEn: null } });
  if (!existing) return res.status(404).json({ error: { code: 'not_found', message: 'No encontrado' } });
  if (existing.esSistema) return res.status(409).json({ error: { code: 'protected', message: 'Estado de sistema: no se puede eliminar' } });
  await prisma.visitState.update({ where: { id: req.params.id }, data: { eliminadoEn: new Date() } });
  res.status(204).end();
});
