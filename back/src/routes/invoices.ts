import { Router, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import type { AuthedRequest } from '../middleware/types.js';
import { parsePagination } from '../lib/pagination.js';
import { crudRouter } from '../lib/crud.js';
import {
  computeBusinessInvoiceMetrics,
  INVOICE_ESTADOS,
  type InvoiceMetricsDelegate,
} from '../lib/invoices/metrics.js';

// Whitelist de campos editables por PATCH. Desde crm-operaos 10.3 `estado` SALE de la
// whitelist: las transiciones de estado van EXCLUSIVAMENTE por PUT /:id/status (set cerrado
// + gestión de pagadaEn), igual que en pedidos — un PATCH con `estado` simplemente lo ignora
// (pickFields), sin romper al resto de campos del parche.
// `total` TAMBIÉN sale: desde 10.3 es un campo SNAPSHOT/derivado (subtotal + IVA de las
// líneas). Permitir parchearlo suelto desincronizaba la cabecera del detalle de líneas (el
// IVA-por-diferencia del preview absorbía el delta en silencio). Se recalcula server-side al
// generar/aceptar; no se edita a mano.
const INVOICE_FIELDS = ['numero', 'cliente', 'servicio', 'fecha', 'documentos'];

// Include común de lecturas: el detalle documental (líneas snapshotadas, 10.3) viaja SIEMPRE
// con la factura, ordenado por posicion (misma convención que pedido.lines).
const INVOICE_INCLUDE = { lines: { orderBy: { posicion: 'asc' as const } } };

type ListDelegate = {
  findMany: (args: unknown) => Promise<unknown[]>;
  count: (args: unknown) => Promise<number>;
};

// Ordenación por cabecera del listado de facturas (crm-operaos 10.3). Whitelist de columnas
// con respaldo escalar en BD — a diferencia de pedidos, aquí `cliente` SÍ es una columna
// escalar (cliente_nombre) y `fecha` es String YYYY-MM-DD (ordena lexicográficamente igual
// que cronológicamente). Sin `sort` válido → orden por defecto (createdAt desc, sin cambiar
// el comportamiento previo). Mismo patrón que buildCustomersOrderBy / buildPedidosOrderBy.
// Exportada para tests.
const INVOICE_SORTABLE = new Set(['numero', 'cliente', 'fecha', 'estado']);
export function buildInvoicesOrderBy(q: Record<string, unknown>): Record<string, 'asc' | 'desc'> {
  const sort = typeof q.sort === 'string' && INVOICE_SORTABLE.has(q.sort) ? q.sort : null;
  if (!sort) return { createdAt: 'desc' };
  const order = q.order === 'asc' ? 'asc' : 'desc';
  return { [sort]: order };
}

/* ---------- PUT /:id/status (set cerrado + pagadaEn, crm-operaos 10.3) ---------- */

// Set CERRADO de estados (los 3 literales históricos del CRM; en BD solo existían
// 'Pendiente' y 'Pagada' a fecha de la migración — 'Anulada' se conserva porque es un
// literal vivo del front/metrics). Semántica alineada con AA (pendiente|cobrada + paidAt):
// 'Pagada' es el estado de cobro → fija pagadaEn; salir de 'Pagada' lo limpia.
const statusSchema = z.object({ estado: z.enum(INVOICE_ESTADOS) });

/** BD inyectable del handler (patrón DI de pedidoStatusHandler: testeable sin servidor ni BD). */
export interface InvoiceStatusDb {
  invoice: {
    findFirst: (args: unknown) => Promise<{ id: string; estado: string } | null>;
    update: (args: { where: { id: string }; data: Record<string, unknown>; include?: unknown }) => Promise<unknown>;
  };
}

/**
 * Transiciona el estado de una factura dentro del set cerrado Pendiente|Pagada|Anulada.
 *   - scoping por negocio + soft-delete (404 si no es propia/activa);
 *   - estado fuera del set → 422 (zod), sin tocar la fila;
 *   - a 'Pagada' → pagadaEn = now(); a cualquier otro estado → pagadaEn = null
 *     (espejo de PUT /invoices/:id/status de AA, status === 'cobrada' ? new Date() : null).
 */
export async function invoiceStatusHandler(db: InvoiceStatusDb, req: AuthedRequest, res: Response): Promise<void> {
  const parsed = statusSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(422).json({ error: { code: 'invalid', message: 'Estado inválido' } });
    return;
  }
  const estado = parsed.data.estado;

  const existing = await db.invoice.findFirst({
    where: { id: req.params.id, businessId: req.businessId, eliminadoEn: null },
  });
  if (!existing) {
    res.status(404).json({ error: { code: 'not_found', message: 'Factura no encontrada' } });
    return;
  }

  const invoice = await db.invoice.update({
    where: { id: existing.id },
    data: { estado, pagadaEn: estado === 'Pagada' ? new Date() : null },
    include: INVOICE_INCLUDE,
  });
  res.json(invoice);
}

/**
 * Router de /invoices (crm-paridad-facturas-pedidos-aa PR-3; detalle documental crm-operaos 10.3).
 *
 * Se separa GET / del crudRouter genérico ÚNICAMENTE para adjuntar `metrics` calculadas
 * SERVER-SIDE sobre TODAS las facturas del negocio, no solo la página devuelta. El listado
 * sigue paginado igual que antes (`skip`/`take`, mismo `{ items, total, page, limit }`), y
 * desde 10.3 admite orden por cabecera (`sort`/`order`, buildInvoicesOrderBy) e incluye las
 * líneas snapshotadas de cada factura. Paridad con AA (`agents-agency/back/src/routes/
 * invoices.ts`, que emite `{ invoices, metrics }` y expone PUT /:id/status).
 *
 * GET /:id, PATCH, DELETE y POST (→ 405) se HEREDAN del crudRouter genérico: misma whitelist
 * (sin `estado` desde 10.3), mismo scoping por businessId, misma semántica de PR-2b (alta
 * cerrada). El GET / del crud queda ensombrecido por el handler de abajo (registrado antes).
 */
export function invoicesRouter(): Router {
  const router = Router();
  const delegate = (prisma as unknown as Record<string, ListDelegate>).invoice;

  router.get('/', async (req: AuthedRequest, res: Response) => {
    const q = req.query as Record<string, unknown>;
    const { page, limit } = parsePagination(q);
    const where = { businessId: req.businessId, eliminadoEn: null };

    const [items, total, metrics] = await Promise.all([
      // Página actual del listado (paginada, como el crud genérico), con detalle de líneas.
      delegate.findMany({
        where,
        include: INVOICE_INCLUDE,
        orderBy: buildInvoicesOrderBy(q),
        skip: (page - 1) * limit,
        take: limit,
      }),
      delegate.count({ where }),
      // Métricas sobre el conjunto COMPLETO (sin skip/take): ver computeBusinessInvoiceMetrics.
      computeBusinessInvoiceMetrics(prisma.invoice as unknown as InvoiceMetricsDelegate, req.businessId),
    ]);

    res.json({ items, total, page, limit, metrics });
  });

  // Transición de estado (set cerrado + pagadaEn). Registrada ANTES del crudRouter para no
  // quedar ensombrecida por sus rutas genéricas.
  router.put('/:id/status', (req: AuthedRequest, res: Response) =>
    invoiceStatusHandler(prisma as unknown as InvoiceStatusDb, req, res));

  // Resto de verbos → crudRouter genérico (GET /:id, PATCH, DELETE, POST→405).
  router.use(crudRouter('invoice', { fields: INVOICE_FIELDS, include: INVOICE_INCLUDE, disableCreate: true }));

  return router;
}
