import { Router, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import type { AuthedRequest } from '../middleware/types.js';
import { splitNombre } from '../lib/nombre.js';
import { parsePagination } from '../lib/pagination.js';

// Agenda de contactos comerciales (leads / prospectos) — paridad con Agents Agency
// (crm-operaos WU4). Multi-tenant: todo se filtra/crea con el businessId del token.
// Código de negocio pc-NN autogenerado y secuencial por negocio. Soft delete (eliminadoEn).
export const contactosRouter = Router();

export const CONTACTO_TIPOS = ['lead', 'prospecto'] as const;
export const CONTACTADO_VALORES = ['si', 'no', 'nc'] as const;
export type ContactoTipo = (typeof CONTACTO_TIPOS)[number];
export type ContactadoEstado = (typeof CONTACTADO_VALORES)[number];

export const createContactoSchema = z.object({
  tipo: z.enum(CONTACTO_TIPOS).default('prospecto'),
  nombre: z.string().trim().min(1, 'El nombre es obligatorio'),
  telefono: z.string().trim().min(1).optional(),
  email: z.string().trim().email('Email no válido').optional(),
  sector: z.string().trim().optional(),
  direccion: z.string().trim().optional(),
  peticion: z.string().trim().optional(),
  contactado: z.enum(CONTACTADO_VALORES).optional(),
});

export const updateContactoSchema = z.object({
  tipo: z.enum(CONTACTO_TIPOS).optional(),
  nombre: z.string().trim().min(1).optional(),
  telefono: z.string().trim().nullable().optional(),
  email: z.string().trim().email('Email no válido').nullable().optional(),
  sector: z.string().trim().nullable().optional(),
  direccion: z.string().trim().nullable().optional(),
  peticion: z.string().trim().nullable().optional(),
  contactado: z.enum(CONTACTADO_VALORES).optional(),
});

export const convertContactosSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, 'Selecciona al menos un contacto'),
});

/**
 * Default de contactado: SIEMPRE "no" para nuevos leads y prospectos (entran
 * pendientes de contactar). Un valor explícito lo respeta. (Paridad AA.)
 */
export function defaultContactado(explicit?: ContactadoEstado): ContactadoEstado {
  return explicit ?? 'no';
}

/**
 * Calcula el patch de contactadoEn según el cambio de estado:
 *  - pasa a "si" → sella la fecha (solo si no estaba ya sellada)
 *  - pasa a "no"/"nc" → limpia la fecha
 *  - sin cambio de contactado → no toca contactadoEn
 */
export function contactadoEnPatch(
  nuevo: ContactadoEstado | undefined,
  actual: { contactadoEn: Date | null },
  now: Date = new Date(),
): { contactadoEn?: Date | null } {
  if (nuevo === undefined) return {};
  if (nuevo === 'si') return actual.contactadoEn ? {} : { contactadoEn: now };
  return { contactadoEn: null };
}

/** Construye el where de listado (tenant + soft delete + filtros). Función pura, testeable. */
export function buildContactosWhere(
  businessId: string | undefined,
  q: { tipo?: ContactoTipo; contactado?: ContactadoEstado; search?: string },
): Record<string, unknown> {
  const where: Record<string, unknown> = { businessId, eliminadoEn: null };
  if (q.tipo) where.tipo = q.tipo;
  if (q.contactado) where.contactado = q.contactado;
  if (q.search) {
    where.OR = [
      { nombre: { contains: q.search, mode: 'insensitive' as const } },
      { codigo: { contains: q.search, mode: 'insensitive' as const } },
      { email: { contains: q.search, mode: 'insensitive' as const } },
      { telefono: { contains: q.search, mode: 'insensitive' as const } },
      { sector: { contains: q.search, mode: 'insensitive' as const } },
    ];
  }
  return where;
}

/** Siguiente número de código pc-NN a partir del máximo actual del negocio. Función pura. */
export function nextContactoCodigo(codigos: string[]): string {
  const max = codigos.reduce((m, c) => Math.max(m, parseInt(c.replace(/\D/g, ''), 10) || 0), 0);
  return `pc-${String(max + 1).padStart(2, '0')}`;
}

async function computeNextCodigo(businessId: string | undefined): Promise<string> {
  const rows = await prisma.contacto.findMany({ where: { businessId }, select: { codigo: true } });
  return nextContactoCodigo(rows.map((r) => r.codigo));
}

// GET / → listado paginado { items, total, page, limit }. Filtros ?tipo= y ?contactado=.
contactosRouter.get('/', async (req: AuthedRequest, res: Response) => {
  const q = req.query as Record<string, unknown>;
  const { page, limit, search } = parsePagination(q);
  const tipo = CONTACTO_TIPOS.includes(q.tipo as ContactoTipo) ? (q.tipo as ContactoTipo) : undefined;
  const contactado = CONTACTADO_VALORES.includes(q.contactado as ContactadoEstado)
    ? (q.contactado as ContactadoEstado)
    : undefined;

  const where = buildContactosWhere(req.businessId, { tipo, contactado, search });
  const [items, total] = await Promise.all([
    prisma.contacto.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
    prisma.contacto.count({ where }),
  ]);
  res.json({ items, total, page, limit });
});

