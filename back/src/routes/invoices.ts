import { Router, type Response } from 'express';
import { prisma } from '../prisma.js';
import type { AuthedRequest } from '../middleware/types.js';
import { parsePagination } from '../lib/pagination.js';
import { crudRouter } from '../lib/crud.js';
import { computeBusinessInvoiceMetrics, type InvoiceMetricsDelegate } from '../lib/invoices/metrics.js';

// Whitelist de campos editables — idéntica a la que usaba el crudRouter genérico de
// /invoices en routes/index.ts (crm-paridad-facturas-pedidos-aa, PR-2b).
const INVOICE_FIELDS = ['numero', 'cliente', 'servicio', 'fecha', 'total', 'estado', 'documentos'];

type ListDelegate = {
  findMany: (args: unknown) => Promise<unknown[]>;
  count: (args: unknown) => Promise<number>;
};

/**
 * Router de /invoices (crm-paridad-facturas-pedidos-aa, PR-3).
 *
 * Se separa GET / del crudRouter genérico ÚNICAMENTE para adjuntar `metrics` calculadas
 * SERVER-SIDE sobre TODAS las facturas del negocio, no solo la página devuelta. El listado
 * sigue paginado igual que antes (`skip`/`take`, mismo `{ items, total, page, limit }`), pero
 * antes de este fix las métricas se derivaban en el front sobre esa página (máx. 100 filas):
 * con más facturas que el page size los KPIs quedaban subcontados sin aviso alguno. Paridad
 * con AA (`agents-agency/back/src/routes/invoices.ts`, que emite `{ invoices, metrics }`).
 *
 * GET /:id, PATCH, DELETE y POST (→ 405) se HEREDAN sin cambios del crudRouter genérico:
 * misma whitelist, mismo scoping por businessId, misma semántica de PR-2b (alta cerrada). El
 * GET / del crud queda ensombrecido por el handler de abajo (registrado antes), así que
 * nunca se alcanza — no hay doble listado.
 */
export function invoicesRouter(): Router {
  const router = Router();
  const delegate = (prisma as unknown as Record<string, ListDelegate>).invoice;

  router.get('/', async (req: AuthedRequest, res: Response) => {
    const { page, limit } = parsePagination(req.query as Record<string, unknown>);
    const where = { businessId: req.businessId, eliminadoEn: null };

    const [items, total, metrics] = await Promise.all([
      // Página actual del listado (paginada, como el crud genérico).
      delegate.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      delegate.count({ where }),
      // Métricas sobre el conjunto COMPLETO (sin skip/take): ver computeBusinessInvoiceMetrics.
      computeBusinessInvoiceMetrics(prisma.invoice as unknown as InvoiceMetricsDelegate, req.businessId),
    ]);

    res.json({ items, total, page, limit, metrics });
  });

  // Resto de verbos → crudRouter genérico (GET /:id, PATCH, DELETE, POST→405).
  router.use(crudRouter('invoice', { fields: INVOICE_FIELDS, disableCreate: true }));

  return router;
}
