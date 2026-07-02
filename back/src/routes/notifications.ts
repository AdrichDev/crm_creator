import { Router, type Response } from 'express';
import { prisma } from '../prisma.js';
import type { AuthedRequest } from '../middleware/types.js';
import { parsePagination } from '../lib/pagination.js';

// Notificaciones (Notification) de solo lectura. Las escribe el sistema (drainer
// de recordatorios / flujos de negocio), no la UI → sin POST/PATCH/DELETE.
export const notificationsRouter = Router();

notificationsRouter.get('/', async (req: AuthedRequest, res: Response) => {
  const { page, limit } = parsePagination(req.query as Record<string, unknown>);
  const { estado, tipo } = req.query as Record<string, string | undefined>;
  const where = {
    businessId: req.businessId,
    ...(estado ? { estado } : {}),
    ...(tipo ? { tipo } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
    prisma.notification.count({ where }),
  ]);
  res.json({ items, total, page, limit });
});
