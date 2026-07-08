import { Router, type Response, type Request } from 'express';
import { z } from 'zod';
import { prisma } from '../../prisma.js';
import { computeNextCodigo, geocodeContacto } from '../contactos.js';

export const leadsPublicRouter = Router();

const createPublicLeadSchema = z.object({
  businessId: z.string().cuid(),
  nombre: z.string().min(1, 'El nombre es requerido'),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  telefono: z.string().optional().or(z.literal('')),
  peticion: z.string().optional(),
  // Opcionales para si la landing pregunta más
  sector: z.string().optional(),
  direccion: z.string().optional(),
  numero: z.string().optional(),
  piso: z.string().optional(),
  codigoPostal: z.string().optional(),
  localidad: z.string().optional(),
});

leadsPublicRouter.post('/', async (req: Request, res: Response) => {
  const parsed = createPublicLeadSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(422).json({
      error: {
        code: 'invalid',
        message: 'Datos no válidos',
        details: parsed.error.flatten(),
      },
    });
  }

  const d = parsed.data;

  try {
    // Verificar que el business existe y está activo
    const business = await prisma.business.findUnique({
      where: { id: d.businessId, eliminadoEn: null },
    });

    if (!business) {
      return res.status(404).json({
        error: { code: 'not_found', message: 'Negocio no encontrado o inactivo' },
      });
    }

    const geo = await geocodeContacto(d);

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const row = await prisma.contacto.create({
          data: {
            businessId: d.businessId,
            codigo: await computeNextCodigo(d.businessId),
            tipo: 'lead',
            nombre: d.nombre,
            telefono: d.telefono || null,
            email: d.email || null,
            sector: d.sector || null,
            direccion: d.direccion || null,
            numero: d.numero || null,
            piso: d.piso || null,
            codigoPostal: d.codigoPostal || null,
            localidad: d.localidad || null,
            peticion: d.peticion || null,
            contactado: 'no',
            contactadoEn: null,
            ...geo,
          },
        });
        return res.status(201).json({ id: row.id, message: 'Lead creado con éxito' });
      } catch (e: unknown) {
        if ((e as { code?: string }).code === 'P2002' && attempt < 2) continue;
        throw e;
      }
    }
  } catch (err: unknown) {
    console.error('[public/leads] unexpected error:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});
