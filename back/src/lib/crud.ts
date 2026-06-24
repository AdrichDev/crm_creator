import { Router, type Response } from 'express';
import { prisma } from '../prisma.js';
import type { AuthedRequest } from '../middleware/types.js';

type Delegate = {
  findMany: (args: unknown) => Promise<unknown[]>;
  findFirst: (args: unknown) => Promise<unknown>;
  create: (args: unknown) => Promise<unknown>;
  update: (args: unknown) => Promise<unknown>;
  delete: (args: unknown) => Promise<unknown>;
};

interface CrudOptions {
  /** Campos permitidos al crear/editar (lista blanca). */
  fields: string[];
  /** Include de relaciones para las lecturas. */
  include?: Record<string, boolean>;
  /** Orden por defecto. */
  orderBy?: Record<string, 'asc' | 'desc'>;
}

function pick(body: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) if (body[f] !== undefined) out[f] = body[f];
  return out;
}

// Router CRUD multi-tenant: todo se filtra/crea con el businessId del token.
export function crudRouter(model: string, opts: CrudOptions): Router {
  const router = Router();
  const delegate = (prisma as unknown as Record<string, Delegate>)[model];

  router.get('/', async (req: AuthedRequest, res: Response) => {
    const rows = await delegate.findMany({
      where: { businessId: req.businessId, eliminadoEn: null },
      include: opts.include,
      orderBy: opts.orderBy ?? { createdAt: 'desc' },
    });
    res.json(rows);
  });

  router.get('/:id', async (req: AuthedRequest, res: Response) => {
    const row = await delegate.findFirst({ where: { id: req.params.id, businessId: req.businessId, eliminadoEn: null }, include: opts.include });
    if (!row) return res.status(404).json({ error: { code: 'not_found', message: 'No encontrado' } });
    res.json(row);
  });

  router.post('/', async (req: AuthedRequest, res: Response) => {
    const data = pick(req.body ?? {}, opts.fields);
    const row = await delegate.create({ data: { ...data, businessId: req.businessId } });
    res.status(201).json(row);
  });

  router.patch('/:id', async (req: AuthedRequest, res: Response) => {
    const existing = await delegate.findFirst({ where: { id: req.params.id, businessId: req.businessId, eliminadoEn: null } });
    if (!existing) return res.status(404).json({ error: { code: 'not_found', message: 'No encontrado' } });
    const data = pick(req.body ?? {}, opts.fields);
    const row = await delegate.update({ where: { id: req.params.id }, data });
    res.json(row);
  });

  // SOFT DELETE: marca eliminadoEn (hard delete en producción). Todos los modelos
  // crud tienen la columna eliminado_en.
  router.delete('/:id', async (req: AuthedRequest, res: Response) => {
    const existing = await delegate.findFirst({ where: { id: req.params.id, businessId: req.businessId, eliminadoEn: null } });
    if (!existing) return res.status(404).json({ error: { code: 'not_found', message: 'No encontrado' } });
    await delegate.update({ where: { id: req.params.id }, data: { eliminadoEn: new Date() } });
    res.status(204).end();
  });

  return router;
}
