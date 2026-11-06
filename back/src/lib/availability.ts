import { prisma } from '../prisma.js';
import { BookingStatus } from './generated/prisma/client.js';
import { Prisma } from './generated/prisma/client.js';

export interface AvailabilityParams {
  businessId: string;
  locationId: string;
  serviceId: string;
  employeeId?: string | null;
  resourceIds?: string[];
  start: string | Date;
}
export interface AvailabilityResult { ok: boolean; reason?: string; startAt?: Date; endAt?: Date; }

/** Cliente de una transacción interactiva de Prisma. */
export type BookingTxClient = Prisma.TransactionClient;

// F-06: no existe ninguna constraint en BD contra solapes, así que toda creación o
// reprogramación de reserva se serializa con un lock de fila del recurso escaso (empleado /
// recurso / sucursal) tomado DENTRO de la transacción que después lee y escribe. Sin el
// lock, dos transacciones leen "libre" antes de que la otra commitee e insertan un solape.
// Nombres de tabla verificados en prisma/schema.prisma (@@map). El schema NO puede ir fijo:
// el adapter de src/prisma.ts cualifica las consultas con `DB_SCHEMA ?? 'crm'`, así que el
// lock tiene que resolver el MISMO schema, o bloquearía tablas inexistentes (la creación de
// reserva fallaría antes de insertar) o protegería filas de un schema ajeno.
// `$queryRaw` no parametriza identificadores: se intercala un fragmento `Prisma.raw` cuyo
// nombre se valida como identificador de Postgres (si no, se cae a `crm`, fail-closed).
export function lockSchema(raw: string | undefined = process.env.DB_SCHEMA): string {
  const candidate = raw ?? 'crm';
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(candidate) ? candidate : 'crm';
}

/** `schema.tabla` como fragmento SQL (identificador validado, no parametrizable). */
function qualified(table: string): ReturnType<typeof Prisma.raw> {
  return Prisma.raw(`${lockSchema()}.${table}`);
}

export async function lockEmployee(tx: BookingTxClient, employeeId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM ${qualified('empleado')} WHERE id = ${employeeId} FOR UPDATE`;
}
export async function lockLocation(tx: BookingTxClient, locationId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM ${qualified('sucursal')} WHERE id = ${locationId} FOR UPDATE`;
}
export async function lockResource(tx: BookingTxClient, resourceId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM ${qualified('recurso')} WHERE id = ${resourceId} FOR UPDATE`;
}
export async function lockCustomerPackage(tx: BookingTxClient, customerPackageId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM ${qualified('paquete_cliente')} WHERE id = ${customerPackageId} FOR UPDATE`;
}

// Orden de adquisición estable (empleado|sucursal → recursos ordenados) para que dos
// reservas concurrentes no se bloqueen en cruz y provoquen un deadlock.
export async function lockBookingSlot(
  tx: BookingTxClient,
  p: { employeeId?: string | null; locationId: string; resourceIds?: string[] },
): Promise<void> {
  if (p.employeeId) await lockEmployee(tx, p.employeeId);
  else await lockLocation(tx, p.locationId); // sin empleado, la sucursal es el recurso escaso
  for (const rid of [...(p.resourceIds ?? [])].sort()) await lockResource(tx, rid);
}

/** Subconjunto de Prisma que necesita la comprobación de disponibilidad. Admite tanto el
 *  cliente global como el cliente de una transacción (`tx`), igual que sale-lines.ts. */
export type AvailabilityClient = Pick<
  typeof prisma, 'service' | 'openingHour' | 'holiday' | 'booking' | 'timeOffRequest' | 'resource'
>;

const ACTIVE_STATES: BookingStatus[] = [
  BookingStatus.DRAFT, BookingStatus.PENDING, BookingStatus.CONFIRMED,
  BookingStatus.CHECKED_IN, BookingStatus.IN_PROGRESS, BookingStatus.COMPLETED,
];

// Convención única "wall clock" (crm-editar-cita-persistencia WU0/AC0): un `start`
// sin designador de TZ se interpreta como UTC (no como hora local del servidor), y
// TODAS las lecturas de hora/día (aquí y en iterateDaySlots) usan los métodos UTC.
// Así la hora que el usuario escribe es EXACTAMENTE la que se guarda y se muestra,
// sea cual sea la TZ del proceso Node. Si `start` ya es un Date (p. ej. booking.startAt
// leído de Prisma), se usa tal cual — ya es el instante correcto.
const TZ_DESIGNATOR = /Z$|[+-]\d{2}:?\d{2}$/;
function parseWallClock(start: string | Date): Date {
  if (start instanceof Date) return start;
  return new Date(TZ_DESIGNATOR.test(start) ? start : `${start}Z`);
}
function minutesOfDay(d: Date): number { return d.getUTCHours() * 60 + d.getUTCMinutes(); }
function hhmmToMin(s: string): number { const [h, m] = s.split(':').map(Number); return h * 60 + m; }
function dateOnly(d: Date): Date { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); }

