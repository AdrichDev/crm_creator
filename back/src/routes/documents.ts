import { Router, type Response } from 'express';
import { prisma } from '../prisma.js';
import type { AuthedRequest } from '../middleware/types.js';
import { assertBelongsToBusiness, handleCrossTenant } from '../lib/tenant.js';
import { pickFields } from '../lib/nombre.js';
import { parsePagination } from '../lib/pagination.js';

// Documentos (Document) scoped por negocio. CRUD custom (no usa crudRouter)
// porque Document NO tiene columna eliminadoEn → el DELETE es HARD (físico).
// El FK employeeId se valida cross-tenant (422) igual que en crud.ts.
export const documentsRouter = Router();

// Lista blanca de campos escribibles. employeeId es FK validable; el resto son
// campos propios del documento.
const FIELDS = ['titulo', 'tipo', 'rutaArchivo', 'visibilidad', 'employeeId', 'subidoPor'] as const;

async function validateEmployeeFk(body: Record<string, unknown>, businessId: string | undefined): Promise<void> {
  const id = body.employeeId;
  if (typeof id === 'string') await assertBelongsToBusiness('employee', id, businessId, 'employeeId');
}

documentsRouter.get('/', async (req: AuthedRequest, res: Response) => {
  const { page, limit } = parsePagination(req.query as Record<string, unknown>);
  const where = { businessId: req.businessId };
  const [items, total] = await Promise.all([
    prisma.document.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
    prisma.document.count({ where }),
  ]);
  res.json({ items, total, page, limit });
});

documentsRouter.get('/:id', async (req: AuthedRequest, res: Response) => {
  const row = await prisma.document.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!row) return res.status(404).json({ error: { code: 'not_found', message: 'No encontrado' } });
  res.json(row);
});

documentsRouter.post('/', async (req: AuthedRequest, res: Response) => {
  const body = req.body ?? {};
  if (typeof body.titulo !== 'string' || !body.titulo.trim() || typeof body.rutaArchivo !== 'string' || !body.rutaArchivo.trim()) {
    return res.status(422).json({ error: { code: 'validation', message: 'titulo y rutaArchivo requeridos' } });
  }
  try {
    await validateEmployeeFk(body, req.businessId);
  } catch (e) {
    if (handleCrossTenant(e, res)) return;
    throw e;
  }
  const data = pickFields(body, FIELDS);
  const row = await prisma.document.create({ data: { ...data, businessId: req.businessId } as never });
  res.status(201).json(row);
});

documentsRouter.patch('/:id', async (req: AuthedRequest, res: Response) => {
  const existing = await prisma.document.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!existing) return res.status(404).json({ error: { code: 'not_found', message: 'No encontrado' } });
  try {
    await validateEmployeeFk(req.body ?? {}, req.businessId);
  } catch (e) {
    if (handleCrossTenant(e, res)) return;
    throw e;
  }
  const data = pickFields(req.body ?? {}, FIELDS);
  const row = await prisma.document.update({ where: { id: existing.id }, data: data as never });
  res.json(row);
});

// DELETE HARD: Document no tiene eliminadoEn → se borra físicamente.
documentsRouter.delete('/:id', async (req: AuthedRequest, res: Response) => {
  const existing = await prisma.document.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!existing) return res.status(404).json({ error: { code: 'not_found', message: 'No encontrado' } });
  await prisma.document.delete({ where: { id: existing.id } });
  res.status(204).end();
});
