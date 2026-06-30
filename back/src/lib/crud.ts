import { Router, type Response } from 'express';
import { prisma } from '../prisma.js';
import type { AuthedRequest } from '../middleware/types.js';
import { assertBelongsToBusiness, handleCrossTenant, type TenantModel } from './tenant.js';
import { pickFields } from './nombre.js';
import { parsePagination } from './pagination.js';

type Delegate = {
  findMany: (args: unknown) => Promise<unknown[]>;
  findFirst: (args: unknown) => Promise<unknown>;
  create: (args: unknown) => Promise<unknown>;
  update: (args: unknown) => Promise<unknown>;
  delete: (args: unknown) => Promise<unknown>;
  count: (args: unknown) => Promise<number>;
};

interface CrudOptions {
  /** Campos permitidos al crear/editar (lista blanca). */
  fields: string[];
  /** Include de relaciones para las lecturas. */
  include?: Record<string, boolean>;
  /** Orden por defecto. */
  orderBy?: Record<string, 'asc' | 'desc'>;
  /** FKs del body a validar contra el negocio activo (campo → modelo destino). */
  fkFields?: Record<string, TenantModel>;
  /** Campos de texto para búsqueda ILIKE (OR). Si está vacío no se aplica filtro. */
  searchFields?: string[];
}

// Valida cada FK presente en el body contra el negocio activo. Lanza CrossTenantError.
async function validateFks(body: Record<string, unknown>, businessId: string | undefined, fkFields?: Record<string, TenantModel>): Promise<void> {
  if (!fkFields) return;
  for (const [field, model] of Object.entries(fkFields)) {
    const id = body[field];
    if (typeof id === 'string') await assertBelongsToBusiness(model, id, businessId, field);
  }
}

// Router CRUD multi-tenant: todo se filtra/crea con el businessId del token.
// GET / → devuelve { items, total, page, limit } paginado.
export function crudRouter(model: string, opts: CrudOptions): Router {
  const router = Router();
  const delegate = (prisma as unknown as Record<string, Delegate>)[model];

  router.get('/', async (req: AuthedRequest, res: Response) => {
    const { page, limit, search } = parsePagination(req.query as Record<string, unknown>);

    // Filtro OR de texto (ILIKE via Prisma mode:'insensitive') solo si hay search y campos.
    const searchWhere = (search && opts.searchFields?.length)
      ? { OR: opts.searchFields.map((f) => ({ [f]: { contains: search, mode: 'insensitive' as const } })) }
      : {};

    const where = { businessId: req.businessId, eliminadoEn: null, ...searchWhere };

    const [items, total] = await Promise.all([
      delegate.findMany({
        where,
        include: opts.include,
        orderBy: opts.orderBy ?? { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      delegate.count({ where }),
    ]);

    res.json({ items, total, page, limit });
  });

  router.get('/:id', async (req: AuthedRequest, res: Response) => {
    const row = await delegate.findFirst({ where: { id: req.params.id, businessId: req.businessId, eliminadoEn: null }, include: opts.include });
    if (!row) return res.status(404).json({ error: { code: 'not_found', message: 'No encontrado' } });
    res.json(row);
  });

  router.post('/', async (req: AuthedRequest, res: Response) => {
    try {
      await validateFks(req.body ?? {}, req.businessId, opts.fkFields);
    } catch (e) {
      if (handleCrossTenant(e, res)) return;
      throw e;
    }
    const data = pickFields(req.body ?? {}, opts.fields);
    const row = await delegate.create({ data: { ...data, businessId: req.businessId } });
    res.status(201).json(row);
  });

  router.patch('/:id', async (req: AuthedRequest, res: Response) => {
    const existing = await delegate.findFirst({ where: { id: req.params.id, businessId: req.businessId, eliminadoEn: null } });
    if (!existing) return res.status(404).json({ error: { code: 'not_found', message: 'No encontrado' } });
    try {
      await validateFks(req.body ?? {}, req.businessId, opts.fkFields);
    } catch (e) {
      if (handleCrossTenant(e, res)) return;
      throw e;
    }
    const data = pickFields(req.body ?? {}, opts.fields);
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