// Valida una franja contra horario, festivos, empleado (solape + ausencias) y recursos (aforo).
// `db` permite leer dentro de la MISMA transacción que va a insertar la reserva: así el
// solape se evalúa contra lo ya committeado + lo de la propia tx, y el lock de fila previo
// serializa a los creadores concurrentes del mismo empleado/recurso (F-06). Por defecto
// usa el cliente global, de modo que todos los callers existentes siguen igual.
export async function checkAvailability(p: AvailabilityParams, db: AvailabilityClient = prisma): Promise<AvailabilityResult> {
  const service = await db.service.findFirst({ where: { id: p.serviceId, businessId: p.businessId } });
  if (!service) return { ok: false, reason: 'service_not_found' };
  if (!service.activo) return { ok: false, reason: 'service_inactive' };

  const startAt = parseWallClock(p.start);
  const endAt = new Date(startAt.getTime() + service.duracion * 60000);
  const winStart = new Date(startAt.getTime() - service.margenAntes * 60000);
  const winEnd = new Date(endAt.getTime() + service.margenDespues * 60000);

  // Horario de apertura
  const hours = await db.openingHour.findMany({ where: { locationId: p.locationId, diaSemana: startAt.getUTCDay() } });
  const within = hours.some((h: { apertura: string; cierre: string }) => minutesOfDay(startAt) >= hhmmToMin(h.apertura) && minutesOfDay(endAt) <= hhmmToMin(h.cierre));
  if (hours.length > 0 && !within) return { ok: false, reason: 'outside_opening_hours' };

  // Festivos / cierres
  const holiday = await db.holiday.findFirst({ where: { locationId: p.locationId, fecha: dateOnly(startAt) } });
  if (holiday && !holiday.abierto) return { ok: false, reason: 'holiday' };

  // Empleado: solape + ausencias aprobadas
  if (p.employeeId) {
    const svcEmp = await db.service.findFirst({ where: { id: p.serviceId, employees: { some: { id: p.employeeId } } } });
    if (service.requiereProfesional && !svcEmp) return { ok: false, reason: 'employee_not_compatible' };
    const overlap = await db.booking.findFirst({
      where: { employeeId: p.employeeId, status: { in: ACTIVE_STATES }, startAt: { lt: winEnd }, endAt: { gt: winStart } },
    });
    if (overlap) return { ok: false, reason: 'employee_busy' };
    const off = await db.timeOffRequest.findFirst({
      where: { employeeId: p.employeeId, estado: 'APPROVED', inicio: { lte: startAt }, fin: { gte: startAt } },
    });
    if (off) return { ok: false, reason: 'employee_time_off' };
  }

  // Recursos: activos + aforo no superado
  const resourceIds = p.resourceIds ?? [];
  for (const rid of resourceIds) {
    const res = await db.resource.findFirst({ where: { id: rid, businessId: p.businessId } });
    if (!res || res.estado !== 'Activo') return { ok: false, reason: 'resource_unavailable' };
    const concurrent = await db.booking.count({
      where: { status: { in: ACTIVE_STATES }, startAt: { lt: endAt }, endAt: { gt: startAt }, resources: { some: { id: rid } } },
    });
    if (concurrent >= res.capacidad) return { ok: false, reason: 'resource_full' };
  }

  return { ok: true, startAt, endAt };
}

// Helper compartido: recorre los huecos candidatos de un día (horario de apertura,
// paso configurable) y valida cada uno con checkAvailability. Única fuente de verdad
// de disponibilidad reutilizada por daySlots (POST /check-availability) y
// daySlotsWithAvailability (GET /bookings/slots) — ninguna duplica la lógica de solapes.
async function iterateDaySlots(params: AvailabilityParams & { date: string; stepMin?: number }) {
  const service = await prisma.service.findFirst({ where: { id: params.serviceId, businessId: params.businessId } });
  if (!service) return [];
  // params.date (YYYY-MM-DD) ya parsea a medianoche UTC (forma date-only del spec ISO).
  // day.getTime() + minutos evita setHours/setMinutes (locales) — nunca cruza la
  // fecha por la TZ del servidor.
  const day = new Date(params.date);
  const hours = await prisma.openingHour.findMany({ where: { locationId: params.locationId, diaSemana: day.getUTCDay() } });
  const step = params.stepMin ?? service.duracion;
  const out: { start: Date; end: Date; ok: boolean }[] = [];
  for (const h of hours) {
    for (let m = hhmmToMin(h.apertura); m + service.duracion <= hhmmToMin(h.cierre); m += step) {
      const start = new Date(day.getTime() + m * 60000);
      const r = await checkAvailability({ ...params, start });
      out.push({ start, end: r.endAt ?? new Date(start.getTime() + service.duracion * 60000), ok: r.ok });
    }
  }
  return out;
}

// Genera huecos válidos de un día para (servicio, empleado?, recurso?). Solo libres
// (usado por POST /check-availability); paso por defecto 15min.
export async function daySlots(params: AvailabilityParams & { date: string; stepMin?: number }): Promise<{ start: string; end: string }[]> {
  const rows = await iterateDaySlots({ ...params, stepMin: params.stepMin ?? 15 });
  return rows.filter((r) => r.ok).map((r) => ({ start: r.start.toISOString(), end: r.end.toISOString() }));
}

// Genera TODOS los huecos del día (libres y ocupados) con paso = duración del
// servicio — usado por GET /bookings/slots para pintar chips (ocupado = disabled).
export async function daySlotsWithAvailability(params: AvailabilityParams & { date: string }): Promise<{ hora: string; disponible: boolean }[]> {
  const rows = await iterateDaySlots(params);
  return rows.map((r) => ({
    hora: `${String(r.start.getUTCHours()).padStart(2, '0')}:${String(r.start.getUTCMinutes()).padStart(2, '0')}`,
    disponible: r.ok,
  }));
}
