import { Router, type Response } from 'express';
import { Prisma } from '../lib/generated/prisma/client.js';
import { prisma } from '../prisma.js';
import type { AuthedRequest } from '../middleware/types.js';
import { splitNombre, joinNombre, pickFields } from '../lib/nombre.js';
import { parsePagination } from '../lib/pagination.js';
import { resolveGeocoder, haversineKm, isValidCoord } from '../lib/geo/index.js';
import { planImport, type ImportRow, type ExistingCustomer } from '../lib/comercial/import.js';

// Clientes (crm.cliente) en CASTELLANO, con agregados calculados (visitas, gastoTotal,
// ultimaVisita, segmento) y campos de comercial de campo (geo, estado de visita, ABC, tipo).
export const customersRouter = Router();

// Regla de segmento (derivada; no se almacena).
function segmentoDe(visitas: number, gastoTotal: number, ultima: Date | null): string {
  if (visitas === 0) return 'Nuevo';
  if (gastoTotal >= 300) return 'VIP';
  if (ultima && Date.now() - ultima.getTime() > 90 * 86_400_000) return 'Inactivo';
  return 'Recurrente';
}

// Columnas editables (los derivados se ignoran al escribir). Incluye comercial de campo.
const INPUT = [
  'email', 'telefono', 'direccion', 'notas',
  'localidad', 'provincia', 'codigoPostal',
  'categoriaAbc', 'estadoVisitaId', 'tipoRegistro', 'proximaAccionEn',
] as const;

function buildData(body: Record<string, unknown>): Record<string, unknown> {
  const data = pickFields(body, INPUT);
  if (typeof body.nombre === 'string') {
    const { nombre, apellido } = splitNombre(body.nombre);
    data.nombre = nombre;
    data.apellido = apellido;
  }
  if (data.proximaAccionEn) data.proximaAccionEn = new Date(String(data.proximaAccionEn));
  return data;
}

// Resuelve lat/lng + geo_estado. Coordenadas manuales tienen prioridad. Si hay dirección y no
// hay coords → geocodifica (OK/FAILED). Nunca lanza: un fallo externo no rompe el alta (RNF-10).
async function resolveGeo(body: Record<string, unknown>, data: Record<string, unknown>): Promise<void> {
  const lat = body.latitud !== undefined ? Number(body.latitud) : undefined;
  const lng = body.longitud !== undefined ? Number(body.longitud) : undefined;
  if (lat !== undefined && lng !== undefined && isValidCoord(lat, lng)) {
    data.latitud = lat; data.longitud = lng; data.geoEstado = 'OK';
    return;
  }
  const hasAddress = ['direccion', 'localidad', 'provincia', 'codigoPostal'].some((k) => typeof body[k] === 'string' && String(body[k]).trim());
  if (!hasAddress) return; // sin dirección ni coords → queda PENDING (default) o intacto
  const geo = await resolveGeocoder().geocode({
    direccion: (body.direccion as string) ?? null,
    localidad: (body.localidad as string) ?? null,
    provincia: (body.provincia as string) ?? null,
    codigoPostal: (body.codigoPostal as string) ?? null,
  });
  if (geo) { data.latitud = geo.lat; data.longitud = geo.lng; data.geoEstado = 'OK'; }
  else { data.geoEstado = 'FAILED'; }
}