// GET /pending-count → contactos pendientes de contactar (contactado != 'si'). Antes de /:id.
contactosRouter.get('/pending-count', async (req: AuthedRequest, res: Response) => {
  const count = await prisma.contacto.count({
    where: { businessId: req.businessId, eliminadoEn: null, contactado: { not: 'si' } },
  });
  res.json({ count });
});

contactosRouter.get('/:id', async (req: AuthedRequest, res: Response) => {
  const row = await prisma.contacto.findFirst({
    where: { id: req.params.id, businessId: req.businessId, eliminadoEn: null },
  });
  if (!row) return res.status(404).json({ error: { code: 'not_found', message: 'No encontrado' } });
  res.json(row);
});

contactosRouter.post('/', async (req: AuthedRequest, res: Response) => {
  const parsed = createContactoSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(422).json({ error: { code: 'invalid', message: 'Datos no válidos', details: parsed.error.flatten() } });
  const d = parsed.data;
  const contactado = defaultContactado(d.contactado);
  // Reintenta ante colisión de código (@@unique negocio+codigo) en alta concurrente.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const row = await prisma.contacto.create({
        data: {
          businessId: req.businessId!,
          codigo: await computeNextCodigo(req.businessId),
          tipo: d.tipo,
          nombre: d.nombre,
          telefono: d.telefono ?? null,
          email: d.email ?? null,
          sector: d.sector ?? null,
          direccion: d.direccion ?? null,
          peticion: d.peticion ?? null,
          contactado,
          contactadoEn: contactado === 'si' ? new Date() : null,
        },
      });
      return res.status(201).json(row);
    } catch (e: unknown) {
      if ((e as { code?: string }).code === 'P2002' && attempt < 2) continue;
      throw e;
    }
  }
});

contactosRouter.patch('/:id', async (req: AuthedRequest, res: Response) => {
  const parsed = updateContactoSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(422).json({ error: { code: 'invalid', message: 'Datos no válidos', details: parsed.error.flatten() } });
  const current = await prisma.contacto.findFirst({
    where: { id: req.params.id, businessId: req.businessId, eliminadoEn: null },
    select: { contactadoEn: true },
  });
  if (!current) return res.status(404).json({ error: { code: 'not_found', message: 'No encontrado' } });

  const d = parsed.data;
  const row = await prisma.contacto.update({
    where: { id: req.params.id },
    data: {
      ...(d.tipo !== undefined && { tipo: d.tipo }),
      ...(d.nombre !== undefined && { nombre: d.nombre }),
      ...(d.telefono !== undefined && { telefono: d.telefono }),
      ...(d.email !== undefined && { email: d.email }),
      ...(d.sector !== undefined && { sector: d.sector }),
      ...(d.direccion !== undefined && { direccion: d.direccion }),
      ...(d.peticion !== undefined && { peticion: d.peticion }),
      ...(d.contactado !== undefined && { contactado: d.contactado }),
      ...contactadoEnPatch(d.contactado, current),
    },
  });
  res.json(row);
});

contactosRouter.delete('/:id', async (req: AuthedRequest, res: Response) => {
  // Soft delete: sella eliminadoEn (se conserva el historial). Idempotente vía updateMany.
  const { count } = await prisma.contacto.updateMany({
    where: { id: req.params.id, businessId: req.businessId, eliminadoEn: null },
    data: { eliminadoEn: new Date() },
  });
  if (count === 0) return res.status(404).json({ error: { code: 'not_found', message: 'No encontrado' } });
  res.status(204).end();
});

// POST /convert → convierte contactos seleccionados en clientes (crm.cliente). Best-effort:
// por cada contacto crea un Customer (datos copiados) y vincula/soft-borra el contacto.
contactosRouter.post('/convert', async (req: AuthedRequest, res: Response) => {
  const parsed = convertContactosSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(422).json({ error: { code: 'invalid', message: 'Datos no válidos', details: parsed.error.flatten() } });

  const contactos = await prisma.contacto.findMany({
    where: { id: { in: parsed.data.ids }, businessId: req.businessId, eliminadoEn: null },
  });
  if (contactos.length === 0) return res.status(404).json({ error: { code: 'not_found', message: 'No se encontraron contactos' } });

  const created: Array<{ contactoId: string; clienteId: string }> = [];
  const failed: Array<{ contactoId: string; reason: string }> = [];

  for (const c of contactos) {
    if (c.clienteId) {
      failed.push({ contactoId: c.id, reason: 'Ya estaba vinculado a un cliente' });
      continue;
    }
    try {
      const { nombre, apellido } = splitNombre(c.nombre);
      const cliente = await prisma.$transaction(async (tx) => {
        const nuevo = await tx.customer.create({
          data: {
            businessId: req.businessId!,
            nombre,
            apellido,
            telefono: c.telefono ?? null,
            email: c.email ?? null,
            direccion: c.direccion ?? null,
            notas: c.sector ? `Sector: ${c.sector}` : null,
            tipoRegistro: 'CLIENTE',
          },
        });
        // El contacto sale de la agenda: se vincula al cliente (historial) y se soft-borra.
        await tx.contacto.update({ where: { id: c.id }, data: { clienteId: nuevo.id, eliminadoEn: new Date() } });
        return nuevo;
      });
      created.push({ contactoId: c.id, clienteId: cliente.id });
    } catch {
      failed.push({ contactoId: c.id, reason: 'No se pudo crear el cliente' });
    }
  }

  res.json({ created, failed });
});
