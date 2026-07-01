import { Router, type Response, type NextFunction, type Request } from 'express';
import { prisma } from '../prisma.js';
import type { AuthedRequest } from '../middleware/types.js';
import { parsePagination } from '../lib/pagination.js';
import { staffOnly } from '../middleware/rbac.js';

// Equipos deportivos (crm.equipo + crm.miembro_equipo).
// Montado bajo staffOnly en routes/index.ts.
export const categoriesRouter = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Verifica que el equipo existe, no está borrado y pertenece al negocio. */
async function findTeam(id: string, businessId: string | undefined) {
  return prisma.team.findFirst({
    where: { id, businessId, eliminadoEn: null },
  });
}

// ---------------------------------------------------------------------------
// GET /categories — lista paginada de equipos del negocio.
// ---------------------------------------------------------------------------
categoriesRouter.get('/', async (req: AuthedRequest, res: Response) => {
  const { page, limit } = parsePagination(req.query as Record<string, unknown>);
  const where = { businessId: req.businessId, eliminadoEn: null };

  const [rows, total] = await Promise.all([
    prisma.team.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { _count: { select: { members: true } } },
    }),
    prisma.team.count({ where }),
  ]);

  res.json({
    items: rows.map((t) => ({
      id: t.id,
      nombre: t.nombre,
      deporte: t.deporte,
      temporada: t.temporada ?? null,
      descripcion: t.descripcion ?? null,
      color: t.color ?? null,
      colorVisitante: t.colorVisitante ?? null,
      totalMiembros: t._count.members,
    })),
    total,
    page,
    limit,
  });
});

// ---------------------------------------------------------------------------
// POST /categories — crear equipo.
// ---------------------------------------------------------------------------
categoriesRouter.post('/', staffOnly as unknown as (req: Request, res: Response, next: NextFunction) => void, async (req: AuthedRequest, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (!body.nombre || typeof body.nombre !== 'string' || !body.nombre.trim()) {
    return res.status(422).json({ error: { code: 'invalid', message: 'Falta nombre' } });
  }

  const team = await prisma.team.create({
    data: {
      businessId: req.businessId!,
      nombre: (body.nombre as string).trim(),
      deporte: (body.deporte as string | undefined) as never ?? undefined,
      temporada: (body.temporada as string | undefined) ?? undefined,
      descripcion: (body.descripcion as string | undefined) ?? undefined,
      color: (body.color as string | undefined) ?? undefined,
      colorVisitante: (body.colorVisitante as string | undefined) ?? undefined,
    },
  });
  return res.status(201).json(team);
});

// ---------------------------------------------------------------------------
// GET /categories/:id — detalle del equipo con miembros.
// ---------------------------------------------------------------------------
categoriesRouter.get('/:id', async (req: AuthedRequest, res: Response) => {
  const team = await prisma.team.findFirst({
    where: { id: req.params.id, businessId: req.businessId, eliminadoEn: null },
    include: {
      members: {
        include: {
          employee: {
            select: { id: true, nombre: true, apellido: true, rol: true, imagenUrl: true },
          },
          customer: {
            select: { id: true, nombre: true, apellido: true, fechaNacimiento: true, imagenUrl: true },
          },
        },
      },
    },
  });
  if (!team) return res.status(404).json({ error: { code: 'not_found', message: 'Equipo no encontrado' } });
  return res.json(team);
});

// ---------------------------------------------------------------------------
// PATCH /categories/:id — editar campos del equipo.
// ---------------------------------------------------------------------------
categoriesRouter.patch('/:id', staffOnly as unknown as (req: Request, res: Response, next: NextFunction) => void, async (req: AuthedRequest, res: Response) => {
  const existing = await findTeam(req.params.id, req.businessId);
  if (!existing) return res.status(404).json({ error: { code: 'not_found', message: 'Equipo no encontrado' } });

  const body = (req.body ?? {}) as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  if (typeof body.nombre === 'string' && body.nombre.trim()) data.nombre = body.nombre.trim();
  if (body.deporte !== undefined) data.deporte = body.deporte;
  if (body.temporada !== undefined) data.temporada = body.temporada;
  if (body.descripcion !== undefined) data.descripcion = body.descripcion;
  if (body.color !== undefined) data.color = body.color;
  if (body.colorVisitante !== undefined) data.colorVisitante = body.colorVisitante;

  const updated = await prisma.team.update({ where: { id: req.params.id }, data });
  return res.json(updated);
});

// ---------------------------------------------------------------------------
// DELETE /categories/:id — soft delete (set eliminadoEn).
// ---------------------------------------------------------------------------
categoriesRouter.delete('/:id', staffOnly as unknown as (req: Request, res: Response, next: NextFunction) => void, async (req: AuthedRequest, res: Response) => {
  const existing = await findTeam(req.params.id, req.businessId);
  if (!existing) return res.status(404).json({ error: { code: 'not_found', message: 'Equipo no encontrado' } });

  await prisma.team.update({ where: { id: req.params.id }, data: { eliminadoEn: new Date() } });
  return res.status(204).end();
});

