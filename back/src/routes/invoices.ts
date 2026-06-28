import { Router, type Response } from 'express';
import { prisma } from '../prisma.js';
import type { AuthedRequest } from '../middleware/types.js';
import { crudRouter } from '../lib/crud.js';

/**
 * Invoices router. POST auto-assigns `numero` (correlative per business) so
 * callers — including the ops-bot — never pass an invoice number. GET/PATCH/
 * DELETE are delegated to the generic crud router (without `numero` in the
 * writable fields, so it can never be set/overwritten by clients).
 *
 * NOTE: the correlative is count-based and NOT concurrency-safe; acceptable for
 * the current single-operator scale. Harden with a transactional sequence (or a
 * unique constraint + retry) before multi-writer production use.
 */
export const invoicesRouter = Router();

invoicesRouter.post('/', async (req: AuthedRequest, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const cliente = typeof body.cliente === 'string' ? body.cliente.trim() : '';
  if (!cliente) {
    return res.status(422).json({ error: { code: 'invalid', message: 'Falta cliente' } });
  }

  const count = await prisma.invoice.count({ where: { businessId: req.businessId } });
  const numero = `F-${String(count + 1).padStart(4, '0')}`;

  const row = await prisma.invoice.create({
    data: {
      businessId: req.businessId!,
      numero,
      cliente,
      servicio: typeof body.servicio === 'string' ? body.servicio : null,
      fecha: typeof body.fecha === 'string' ? body.fecha : new Date().toISOString().slice(0, 10),
      total: typeof body.total === 'number' ? body.total : 0,
      estado: typeof body.estado === 'string' ? body.estado : 'Pendiente',
    },
  });
  res.status(201).json(row);
});

// GET / GET/:id / PATCH / DELETE — generic crud. `numero` intentionally excluded
// from writable fields: it is server-assigned only.
invoicesRouter.use(crudRouter('invoice', { fields: ['cliente', 'servicio', 'fecha', 'total', 'estado', 'documentos'] }));
