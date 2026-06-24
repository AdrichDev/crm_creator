import { Router, type Response } from 'express';
import { prisma } from '../prisma.js';
import { checkAvailability, daySlots } from '../lib/availability.js';
import type { AuthedRequest } from '../middleware/types.js';
import { BookingStatus } from '@prisma/client';

export const bookingsRouter = Router();

// Estado de reserva (enum) → etiqueta castellana que muestra el front.
const ESTADO_LABEL: Record<string, string> = {
  PENDING: 'Pendiente', CONFIRMED: 'Confirmada', CANCELLED: 'Cancelada',
  COMPLETED: 'Completada', NO_SHOW: 'Cancelada',
};
const nombreCompleto = (c: { nombre: string; apellido?: string | null } | null | undefined) =>
  c ? [c.nombre, c.apellido].filter(Boolean).join(' ') : '';
const nombreEmpleado = (e: { firstName: string; lastName?: string | null } | null | undefined) =>
  e ? [e.firstName, e.lastName].filter(Boolean).join(' ') : '';

// GET / → citas en el shape castellano que consume el front (cliente/servicio/
// empleado/fecha/hora/estado). Punto único: lo usan citas, panel, estadísticas.
bookingsRouter.get('/', async (req: AuthedRequest, res: Response) => {
  const { from, to, status, employeeId } = req.query as Record<string, string | undefined>;
  const rows = await prisma.booking.findMany({
    where: {
      businessId: req.businessId,
      ...(status ? { status: status as BookingStatus } : {}),
      ...(employeeId ? { employeeId } : {}),
      ...(from || to ? { startAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
    },
    include: { customer: true, service: true, employee: true },
    orderBy: { startAt: 'asc' },
  });
  res.json(rows.map((b) => ({
    id: b.id,
    cliente: nombreCompleto(b.customer),
    servicio: b.service?.nombre ?? '',
    empleado: nombreEmpleado(b.employee),
    fecha: b.startAt.toISOString().slice(0, 10),
    hora: b.startAt.toISOString().slice(11, 16),
    estado: ESTADO_LABEL[b.status] ?? 'Pendiente',
    customerId: b.customerId,
    serviceId: b.serviceId,
    employeeId: b.employeeId,
    locationId: b.locationId,
  })));
});

bookingsRouter.get('/:id', async (req: AuthedRequest, res: Response) => {
  const row = await prisma.booking.findFirst({ where: { id: req.params.id, businessId: req.businessId }, include: { customer: true, service: true, employee: true, resources: true, history: true } });
  if (!row) return res.status(404).json({ error: { code: 'not_found', message: 'No encontrado' } });
  res.json(row);
});

// Disponibilidad: con start -> valida una franja; sin start pero con date -> huecos del día.
bookingsRouter.post('/check-availability', async (req: AuthedRequest, res: Response) => {
  const { locationId, serviceId, employeeId, resourceIds, start, date } = req.body ?? {};
  if (!locationId || !serviceId) return res.status(422).json({ error: { code: 'validation', message: 'locationId y serviceId requeridos' } });
  if (start) {
    const r = await checkAvailability({ businessId: req.businessId!, locationId, serviceId, employeeId, resourceIds, start });
    return res.json(r);
  }
  if (date) {
    const slots = await daySlots({ businessId: req.businessId!, locationId, serviceId, employeeId, resourceIds, start: date, date });
    return res.json({ slots });
  }
  res.status(422).json({ error: { code: 'validation', message: 'Indica start o date' } });
});

bookingsRouter.post('/', async (req: AuthedRequest, res: Response) => {
  const { locationId, serviceId, customerId, employeeId, resourceIds = [], start, channel = 'MANUAL', notes } = req.body ?? {};
  if (!locationId || !serviceId || !start) return res.status(422).json({ error: { code: 'validation', message: 'locationId, serviceId y start requeridos' } });

  const result = await prisma.$transaction(async () => {
    const avail = await checkAvailability({ businessId: req.businessId!, locationId, serviceId, employeeId, resourceIds, start });
    if (!avail.ok) return { conflict: avail.reason };
    const booking = await prisma.booking.create({
      data: {
        businessId: req.businessId!, locationId, serviceId, customerId: customerId ?? null,
        employeeId: employeeId ?? null, startAt: avail.startAt!, endAt: avail.endAt!,
        status: 'PENDING', channel, notes, createdById: req.userId,
        resources: resourceIds.length ? { connect: resourceIds.map((id: string) => ({ id })) } : undefined,
      },
      include: { service: true, customer: true, employee: true, resources: true },
    });
    await prisma.bookingStatusHistory.create({ data: { bookingId: booking.id, toStatus: 'PENDING', changedBy: req.userId } });
    return { booking };
  });

  if ('conflict' in result) return res.status(409).json({ error: { code: 'availability', message: 'No disponible', reason: result.conflict } });
  res.status(201).json(result.booking);
});

async function transition(req: AuthedRequest, res: Response, to: BookingStatus) {
  const booking = await prisma.booking.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!booking) return res.status(404).json({ error: { code: 'not_found', message: 'No encontrado' } });
  const updated = await prisma.booking.update({ where: { id: booking.id }, data: { status: to } });
  await prisma.bookingStatusHistory.create({ data: { bookingId: booking.id, fromStatus: booking.status, toStatus: to, changedBy: req.userId, reason: req.body?.reason } });

  // Al completar: consumir una sesión de bono si el cliente tiene uno activo para ese servicio.
  if (to === 'COMPLETED' && booking.customerId) {
    const candidates = await prisma.customerPackage.findMany({
      where: { businessId: req.businessId, customerId: booking.customerId, status: 'ACTIVE', package: { services: { some: { id: booking.serviceId } } } },
      orderBy: { purchasedAt: 'asc' },
    });
    const cp = candidates.find((c: { sessionsUsed: number; sessionsTotal: number }) => c.sessionsUsed < c.sessionsTotal);
    if (cp) {
      await prisma.customerPackage.update({ where: { id: cp.id }, data: { sessionsUsed: { increment: 1 } } });
      await prisma.packageSession.create({ data: { customerPackageId: cp.id, bookingId: booking.id } });
    }
  }
  res.json(updated);
}

bookingsRouter.post('/:id/cancel', (req: AuthedRequest, res) => transition(req, res, 'CANCELLED'));
bookingsRouter.post('/:id/complete', (req: AuthedRequest, res) => transition(req, res, 'COMPLETED'));
bookingsRouter.post('/:id/no-show', (req: AuthedRequest, res) => transition(req, res, 'NO_SHOW'));

bookingsRouter.patch('/:id', async (req: AuthedRequest, res: Response) => {
  const booking = await prisma.booking.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!booking) return res.status(404).json({ error: { code: 'not_found', message: 'No encontrado' } });
  // Reprogramación: revalida disponibilidad.
  if (req.body?.start) {
    const avail = await checkAvailability({ businessId: req.businessId!, locationId: booking.locationId, serviceId: booking.serviceId, employeeId: req.body.employeeId ?? booking.employeeId, start: req.body.start });
    if (!avail.ok) return res.status(409).json({ error: { code: 'availability', message: 'No disponible', reason: avail.reason } });
    const updated = await prisma.booking.update({ where: { id: booking.id }, data: { startAt: avail.startAt!, endAt: avail.endAt!, employeeId: req.body.employeeId ?? booking.employeeId, notes: req.body.notes ?? booking.notes } });
    return res.json(updated);
  }
  const updated = await prisma.booking.update({ where: { id: booking.id }, data: { notes: req.body?.notes, employeeId: req.body?.employeeId } });
  res.json(updated);
});