customersRouter.get('/', async (req: AuthedRequest, res: Response) => {
  const businessId = req.businessId;
  const q = req.query as Record<string, unknown>;
  const { page, limit, search } = parsePagination(q);

  const searchWhere = search ? {
    OR: [
      { nombre:   { contains: search, mode: 'insensitive' as const } },
      { apellido: { contains: search, mode: 'insensitive' as const } },
      { email:    { contains: search, mode: 'insensitive' as const } },
    ],
  } : {};

  // Filtros de comercial de campo (RF-14).
  const filters: Record<string, unknown> = {};
  if (typeof q.estadoVisitaId === 'string') filters.estadoVisitaId = q.estadoVisitaId;
  if (q.categoriaAbc === 'A' || q.categoriaAbc === 'B' || q.categoriaAbc === 'C') filters.categoriaAbc = q.categoriaAbc;
  if (q.tipoRegistro === 'CLIENTE' || q.tipoRegistro === 'PROSPECTO') filters.tipoRegistro = q.tipoRegistro;
  if (typeof q.zona === 'string' && q.zona.trim()) {
    const zona = q.zona.trim();
    Object.assign(filters, { OR: [
      { localidad: { contains: zona, mode: 'insensitive' as const } },
      { provincia: { contains: zona, mode: 'insensitive' as const } },
      { codigoPostal: { contains: zona, mode: 'insensitive' as const } },
    ] });
  }

  const where = { businessId, eliminadoEn: null, ...searchWhere, ...filters };

  // Cercanía (RF-18): si hay ?near=lat,lng, ordena por distancia (sólo clientes con coords).
  const near = parseNear(q.near);
  if (near) {
    const radiusKm = Number(q.radiusKm) > 0 ? Number(q.radiusKm) : undefined;
    const all = await prisma.customer.findMany({
      where: { ...where, latitud: { not: null }, longitud: { not: null } },
      include: { estadoVisita: true },
      take: 1000,
    });
    const withDist = all
      .map((c) => ({ c, dist: haversineKm(near, { lat: c.latitud!, lng: c.longitud! }) }))
      .filter((x) => radiusKm === undefined || x.dist <= radiusKm)
      .sort((a, b) => a.dist - b.dist);
    const total = withDist.length;
    const pageSlice = withDist.slice((page - 1) * limit, page * limit);
    const ids = pageSlice.map((x) => x.c.id);
    const aggs = await loadAggregates(businessId, ids);
    const items = pageSlice.map((x) => shapeCustomer(x.c, aggs, x.dist));
    return res.json({ items, total, page, limit });
  }

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: { estadoVisita: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.customer.count({ where }),
  ]);

  const ids = customers.map((c) => c.id);
  const aggs = await loadAggregates(businessId, ids);
  const items = customers.map((c) => shapeCustomer(c, aggs));
  res.json({ items, total, page, limit });
});

customersRouter.post('/', async (req: AuthedRequest, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const data = buildData(body);
  if (!data.nombre) return res.status(422).json({ error: { code: 'invalid', message: 'Falta nombre' } });
  await resolveGeo(body, data);
  const row = await prisma.customer.create({
    data: { ...data, businessId: req.businessId } as unknown as Prisma.CustomerUncheckedCreateInput,
  });
  res.status(201).json(row);
});

customersRouter.patch('/:id', async (req: AuthedRequest, res: Response) => {
  const existing = await prisma.customer.findFirst({ where: { id: req.params.id, businessId: req.businessId, eliminadoEn: null } });
  if (!existing) return res.status(404).json({ error: { code: 'not_found', message: 'No encontrado' } });
  const body = (req.body ?? {}) as Record<string, unknown>;
  const data = buildData(body);
  // Sólo re-geocodifica si cambian dirección o coords en el body.
  if (['latitud', 'longitud', 'direccion', 'localidad', 'provincia', 'codigoPostal'].some((k) => k in body)) {
    await resolveGeo(body, data);
  }
  const row = await prisma.customer.update({
    where: { id: req.params.id },
    data: data as Prisma.CustomerUncheckedUpdateInput,
  });
  res.json(row);
});

customersRouter.delete('/:id', async (req: AuthedRequest, res: Response) => {
  const existing = await prisma.customer.findFirst({ where: { id: req.params.id, businessId: req.businessId, eliminadoEn: null } });
  if (!existing) return res.status(404).json({ error: { code: 'not_found', message: 'No encontrado' } });
  await prisma.customer.update({ where: { id: req.params.id }, data: { eliminadoEn: new Date() } });
  res.status(204).end();
});

// Convierte un prospecto en cliente conservando su historial (notas, visitas) (RF-17).
customersRouter.post('/:id/convert', async (req: AuthedRequest, res: Response) => {
  const existing = await prisma.customer.findFirst({ where: { id: req.params.id, businessId: req.businessId, eliminadoEn: null } });
  if (!existing) return res.status(404).json({ error: { code: 'not_found', message: 'No encontrado' } });
  const row = await prisma.customer.update({ where: { id: req.params.id }, data: { tipoRegistro: 'CLIENTE' } });
  res.json(row);
});

