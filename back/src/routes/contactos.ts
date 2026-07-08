import { Router, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import type { AuthedRequest } from '../middleware/types.js';
import { requireRole } from '../middleware/rbac.js';
import { splitNombre } from '../lib/nombre.js';
import { parsePagination } from '../lib/pagination.js';
import { dayRange } from '../lib/dateRange.js';
import { resolveGeocoder } from '../lib/geo/index.js';

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
  // Dirección estructurada (crm-operaos 9.2): número, piso, código postal y localidad opcionales.
  numero: z.string().trim().optional(),
  piso: z.string().trim().optional(),
  codigoPostal: z.string().trim().optional(),
  localidad: z.string().trim().optional(),
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
  numero: z.string().trim().nullable().optional(),
  piso: z.string().trim().nullable().optional(),
  codigoPostal: z.string().trim().nullable().optional(),
  localidad: z.string().trim().nullable().optional(),
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

// Re-exportado para no romper imports existentes de `dayRange` desde este módulo.
export { dayRange };

// ---------- Geolocalización de contactos (crm-operaos 9.12) ----------
// Contacto NO tiene provincia (fuera del alcance de su dirección estructurada), así que la
// query de geocodificación usa direccion/numero/localidad/codigoPostal. Mismo puerto y
// throttle que la cartera de clientes (resolveGeocoder()), para consistencia y para que
// el botón "Re-geolocalizar" del mapa comercial cubra clientes y contactos por igual.

export type ContactoGeoStatus = 'PENDING' | 'OK' | 'FAILED';

interface ContactoAddress {
  direccion?: string | null;
  numero?: string | null;
  localidad?: string | null;
  codigoPostal?: string | null;
}

/** True si el contacto tiene dirección geocodificable (calle o localidad o código postal). Pura. */
export function contactoTieneDireccion(c: ContactoAddress): boolean {
  return (['direccion', 'localidad', 'codigoPostal'] as const)
    .some((k) => typeof c[k] === 'string' && String(c[k]).trim());
}

/** Mapea el resultado del geocoder a los campos geo a persistir. Pura y testeable. */
export function contactoGeoFields(
  hasAddress: boolean,
  geo: { lat: number; lng: number } | null,
): { latitud?: number; longitud?: number; geoEstado?: ContactoGeoStatus } {
  if (!hasAddress) return {}; // sin dirección → no se toca (queda PENDING/estado previo)
  if (geo) return { latitud: geo.lat, longitud: geo.lng, geoEstado: 'OK' };
  return { geoEstado: 'FAILED' };
}

/**
 * Geocodifica un contacto (best-effort, nunca lanza). Devuelve los campos geo a persistir:
 *  - `{}` si no hay dirección (no se altera el estado geo actual),
 *  - `{ geoEstado: 'FAILED' }` si la dirección no resuelve,
 *  - `{ latitud, longitud, geoEstado: 'OK' }` si resuelve.
 */
export async function geocodeContacto(
  c: ContactoAddress,
): Promise<{ latitud?: number; longitud?: number; geoEstado?: ContactoGeoStatus }> {
  const hasAddress = contactoTieneDireccion(c);
  if (!hasAddress) return {};
  const geo = await resolveGeocoder().geocode({
    direccion: c.direccion ?? null,
    numero: c.numero ?? null,
    localidad: c.localidad ?? null,
    provincia: null,
    codigoPostal: c.codigoPostal ?? null,
  });
  return contactoGeoFields(true, geo);
}

/**
 * Construye el where de listado (tenant + soft delete + búsqueda de texto). Función pura,
 * testeable. `tipo`/`contactado` se conservan como filtros del back (los consume el
 * badge de pendientes y posibles integraciones); la tabla de contactos ya no los envía.
 */
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

// Ordenación por cabecera de la tabla de contactos. Whitelist de campos ordenables
// (Código/Tipo/Nombre/Email/Sector/Fecha de alta). Sin `sort` válido → orden por defecto
// (createdAt desc, sin cambiar el comportamiento previo). Exportada para tests.
const CONTACTO_SORTABLE = new Set(['codigo', 'tipo', 'nombre', 'email', 'sector', 'createdAt']);
export function buildContactosOrderBy(q: Record<string, unknown>): Record<string, 'asc' | 'desc'> {
  const sort = typeof q.sort === 'string' && CONTACTO_SORTABLE.has(q.sort) ? q.sort : null;
  if (!sort) return { createdAt: 'desc' };
  const order = q.order === 'asc' ? 'asc' : 'desc';
  return { [sort]: order };
}

/** Siguiente número de código pc-NN a partir del máximo actual del negocio. Función pura. */
export function nextContactoCodigo(codigos: string[]): string {
  const max = codigos.reduce((m, c) => Math.max(m, parseInt(c.replace(/\D/g, ''), 10) || 0), 0);
  return `pc-${String(max + 1).padStart(2, '0')}`;
}

export async function computeNextCodigo(businessId: string | undefined): Promise<string> {
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
  const orderBy = buildContactosOrderBy(q);
  const [items, total] = await Promise.all([
    prisma.contacto.findMany({ where, orderBy, skip: (page - 1) * limit, take: limit }),
    prisma.contacto.count({ where }),
  ]);
  res.json({ items, total, page, limit });
});

