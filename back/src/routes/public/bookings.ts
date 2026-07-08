import { Router, type Response, type Request } from 'express';
import { z } from 'zod';
import { prisma } from '../../prisma.js';
import { checkAvailability } from '../../lib/availability.js';
import { splitNombre } from '../../lib/nombre.js';

export const bookingsPublicRouter = Router();

const createPublicBookingSchema = z.object({
  businessId: z.string().cuid(),
  locationId: z.string().cuid(),
  serviceId: z.string().cuid(),
  employeeId: z.string().cuid().optional(),
  start: z.string().datetime(), // ISO 8601 — rejects garbage before reaching new Date()
  notes: z.string().optional(),
  
  // Datos del cliente
  customer: z.object({
    nombre: z.string().min(1, 'Nombre es requerido'),
    email: z.string().email('Email inválido').optional(),
    telefono: z.string().optional(),
  }),
});

bookingsPublicRouter.post('/', async (req: Request, res: Response) => {
  const parsed = createPublicBookingSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(422).json({
      error: { code: 'invalid', message: 'Datos no válidos', details: parsed.error.flatten() },
    });
  }

  const d = parsed.data;

  try {
    // Verificar que el business existe y está activo
    const business = await prisma.business.findUnique({
      where: { id: d.businessId, eliminadoEn: null },
    });
    if (!business) {
      return res.status(404).json({ error: { code: 'not_found', message: 'Negocio no encontrado' } });
    }

    // FIX 2: validate locationId belongs to businessId (previene contaminación cross-tenant)
    const location = await prisma.location.findFirst({
      where: { id: d.locationId, businessId: d.businessId },
    });
    if (!location) {
      return res.status(400).json({ error: { code: 'location_not_found', message: 'Ubicación no válida para este negocio' } });
    }

    // FIX 2: validate employeeId belongs to businessId if provided
    if (d.employeeId) {
      const employee = await prisma.employee.findFirst({
        where: { id: d.employeeId, businessId: d.businessId, eliminadoEn: null },
      });
      if (!employee) {
        return res.status(400).json({ error: { code: 'employee_not_found', message: 'Empleado no válido para este negocio' } });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Validar disponibilidad real (evitar double-booking concurrentes)
      const avail = await checkAvailability({
        businessId: d.businessId,
        locationId: d.locationId,
        serviceId: d.serviceId,
        employeeId: d.employeeId,
        start: d.start,
      });

      if (!avail.ok) {
        return { conflict: avail.reason };
      }

      // 2. Resolver Cliente (Upsert por email si existe, sino crear)
      let customer = null;
      if (d.customer.email) {
        customer = await tx.customer.findFirst({
          where: { businessId: d.businessId, email: d.customer.email, eliminadoEn: null },
        });
      }
      if (!customer && d.customer.telefono) {
        customer = await tx.customer.findFirst({
          where: { businessId: d.businessId, telefono: d.customer.telefono, eliminadoEn: null },
        });
      }

      if (!customer) {
        const { nombre, apellido } = splitNombre(d.customer.nombre);
        customer = await tx.customer.create({
          data: {
            businessId: d.businessId,
            nombre,
            apellido,
            email: d.customer.email || null,
            telefono: d.customer.telefono || null,
            tipoRegistro: 'CLIENTE',
          },
        });
      }

      // 3. Crear Booking
      const booking = await tx.booking.create({
        data: {
          businessId: d.businessId,
          locationId: d.locationId,
          serviceId: d.serviceId,
          customerId: customer.id,
          employeeId: d.employeeId ?? null,
          startAt: avail.startAt!,
          endAt: avail.endAt!,
          status: 'PENDING',
          channel: 'MANUAL', // Origen
          notes: d.notes || null,
        },
      });

      await tx.bookingStatusHistory.create({
        data: { bookingId: booking.id, estadoNuevo: 'PENDING' }, // Sin cambiadoPor (es externo)
      });

      return { booking };
    });

    if ('conflict' in result) {
      return res.status(409).json({
        error: { code: 'availability', message: 'No disponible', reason: result.conflict },
      });
    }

    return res.status(201).json({ id: result.booking.id, message: 'Reserva creada con éxito' });
  } catch (err: unknown) {
    console.error('[public/bookings] unexpected error:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});
