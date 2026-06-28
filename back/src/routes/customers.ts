import { Router, type Response } from 'express';
import { Prisma } from '../lib/generated/prisma/client.js';
import { prisma } from '../prisma.js';
import type { AuthedRequest } from '../middleware/types.js';
import { splitNombre, joinNombre, pickFields } from '../lib/nombre.js';

// Clientes (crm.cliente) en CASTELLANO, con agregados calculados (visitas,
// gastoTotal, ultimaVisita, segmento). Sustituye al crudRouter genérico para
// /customers porque la lista del front necesita esos derivados — que no son
// columnas, sino agregación de citas (Booking) y ventas (Sale).
export const customersRouter = Router();

// Regla de segmento (derivada; no se almacena).
function segmentoDe(visitas: number, gastoTotal: number, ultima: Date | null): string {
  if (visitas === 0) return 'Nuevo';
  if (gastoTotal >= 300) return 'VIP';
  if (ultima && Date.now() - ultima.getTime() > 90 * 86_400_000) return 'Inactivo';
  return 'Recurrente';
}

// Campos editables que SÍ son columnas (los derivados se ignoran al escribir).
const INPUT = ['email', 'telefono', 'direccion', 'notas'] as const;
function buildData(body: Record<string, unknown>): Record<string, unknown> {
  const data = pickFields(body, INPUT);
  if (typeof body.nombre === 'string') {
    const { nombre, apellido } = splitNombre(body.nombre);
    data.nombre = nombre;
    data.apellido = apellido;
  }
  return data;
}

customersRouter.get('/', async (req: AuthedRequest, res: Response) => {
  const businessId = req.businessId;
  const customers = await prisma.customer.findMany({ where: { businessId, eliminadoEn: null }, orderBy: { createdAt: 'desc' } });
  const ids = customers.map((c) => c.id);

  const [bookingsAgg, salesAgg] = await Promise.all([
    prisma.booking.groupBy({
      by: ['customerId'],
      where: { businessId, customerId: { in: ids } },
      _count: { _all: true },
      _max: { startAt: true },
    }),
    prisma.sale.groupBy({
      by: ['customerId'],
      where: { businessId, customerId: { in: ids } },
      _sum: { total: true },
    }),
  ]);
  const bMap = new Map(bookingsAgg.map((b) => [b.customerId, b]));
  const sMap = new Map(salesAgg.map((s) => [s.customerId, s]));

  const rows = customers.map((c) => {
    const b = bMap.get(c.id);
    const s = sMap.get(c.id);
    const visitas = b?._count._all ?? 0;
    const gastoTotal = s?._sum.total ? Number(s._sum.total) : 0;
    const ultima = b?._max.startAt ?? null;
    return {
      id: c.id,
      nombre: joinNombre(c),
      email: c.email ?? '',
      telefono: c.telefono ?? '',
      direccion: c.direccion ?? '',
      visitas,
      gastoTotal,
      ultimaVisita: ultima ? ultima.toISOString().slice(0, 10) : '',
      segmento: segmentoDe(visitas, gastoTotal, ultima),
      estado: c.estado,
    };
  });
  res.json(rows);
});

customersRouter.post('/', async (req: AuthedRequest, res: Response) => {
  const data = buildData(req.body ?? {});
  if (!data.nombre) return res.status(422).json({ error: { code: 'invalid', message: 'Falta nombre' } });
  const row = await prisma.customer.create({
    data: { ...data, businessId: req.businessId } as unknown as Prisma.CustomerUncheckedCreateInput,
  });
  res.status(201).json(row);
});

customersRouter.patch('/:id', async (req: AuthedRequest, res: Response) => {
  const existing = await prisma.customer.findFirst({ where: { id: req.params.id, businessId: req.businessId, eliminadoEn: null } });
  if (!existing) return res.status(404).json({ error: { code: 'not_found', message: 'No encontrado' } });
  const row = await prisma.customer.update({
    where: { id: req.params.id },
    data: buildData(req.body ?? {}) as Prisma.CustomerUncheckedUpdateInput,
  });
  res.json(row);
});

customersRouter.delete('/:id', async (req: AuthedRequest, res: Response) => {
  const existing = await prisma.customer.findFirst({ where: { id: req.params.id, businessId: req.businessId, eliminadoEn: null } });
  if (!existing) return res.status(404).json({ error: { code: 'not_found', message: 'No encontrado' } });
  await prisma.customer.update({ where: { id: req.params.id }, data: { eliminadoEn: new Date() } });
  res.status(204).end();
});
