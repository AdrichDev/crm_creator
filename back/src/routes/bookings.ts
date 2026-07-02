import { Router, type Response } from 'express';
import { prisma } from '../prisma.js';
import { checkAvailability, daySlots } from '../lib/availability.js';
import type { AuthedRequest } from '../middleware/types.js';
import { BookingStatus } from '../lib/generated/prisma/client.js';
import { assertFks, handleCrossTenant } from '../lib/tenant.js';
import { joinNombre } from '../lib/nombre.js';
import { notifyBookingConfirmed, notifyBookingNoShow } from '../lib/notify.js';
import { emit } from '../lib/automation/index.js';
import { buildReviewRequest } from '../lib/eventPayloads.js';
import { parsePagination } from '../lib/pagination.js';

export const bookingsRouter = Router();

// Estado de reserva (enum) → etiqueta castellana que muestra el front.
const ESTADO_LABEL: Record<string, string> = {
  PENDING: 'Pendiente', CONFIRMED: 'Confirmada', CANCELLED: 'Cancelada',
  COMPLETED: 'Completada', NO_SHOW: 'Cancelada',
};
// GET / → citas en el shape castellano que consume el front (cliente/servicio/
// empleado/fecha/hora/estado). Punto único: lo usan citas, panel, estadísticas.
// Devuelve { items, total, page, limit } paginado.
bookingsRouter.get('/', async (req: AuthedRequest, res: Response) => {
  const { from, to, status, employeeId } = req.query as Record<string, string | undefined>;
  const { page, limit, search } = parsePagination(req.query as Record<string, unknown>);

  // Búsqueda nested: nombre/apellido del cliente o nombre del servicio.
  const searchWhere = search ? {
    OR: [
      { customer: { nombre:   { contains: search, mode: 'insensitive' as const } } },
      { customer: { apellido: { contains: search, mode: 'insensitive' as const } } },
      { service:  { nombre:   { contains: search, mode: 'insensitive' as const } } },
    ],
  } : {};

  const where = {
    businessId: req.businessId,
    eliminadoEn: null,
    ...searchWhere,
    ...(status ? { status: status as BookingStatus } : {}),
    ...(employeeId ? { employeeId } : {}),
    ...(from || to ? { startAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: { customer: true, service: true, employee: true, team: true, resources: true },
      orderBy: { startAt: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.booking.count({ where }),
  ]);

  res.json({
    items: rows.map((b) => ({
      id: b.id,
      // Si es una reserva de equipo (entrenamiento), "cliente" muestra el nombre del equipo.
      cliente: b.team ? b.team.nombre : joinNombre(b.customer),
      servicio: b.service?.nombre ?? '',
      empleado: joinNombre(b.employee),
      fecha: b.startAt.toISOString().slice(0, 10),
      hora: b.startAt.toISOString().slice(11, 16),
      estado: ESTADO_LABEL[b.status] ?? 'Pendiente',
      customerId: b.customerId,
      teamId: b.teamId,
      serviceId: b.serviceId,
      employeeId: b.employeeId,
      locationId: b.locationId,
      recurso: b.resources[0]?.nombre ?? null,
      aforo: b.resources[0]?.capacidad ?? null,
      notes: b.notes ?? null,
    })),
    total,
    page,
    limit,
  });
});

bookingsRouter.get('/:id', async (req: AuthedRequest, res: Response) => {
  const row = await prisma.booking.findFirst({ where: { id: req.params.id, businessId: req.businessId }, include: { customer: true, service: true, employee: true, resources: true, history: true, team: true } });
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
  const { locationId, serviceId, customerId, teamId, employeeId, resourceIds = [], start, channel = 'MANUAL', notes } = req.body ?? {};
  if (!locationId || !serviceId || !start) return res.status(422).json({ error: { code: 'validation', message: 'locationId, serviceId y start requeridos' } });
  // XOR: una reserva es de un cliente O de un equipo (entrenamiento), nunca ambos.
  if (customerId && teamId) return res.status(400).json({ error: { code: 'XOR_REQUIRED', message: 'Solo uno de customerId o teamId' } });

  // Gate tenancy: ningún FK puede apuntar a otro negocio.
  try {
    await assertFks(req.businessId, [
      { model: 'location', id: locationId, field: 'locationId' },
      { model: 'service', id: serviceId, field: 'serviceId' },
      { model: 'customer', id: customerId, field: 'customerId' },
      { model: 'team', id: teamId, field: 'teamId' },
      { model: 'employee', id: employeeId, field: 'employeeId' },
      ...(resourceIds as string[]).map((id) => ({ model: 'resource' as const, id, field: 'resourceIds' })),
    ]);
  } catch (e) {
    if (handleCrossTenant(e, res)) return;
    throw e;
  }

  const result = await prisma.$transaction(async () => {
    const avail = await checkAvailability({ businessId: req.businessId!, locationId, serviceId, employeeId, resourceIds, start });
    if (!avail.ok) return { conflict: avail.reason };
    const booking = await prisma.booking.create({
      data: {
        businessId: req.businessId!, locationId, serviceId, customerId: customerId ?? null,
        teamId: teamId ?? null,
        employeeId: employeeId ?? null, startAt: avail.startAt!, endAt: avail.endAt!,
        status: 'PENDING', channel, notes, createdById: req.userId,
        resources: resourceIds.length ? { connect: resourceIds.map((id: string) => ({ id })) } : undefined,
      },
      include: { service: true, customer: true, employee: true, resources: true, team: true },
    });
    await prisma.bookingStatusHistory.create({ data: { bookingId: booking.id, estadoNuevo: 'PENDING', cambiadoPor: req.userId } });
    return { booking };
  });

  if ('conflict' in result) return res.status(409).json({ error: { code: 'availability', message: 'No disponible', reason: result.conflict } });

  // Fire-and-forget: email de confirmación + filas de recordatorio.
  // Nunca bloquea la respuesta 201 — el CRM no depende del envío.
  void (async () => {
    try {
      const booking = result.booking;
      const customerEmail = booking.customer?.email ?? null;
      const businessId = req.businessId!;

      // Nombre del negocio para las plantillas (carga ligera, fuera de la transacción).
      const business = await prisma.business.findFirst({ where: { id: businessId }, select: { nombre: true } });
      const businessName = business?.nombre ?? '';

      // Notificación de confirmación vía puerto (emit a n8n o SMTP directo según
      // config). Solo si el cliente tiene email. Soft-fail: nunca rompe el 201.
      if (customerEmail) {
        void notifyBookingConfirmed({
          bookingId: booking.id,
          businessId,
          businessName,
          customerName: joinNombre(booking.customer) || 'Cliente',
          email: customerEmail,
          serviceName: booking.service?.nombre ?? '',
          employeeName: booking.employee ? joinNombre(booking.employee) : undefined,
          startsAt: booking.startAt,
        }).catch(() => { /* soft-fail ya logueado */ });

        // Upsert 2 filas de recordatorio (24h y 2h antes).
        const reminderPayload = {
          bookingId: booking.id,
          customerName: joinNombre(booking.customer) || 'Cliente',
          serviceName: booking.service?.nombre ?? '',
          startsAt: booking.startAt.toISOString(),
          employeeName: booking.employee ? joinNombre(booking.employee) : undefined,
          businessName,
        };
        const reminders = [
          { offset: 24 * 60 * 60 * 1000, tipo: 'booking.reminder.24h' },
          { offset: 2 * 60 * 60 * 1000,  tipo: 'booking.reminder.2h' },
        ];
        const now = new Date();
        for (const { offset, tipo } of reminders) {
          const programadoEn = new Date(booking.startAt.getTime() - offset);
          if (programadoEn > now) {
            await prisma.notification.upsert({
              where: {
                tipo_businessId_destino_programadoEn: {
                  tipo, businessId, destino: customerEmail, programadoEn,
                },
              },
              create: {
                businessId, tipo, canal: 'email', destino: customerEmail,
                payload: reminderPayload as object, programadoEn, estado: 'pending',
              },
              update: {}, // duplicado → no-op
            });
          }
        }
      }
    } catch (err) {
      console.error('[booking.confirmed] error en post-create email/notificaciones:', (err as Error).message);
    }
  })();

  res.status(201).json(result.booking);
});

async function transition(req: AuthedRequest, res: Response, to: BookingStatus) {
  const booking = await prisma.booking.findFirst({ where: { id: req.params.id, businessId: req.businessId } });
  if (!booking) return res.status(404).json({ error: { code: 'not_found', message: 'No encontrado' } });
  const updated = await prisma.booking.update({ where: { id: booking.id }, data: { status: to } });
  await prisma.bookingStatusHistory.create({ data: { bookingId: booking.id, estadoAnterior: booking.status, estadoNuevo: to, cambiadoPor: req.userId, motivo: req.body?.reason } });

  // Al completar: consumir una sesión de bono si el cliente tiene uno activo para ese servicio.
  if (to === 'COMPLETED' && booking.customerId) {
    const candidates = await prisma.customerPackage.findMany({
      where: { businessId: req.businessId, customerId: booking.customerId, estado: 'ACTIVE', package: { services: { some: { id: booking.serviceId } } } },
      orderBy: { compradoEn: 'asc' },
    });
    const cp = candidates.find((c: { sesionesUsadas: number; sesionesTotal: number }) => c.sesionesUsadas < c.sesionesTotal);
    if (cp) {
      await prisma.customerPackage.update({ where: { id: cp.id }, data: { sesionesUsadas: { increment: 1 } } });
      await prisma.packageSession.create({ data: { customerPackageId: cp.id, bookingId: booking.id } });
    }
  }
  res.json(updated);
}

// DELETE /:id → soft delete (la cita desaparece de la agenda; cancelar es un estado).
bookingsRouter.delete('/:id', async (req: AuthedRequest, res: Response) => {
  const booking = await prisma.booking.findFirst({ where: { id: req.params.id, businessId: req.businessId, eliminadoEn: null } });
  if (!booking) return res.status(404).json({ error: { code: 'not_found', message: 'No encontrado' } });
  await prisma.booking.update({ where: { id: booking.id }, data: { eliminadoEn: new Date() } });
  res.status(204).end();
});

bookingsRouter.post('/:id/cancel', (req: AuthedRequest, res) => transition(req, res, 'CANCELLED'));

// Completar: transición + solicitud de reseña al cliente (fire-and-forget, emit
// directo a n8n; NO usa el puerto de F2). Nunca bloquea la respuesta.
bookingsRouter.post('/:id/complete', async (req: AuthedRequest, res: Response) => {
  await transition(req, res, 'COMPLETED');

  void (async () => {
    try {
      const booking = await prisma.booking.findFirst({
        where: { id: req.params.id, businessId: req.businessId, status: 'COMPLETED' },
        include: { customer: true, service: true },
      });
      if (!booking?.customer?.email) return;

      const business = await prisma.business.findFirst({ where: { id: req.businessId }, select: { nombre: true } });

      // emit() es soft-fail: nunca lanza. eventId idempotente por transición.
      await emit('review.request', buildReviewRequest({
        businessName: business?.nombre ?? '',
        customer: booking.customer,
        email: booking.customer.email,
        serviceName: booking.service?.nombre ?? '',
        startAt: booking.startAt,
      }), { businessId: booking.businessId, eventId: `${booking.id}:review` });
    } catch (err) {
      console.error('[booking.complete] error en review.request:', (err as Error).message);
    }
  })();
});

// No-show: transición de estado + email de seguimiento al cliente (fire-and-forget).
bookingsRouter.post('/:id/no-show', async (req: AuthedRequest, res: Response) => {
  await transition(req, res, 'NO_SHOW');

  // Fire-and-forget: email de seguimiento. Nunca bloquea la respuesta 200.
  void (async () => {
    try {
      const booking = await prisma.booking.findFirst({
        where: { id: req.params.id, businessId: req.businessId },
        include: { customer: true, service: true },
      });
      if (!booking?.customer?.email) return;

      const business = await prisma.business.findFirst({
        where: { id: req.businessId },
        select: { nombre: true },
      });

      // Notificación de seguimiento vía puerto (emit a n8n o SMTP directo). Soft-fail.
      void notifyBookingNoShow({
        bookingId: booking.id,
        businessId: booking.businessId,
        businessName: business?.nombre ?? '',
        customerName: joinNombre(booking.customer) || 'Cliente',
        email: booking.customer.email,
        serviceName: booking.service?.nombre ?? '',
        startsAt: booking.startAt,
      }).catch(() => { /* soft-fail ya logueado */ });
    } catch (err) {
      console.error('[booking.no-show] error en email de seguimiento:', (err as Error).message);
    }
  })();
});

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