/**
 * Where del contador de pendientes: SIEMPRE acotado por negocio (nunca un conteo
 * global). Función pura y testeable, igual que `buildContactosWhere` — separada
 * de esta para no arrastrar filtros de listado (tipo/búsqueda) que no aplican aquí.
 */
export function buildPendingCountWhere(businessId: string | undefined): Record<string, unknown> {
  return { businessId, eliminadoEn: null, contactado: { not: 'si' } };
}

// GET /pending-count → contactos pendientes de contactar (contactado != 'si'). Antes de /:id.
// Consumido por el badge del sidebar (front/components/layout/sidebar.tsx).
contactosRouter.get('/pending-count', async (req: AuthedRequest, res: Response) => {
  const count = await prisma.contacto.count({ where: buildPendingCountWhere(req.businessId) });
  res.json({ count });
});

// Lote acotado por invocación (mismo criterio que /customers/geocode/rerun): evita bloquear
// el proceso con negocios grandes; el resto queda para una invocación posterior.
const CONTACTO_GEOCODE_BATCH = 60;

// POST /contactos/geocode/rerun (gestor): geocodifica contactos PENDING/FAILED con dirección
// del negocio. `force=true` incluye también los OK (corrige coords sembradas a mano).
// Secuencial — reutiliza resolveGeocoder() (throttle Nominatim ≥1s). Nunca lanza: un fallo
// deja al contacto en FAILED, visible en "pendientes de geolocalizar". Antes de /:id.
contactosRouter.post('/geocode/rerun', requireRole('ADMIN', 'MANAGER'), async (req: AuthedRequest, res: Response) => {
  const force = req.body?.force === true;
  const candidates = await prisma.contacto.findMany({
    where: {
      businessId: req.businessId,
      eliminadoEn: null,
      ...(force ? {} : { geoEstado: { in: ['PENDING', 'FAILED'] } }),
    },
    select: { id: true, direccion: true, numero: true, localidad: true, codigoPostal: true },
    orderBy: { createdAt: 'asc' },
    take: CONTACTO_GEOCODE_BATCH,
  });

  let ok = 0;
  let failed = 0;
  let skipped = 0;
  for (const c of candidates) {
    const geo = await geocodeContacto(c);
    if (geo.geoEstado === undefined) { skipped += 1; continue; } // sin dirección
    await prisma.contacto.update({ where: { id: c.id }, data: geo });
    if (geo.geoEstado === 'OK') ok += 1; else failed += 1;
  }
  res.json({ ok, failed, skipped });
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
  // Geocodifica una sola vez (fuera del retry de código): el contacto entra al mapa
  // si tiene dirección; si no resuelve queda FAILED (visible en "pendientes de geolocalizar").
  const geo = await geocodeContacto(d);
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
          numero: d.numero ?? null,
          piso: d.piso ?? null,
          codigoPostal: d.codigoPostal ?? null,
          localidad: d.localidad ?? null,
          peticion: d.peticion ?? null,
          contactado,
          contactadoEn: contactado === 'si' ? new Date() : null,
          ...geo,
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
    select: { contactadoEn: true, direccion: true, numero: true, localidad: true, codigoPostal: true },
  });
  if (!current) return res.status(404).json({ error: { code: 'not_found', message: 'No encontrado' } });

  const d = parsed.data;
  // Re-geocodifica sólo si cambió algún campo de dirección; usa el valor entrante o el actual
  // para cada campo (misma política que el alta/actualización de clientes).
  const addressKeys = ['direccion', 'numero', 'localidad', 'codigoPostal'] as const;
  const addressChanged = addressKeys.some((k) => k in d);
  const geo = addressChanged
    ? await geocodeContacto({
        direccion: d.direccion !== undefined ? d.direccion : current.direccion,
        numero: d.numero !== undefined ? d.numero : current.numero,
        localidad: d.localidad !== undefined ? d.localidad : current.localidad,
        codigoPostal: d.codigoPostal !== undefined ? d.codigoPostal : current.codigoPostal,
      })
    : {};
  const row = await prisma.contacto.update({
    where: { id: req.params.id },
    data: {
      ...(d.tipo !== undefined && { tipo: d.tipo }),
      ...(d.nombre !== undefined && { nombre: d.nombre }),
      ...(d.telefono !== undefined && { telefono: d.telefono }),
      ...(d.email !== undefined && { email: d.email }),
      ...(d.sector !== undefined && { sector: d.sector }),
      ...(d.direccion !== undefined && { direccion: d.direccion }),
      ...(d.numero !== undefined && { numero: d.numero }),
      ...(d.piso !== undefined && { piso: d.piso }),
      ...(d.codigoPostal !== undefined && { codigoPostal: d.codigoPostal }),
      ...(d.localidad !== undefined && { localidad: d.localidad }),
      ...(d.peticion !== undefined && { peticion: d.peticion }),
      ...(d.contactado !== undefined && { contactado: d.contactado }),
      ...contactadoEnPatch(d.contactado, current),
      ...geo,
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
            numero: c.numero ?? null,
            piso: c.piso ?? null,
            codigoPostal: c.codigoPostal ?? null,
            localidad: c.localidad ?? null,
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
