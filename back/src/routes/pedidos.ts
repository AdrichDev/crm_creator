import { Router, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import type { AuthedRequest } from '../middleware/types.js';
import { parsePagination } from '../lib/pagination.js';
import { computePedidoTotals } from '../lib/pedidos/totals.js';

// Presupuestos/Pedidos documentales (crm-paridad-facturas-pedidos-aa, Fase 1.2 / PR-2).
//
// Espejo funcional del router de presupuestos de agents-agency
// (agents-agency/back/src/routes/budgets.ts) adaptado a las convenciones del CRM:
//   - multi-tenencia: TODO se filtra/crea con el `businessId` del token (req.businessId);
//   - soft-delete: las lecturas excluyen `eliminadoEn != null`;
//   - totales SIEMPRE server-side a partir de las líneas (computePedidoTotals), nunca
//     se confían al cliente (mismo criterio que AA).
//
// Superficie NUEVA e independiente de `/sales` (crm.venta, TPV/carrito), que no se toca.
// La transición a `aceptada` es aquí una máquina de estados pura: NO crea factura todavía.
// El efecto factura-al-aceptar (ensureInvoiceForPedido idempotente + columna pedido_id
// @unique en crm.factura) va en PR-2b — ver design.md § División de PR-2.
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

/* ---------- PUT /:id/status (máquina de estados; SIN efecto factura en PR-2) ---------- */
pedidosRouter.put('/:id/status', async (req: AuthedRequest, res: Response) => {
  const parsed = statusSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(422).json({ error: { code: 'invalid', message: 'Estado inválido' } });
  }
  // Scoping por negocio: solo se transiciona un pedido propio y activo.
  const existing = await prisma.pedido.findFirst({
    where: { id: req.params.id, businessId: req.businessId, eliminadoEn: null },
  });
  if (!existing) return res.status(404).json({ error: { code: 'not_found', message: 'Pedido no encontrado' } });

  const pedido = await prisma.pedido.update({
    where: { id: existing.id },
    data: { estado: parsed.data.estado },
    include: { lines: { orderBy: { posicion: 'asc' } } },
  });
  res.json(pedido);
});