// Importación con detección de duplicados (RF-03). Recibe filas ya parseadas del CSV/XLSX
// en el front. `force` crea también los marcados como duplicados.
customersRouter.post('/import', async (req: AuthedRequest, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const rows = Array.isArray(body.rows) ? (body.rows as ImportRow[]) : [];
  const force = body.force === true;
  if (rows.length === 0) return res.status(422).json({ error: { code: 'invalid', message: 'Sin filas' } });

  const existing = await prisma.customer.findMany({
    where: { businessId: req.businessId, eliminadoEn: null },
    select: { id: true, nombre: true, apellido: true, telefono: true, direccion: true },
  });
  const plan = planImport(rows, existing as ExistingCustomer[]);
  const aCrear = force ? [...plan.nuevos, ...plan.duplicados.map((d) => d.row)] : plan.nuevos;

  let creados = 0;
  for (const r of aCrear) {
    const { nombre, apellido } = splitNombre(r.nombre);
    // Geocodifica cada fila con dirección para que el cliente importado caiga en el mapa.
    // Si no resuelve, queda geoEstado=FAILED y aparece en "pendientes de geolocalizar" (RF-05).
    const geo: Record<string, unknown> = {};
    await resolveGeo(r as unknown as Record<string, unknown>, geo);
    await prisma.customer.create({
      data: {
        businessId: req.businessId!, nombre, apellido,
        telefono: r.telefono ?? null, email: r.email ?? null, direccion: r.direccion ?? null,
        localidad: r.localidad ?? null, provincia: r.provincia ?? null, codigoPostal: r.codigoPostal ?? null,
        ...geo,
      },
    });
    creados += 1;
  }
  res.status(201).json({ creados, duplicados: plan.duplicados, totalFilas: rows.length });
});

// ---------- helpers ----------
interface Aggregates {
  bMap: Map<string, { _count: { _all: number }; _max: { startAt: Date | null } }>;
  sMap: Map<string, { _sum: { total: Prisma.Decimal | null } }>;
}

async function loadAggregates(businessId: string | undefined, ids: string[]): Promise<Aggregates> {
  if (ids.length === 0) return { bMap: new Map(), sMap: new Map() };
  const [bookingsAgg, salesAgg] = await Promise.all([
    prisma.booking.groupBy({ by: ['customerId'], where: { businessId, customerId: { in: ids } }, _count: { _all: true }, _max: { startAt: true } }),
    prisma.sale.groupBy({ by: ['customerId'], where: { businessId, customerId: { in: ids } }, _sum: { total: true } }),
  ]);
  return {
    bMap: new Map(bookingsAgg.filter((b) => b.customerId).map((b) => [b.customerId as string, b])),
    sMap: new Map(salesAgg.filter((s) => s.customerId).map((s) => [s.customerId as string, s])),
  };
}

type CustomerRow = Prisma.CustomerGetPayload<{ include: { estadoVisita: true } }>;

function shapeCustomer(c: CustomerRow, aggs: Aggregates, distanciaKm?: number): Record<string, unknown> {
  const b = aggs.bMap.get(c.id);
  const s = aggs.sMap.get(c.id);
  const visitas = b?._count._all ?? 0;
  const gastoTotal = s?._sum.total ? Number(s._sum.total) : 0;
  const ultima = b?._max.startAt ?? c.ultimaVisitaEn ?? null;
  return {
    id: c.id,
    nombre: joinNombre(c),
    email: c.email ?? '',
    telefono: c.telefono ?? '',
    direccion: c.direccion ?? '',
    localidad: c.localidad ?? '',
    provincia: c.provincia ?? '',
    codigoPostal: c.codigoPostal ?? '',
    visitas,
    gastoTotal,
    ultimaVisita: ultima ? ultima.toISOString().slice(0, 10) : '',
    segmento: segmentoDe(visitas, gastoTotal, ultima),
    estado: c.estado,
    // Comercial de campo
    latitud: c.latitud,
    longitud: c.longitud,
    geoEstado: c.geoEstado,
    categoriaAbc: c.categoriaAbc,
    tipoRegistro: c.tipoRegistro,
    estadoVisitaId: c.estadoVisitaId,
    estadoVisita: c.estadoVisita ? { id: c.estadoVisita.id, nombre: c.estadoVisita.nombre, color: c.estadoVisita.color, icono: c.estadoVisita.icono, esPendiente: c.estadoVisita.esPendiente } : null,
    ...(distanciaKm !== undefined ? { distanciaKm: Math.round(distanciaKm * 10) / 10 } : {}),
  };
}

function parseNear(raw: unknown): { lat: number; lng: number } | null {
  if (typeof raw !== 'string') return null;
  const [a, b] = raw.split(',').map((x) => Number(x.trim()));
  return isValidCoord(a, b) ? { lat: a, lng: b } : null;
}
