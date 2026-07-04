import { Router, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import type { AuthedRequest } from '../middleware/types.js';
import { parsePagination } from '../lib/pagination.js';
import { computePedidoTotals } from '../lib/pedidos/totals.js';
import { ensureInvoiceForPedido, type InvoiceCreateTx, type PedidoForInvoice } from '../lib/pedidos/invoice.js';

// Presupuestos/Pedidos documentales (crm-paridad-facturas-pedidos-aa, Fase 1.2 / PR-2 + PR-2b).
//
// Espejo funcional del router de presupuestos de agents-agency
// (agents-agency/back/src/routes/budgets.ts) adaptado a las convenciones del CRM:
//   - multi-tenencia: TODO se filtra/crea con el `businessId` del token (req.businessId);
//   - soft-delete: las lecturas excluyen `eliminadoEn != null`;
//   - totales SIEMPRE server-side a partir de las líneas (computePedidoTotals), nunca
//     se confían al cliente (mismo criterio que AA).
//
// Superficie NUEVA e independiente de `/sales` (crm.venta, TPV/carrito), que no se toca.
// PR-2b: la transición a `aceptada` auto-crea la factura (ensureInvoiceForPedido, idempotente
// vía factura.pedido_id @unique + comprobación del target del P2002), dentro de una
// $transaction junto al cambio de estado. Guard de des-aceptación: no se puede salir de
// `aceptada` si ya hay factura vinculada (no huérfana la factura).
export const pedidosRouter = Router();

/** Ciclo de estados idéntico al de AA (BUDGET_STATUSES en budgets.ts). */
const PEDIDO_ESTADOS = ['generada', 'aceptada', 'rechazada', 'caducada'] as const;

const lineSchema = z.object({
  servicioId: z.string().default(''),
  nombre: z.string().min(1, "Cada línea necesita 'nombre'"),
  descripcion: z.string().nullable().optional(),
  cantidad: z.number().nonnegative().default(1),
  precioImpl: z.number().nonnegative().default(0),
  precioMant: z.number().nonnegative().default(0),
});

const createSchema = z.object({
  numero: z.string().min(1, "El campo 'numero' es obligatorio"),
  customerId: z.string().nullable().optional(),
  clienteSnapshot: z.record(z.unknown()).optional(),
  emisorSnapshot: z.record(z.unknown()).optional(),
  tasaIva: z.number().min(0).max(1).default(0.21),
  diasValidez: z.number().int().positive().default(30),
  notas: z.string().nullable().optional(),
  lines: z.array(lineSchema).default([]),
});

const statusSchema = z.object({ estado: z.enum(PEDIDO_ESTADOS) });

/* ---------- GET / (listado paginado, scoping por negocio) ---------- */
pedidosRouter.get('/', async (req: AuthedRequest, res: Response) => {
  const { page, limit, search } = parsePagination(req.query as Record<string, unknown>);
  const searchWhere = search
    ? { OR: [{ numero: { contains: search, mode: 'insensitive' as const } }] }
    : {};
  const where = { businessId: req.businessId, eliminadoEn: null, ...searchWhere };

  const [items, total] = await Promise.all([
    prisma.pedido.findMany({
      where,
      include: { lines: { orderBy: { posicion: 'asc' } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.pedido.count({ where }),
  ]);

  res.json({ items, total, page, limit });
});

/* ---------- GET /:id (con líneas, scoping por negocio) ---------- */
pedidosRouter.get('/:id', async (req: AuthedRequest, res: Response) => {
  const pedido = await prisma.pedido.findFirst({
    where: { id: req.params.id, businessId: req.businessId, eliminadoEn: null },
    include: { lines: { orderBy: { posicion: 'asc' } } },
  });
  if (!pedido) return res.status(404).json({ error: { code: 'not_found', message: 'Pedido no encontrado' } });
  res.json(pedido);
});

/* ---------- POST / (alta, totales server-side, líneas anidadas) ---------- */
pedidosRouter.post('/', async (req: AuthedRequest, res: Response) => {
  const parsed = createSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(422).json({ error: { code: 'invalid', message: parsed.error.issues[0]?.message ?? 'Datos inválidos' } });
  }
  const { numero, customerId, clienteSnapshot, emisorSnapshot, tasaIva, diasValidez, notas, lines } = parsed.data;

  // Si se vincula un cliente, debe pertenecer al negocio activo (guard cross-tenant).
  if (customerId) {
    const owner = await prisma.customer.findFirst({ where: { id: customerId, businessId: req.businessId, eliminadoEn: null } });
    if (!owner) return res.status(422).json({ error: { code: 'invalid', message: 'Cliente inválido' } });
  }

  // Totales SIEMPRE server-side desde las líneas (no se confían al cliente).
  const totals = computePedidoTotals(lines, tasaIva);

  const pedido = await prisma.pedido.create({
    data: {
      businessId: req.businessId!,
      numero,
      customerId: customerId || null,
      clienteSnapshot: (clienteSnapshot ?? {}) as object,
      emisorSnapshot: (emisorSnapshot ?? {}) as object,
      // Siempre nace en 'generada': la única vía a 'aceptada' (y al futuro hook
      // de factura en PR-2b) es la transición explícita de PUT /:id/status.
      estado: 'generada',
      subtotalImpl: totals.subtotalImpl,
      subtotalMant: totals.subtotalMant,
      totalImpl: totals.totalImpl,
      totalMant: totals.totalMant,
      tasaIva,
      diasValidez,
      notas: notas ?? null,
      lines: {
        create: lines.map((l, i) => ({
          servicioId: l.servicioId,
          nombre: l.nombre,
          descripcion: l.descripcion ?? null,
          cantidad: l.cantidad ?? 1,
          precioImpl: l.precioImpl ?? 0,
          precioMant: l.precioMant ?? 0,
          posicion: i,
        })),
      },
    },
    include: { lines: { orderBy: { posicion: 'asc' } } },
  });
  res.status(201).json(pedido);
});

/* ---------- PUT /:id/status (máquina de estados + auto-factura al aceptar) ---------- */

/** Pedido tal como lo devuelve el scoping (con la factura vinculada y las líneas). */
interface PedidoWithInvoice extends PedidoForInvoice {
  estado: string;
  invoice: { id: string } | null;
  lines?: unknown;
}

/** Cliente de transacción del handler: cambia el estado del pedido y (si acepta) crea factura. */
export interface PedidoStatusTx extends InvoiceCreateTx {
  pedido: { update: (args: { where: { id: string }; data: Record<string, unknown>; include?: unknown }) => Promise<unknown> };
}

/** BD inyectable del handler (permite el patrón DI de los tests unitarios, como service-operator). */
export interface PedidoStatusDb {
  pedido: { findFirst: (args: unknown) => Promise<PedidoWithInvoice | null> };
  $transaction: <T>(fn: (tx: PedidoStatusTx) => Promise<T>) => Promise<T>;
}

/**
 * Transiciona el estado de un pedido. Handler extraído (DI) para poder testear en unidad
 * la lógica de guard + transacción + hook de factura sin levantar servidor ni BD.
 *
 * Reglas (espejo de budgetsRouter.put('/:id/status') de AA):
 *   - scoping por negocio (404 si no es propio/activo);
 *   - guard de des-aceptación: salir de `aceptada` con factura vinculada → 400;
 *   - al entrar en `aceptada`: se auto-crea la factura DENTRO de la misma $transaction que
 *     el cambio de estado (un fallo de la factura revierte el estado — nunca `aceptada` sin
 *     factura y sin forma de detectar el hueco).
 */
export async function pedidoStatusHandler(db: PedidoStatusDb, req: AuthedRequest, res: Response): Promise<void> {
  const parsed = statusSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(422).json({ error: { code: 'invalid', message: 'Estado inválido' } });
    return;
  }
  const nuevoEstado = parsed.data.estado;

  // Scoping por negocio: solo se transiciona un pedido propio y activo. Se incluye la
  // factura vinculada para el guard de des-aceptación.
  const existing = await db.pedido.findFirst({
    where: { id: req.params.id, businessId: req.businessId, eliminadoEn: null },
    include: { invoice: { select: { id: true } } },
  });
  if (!existing) {
    res.status(404).json({ error: { code: 'not_found', message: 'Pedido no encontrado' } });
    return;
  }

  // Guard de des-aceptación: no se puede abandonar `aceptada` si ya hay factura vinculada
  // (la factura quedaría huérfana). Mismo criterio que AA.
  if (existing.estado === 'aceptada' && nuevoEstado !== 'aceptada' && existing.invoice) {
    res.status(400).json({
      error: { code: 'conflict', message: 'No se puede cambiar el estado: el pedido ya tiene una factura asociada' },
    });
    return;
  }

  const pedido = await db.$transaction(async (tx) => {
    const updated = (await tx.pedido.update({
      where: { id: existing.id },
      data: { estado: nuevoEstado },
      include: { lines: { orderBy: { posicion: 'asc' } } },
    })) as PedidoForInvoice;
    if (nuevoEstado === 'aceptada') {
      await ensureInvoiceForPedido(tx, updated);
    }
    return updated;
  });
  res.json(pedido);
}

pedidosRouter.put('/:id/status', (req: AuthedRequest, res: Response) => pedidoStatusHandler(prisma as unknown as PedidoStatusDb, req, res));
