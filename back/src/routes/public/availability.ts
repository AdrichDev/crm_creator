import { Router, type Response, type Request } from 'express';
import { z } from 'zod';
import { prisma } from '../../prisma.js';
import { daySlotsWithAvailability } from '../../lib/availability.js';

export const availabilityPublicRouter = Router();

const checkAvailabilitySchema = z.object({
  businessId: z.string().cuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD'),
  serviceId: z.string().cuid(),
  locationId: z.string().cuid(),
  employeeId: z.string().cuid().optional(),
});

availabilityPublicRouter.get('/', async (req: Request, res: Response) => {
  const parsed = checkAvailabilitySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(422).json({
      error: { code: 'invalid', message: 'Parámetros no válidos', details: parsed.error.flatten() },
    });
  }

  const { businessId, date, serviceId, locationId, employeeId } = parsed.data;

  try {
    // Verificar que el business y location pertenecen y están activos (dentro del try para
    // que cualquier rechazo de la DB sea capturado y no cause unhandledRejection)
    const business = await prisma.business.findUnique({
      where: { id: businessId, eliminadoEn: null },
    });
    if (!business) {
      return res.status(404).json({ error: { code: 'not_found', message: 'Negocio no encontrado' } });
    }

    const location = await prisma.location.findFirst({
      where: { id: locationId, businessId, activo: true },
    });
    if (!location) {
      return res.status(404).json({ error: { code: 'not_found', message: 'Ubicación no encontrada o inactiva' } });
    }

    const slots = await daySlotsWithAvailability({
      businessId,
      date,
      serviceId,
      locationId,
      employeeId,
      start: date, // start se ignora dentro de iterateDaySlots, usa `date` pero requiere pasarse al tipado base
    });
    return res.json(slots);
  } catch (err: unknown) {
    console.error('[public/availability] unexpected error:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});