// ---------------------------------------------------------------------------
// POST /categories/:id/members — añadir miembro al equipo.
// Validación XOR: exactamente uno de employeeId o customerId debe estar presente.
// Validación menor de edad: si customerId y edad < 18, exige ≥1 contacto de emergencia.
// ---------------------------------------------------------------------------
categoriesRouter.post('/:id/members', staffOnly as unknown as (req: Request, res: Response, next: NextFunction) => void, async (req: AuthedRequest, res: Response) => {
  const team = await findTeam(req.params.id, req.businessId);
  if (!team) return res.status(404).json({ error: { code: 'not_found', message: 'Equipo no encontrado' } });

  const body = (req.body ?? {}) as Record<string, unknown>;
  const { employeeId, customerId, rol, dorsal, posicion, activoDesde, contactosEmergencia } = body as {
    employeeId?: string;
    customerId?: string;
    rol?: string;
    dorsal?: string;
    posicion?: string;
    activoDesde?: string;
    contactosEmergencia?: unknown[];
  };

  // XOR validation
  if (!employeeId && !customerId) {
    return res.status(400).json({ error: { code: 'XOR_REQUIRED', message: 'Debe indicar employeeId o customerId' } });
  }
  if (employeeId && customerId) {
    return res.status(400).json({ error: { code: 'XOR_REQUIRED', message: 'Solo uno de employeeId o customerId' } });
  }

  if (!rol || typeof rol !== 'string' || !rol.trim()) {
    return res.status(422).json({ error: { code: 'invalid', message: 'Falta rol' } });
  }

  // Validación menor de edad (solo cuando customerId presente)
  if (customerId) {
    const socio = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { fechaNacimiento: true },
    });
    if (socio?.fechaNacimiento) {
      const edad = Math.floor(
        (Date.now() - socio.fechaNacimiento.getTime()) / (365.25 * 24 * 60 * 60 * 1000),
      );
      const contactos = (contactosEmergencia ?? []) as unknown[];
      if (edad < 18 && contactos.length === 0) {
        return res.status(422).json({
          error: { code: 'MINOR_NO_CONTACTS', message: 'Menor de edad requiere al menos 1 contacto de emergencia' },
        });
      }
    }
  }

  const member = await prisma.teamMember.create({
    data: {
      teamId: team.id,
      employeeId: employeeId ?? null,
      customerId: customerId ?? null,
      rol: rol.trim(),
      dorsal: dorsal ?? null,
      posicion: posicion ?? null,
      activoDesde: activoDesde ? new Date(activoDesde) : null,
      contactosEmergencia: (contactosEmergencia ?? []) as never,
    },
  });
  return res.status(201).json(member);
});

// ---------------------------------------------------------------------------
// PATCH /categories/:id/members/:memberId — editar miembro.
// ---------------------------------------------------------------------------
categoriesRouter.patch('/:id/members/:memberId', staffOnly as unknown as (req: Request, res: Response, next: NextFunction) => void, async (req: AuthedRequest, res: Response) => {
  const team = await findTeam(req.params.id, req.businessId);
  if (!team) return res.status(404).json({ error: { code: 'not_found', message: 'Equipo no encontrado' } });

  const existing = await prisma.teamMember.findFirst({ where: { id: req.params.memberId, teamId: team.id } });
  if (!existing) return res.status(404).json({ error: { code: 'not_found', message: 'Miembro no encontrado' } });

  const body = (req.body ?? {}) as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  if (typeof body.rol === 'string' && body.rol.trim()) data.rol = body.rol.trim();
  if (body.dorsal !== undefined) data.dorsal = body.dorsal;
  if (body.posicion !== undefined) data.posicion = body.posicion;
  if (body.contactosEmergencia !== undefined) data.contactosEmergencia = body.contactosEmergencia as never;
  if (body.activoDesde !== undefined) data.activoDesde = body.activoDesde ? new Date(body.activoDesde as string) : null;

  const updated = await prisma.teamMember.update({ where: { id: req.params.memberId }, data });
  return res.json(updated);
});

// ---------------------------------------------------------------------------
// DELETE /categories/:id/members/:memberId — eliminar miembro del equipo (hard delete).
// ---------------------------------------------------------------------------
categoriesRouter.delete('/:id/members/:memberId', staffOnly as unknown as (req: Request, res: Response, next: NextFunction) => void, async (req: AuthedRequest, res: Response) => {
  const team = await findTeam(req.params.id, req.businessId);
  if (!team) return res.status(404).json({ error: { code: 'not_found', message: 'Equipo no encontrado' } });

  const existing = await prisma.teamMember.findFirst({ where: { id: req.params.memberId, teamId: team.id } });
  if (!existing) return res.status(404).json({ error: { code: 'not_found', message: 'Miembro no encontrado' } });

  await prisma.teamMember.delete({ where: { id: req.params.memberId } });
  return res.status(204).end();
});
