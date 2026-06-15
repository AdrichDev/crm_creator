import { prisma } from '../prisma.js';
import { BookingStatus } from '@prisma/client';

export interface AvailabilityParams {
  businessId: string;
  locationId: string;
  serviceId: string;
  employeeId?: string | null;
  resourceIds?: string[];
  start: string | Date;
}
export interface AvailabilityResult { ok: boolean; reason?: string; startAt?: Date; endAt?: Date; }

const ACTIVE_STATES: BookingStatus[] = [
  BookingStatus.DRAFT, BookingStatus.PENDING, BookingStatus.CONFIRMED,
  BookingStatus.CHECKED_IN, BookingStatus.IN_PROGRESS, BookingStatus.COMPLETED,
];

function minutesOfDay(d: Date): number { return d.getHours() * 60 + d.getMinutes(); }
function hhmmToMin(s: string): number { const [h, m] = s.split(':').map(Number); return h * 60 + m; }
function dateOnly(d: Date): Date { return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); }

// Valida una franja contra horario, festivos, empleado (solape + ausencias) y recursos (aforo).
export async function checkAvailability(p: AvailabilityParams): Promise<AvailabilityResult> {
  const service = await prisma.service.findFirst({ where: { id: p.serviceId, businessId: p.businessId } });
  if (!service) return { ok: false, reason: 'service_not_found' };
  if (!service.active) return { ok: false, reason: 'service_inactive' };

  const startAt = new Date(p.start);
  const endAt = new Date(startAt.getTime() + service.durationMin * 60000);
  const winStart = new Date(startAt.getTime() - service.bufferBefore * 60000);
  const winEnd = new Date(endAt.getTime() + service.bufferAfter * 60000);

  // Horario de apertura
  const hours = await prisma.openingHour.findMany({ where: { locationId: p.locationId, weekday: startAt.getDay() } });
  const within = hours.some((h: { openTime: string; closeTime: string }) => minutesOfDay(startAt) >= hhmmToMin(h.openTime) && minutesOfDay(endAt) <= hhmmToMin(h.closeTime));
  if (hours.length > 0 && !within) return { ok: false, reason: 'outside_opening_hours' };

  // Festivos / cierres
  const holiday = await prisma.holiday.findFirst({ where: { locationId: p.locationId, date: dateOnly(startAt) } });
  if (holiday && !holiday.isOpen) return { ok: false, reason: 'holiday' };

  // Empleado: solape + ausencias aprobadas
  if (p.employeeId) {
    const svcEmp = await prisma.service.findFirst({ where: { id: p.serviceId, employees: { some: { id: p.employeeId } } } });
    if (service.requiresProfessional && !svcEmp) return { ok: false, reason: 'employee_not_compatible' };
    const overlap = await prisma.booking.findFirst({
      where: { employeeId: p.employeeId, status: { in: ACTIVE_STATES }, startAt: { lt: winEnd }, endAt: { gt: winStart } },
    });
    if (overlap) return { ok: false, reason: 'employee_busy' };
    const off = await prisma.timeOffRequest.findFirst({
      where: { employeeId: p.employeeId, status: 'APPROVED', startDate: { lte: startAt }, endDate: { gte: startAt } },
    });
    if (off) return { ok: false, reason: 'employee_time_off' };
  }

  // Recursos: activos + aforo no superado
  const resourceIds = p.resourceIds ?? [];
  for (const rid of resourceIds) {
    const res = await prisma.resource.findFirst({ where: { id: rid, businessId: p.businessId } });
    if (!res || res.status !== 'Activo') return { ok: false, reason: 'resource_unavailable' };
    const concurrent = await prisma.booking.count({
      where: { status: { in: ACTIVE_STATES }, startAt: { lt: endAt }, endAt: { gt: startAt }, resources: { some: { id: rid } } },
    });
    if (concurrent >= res.capacity) return { ok: false, reason: 'resource_full' };
  }

  return { ok: true, startAt, endAt };
}

// Genera huecos válidos de un día para (servicio, empleado?, recurso?).
export async function daySlots(params: AvailabilityParams & { date: string; stepMin?: number }): Promise<{ start: string; end: string }[]> {
  const service = await prisma.service.findFirst({ where: { id: params.serviceId, businessId: params.businessId } });
  if (!service) return [];
  const day = new Date(params.date);
  const hours = await prisma.openingHour.findMany({ where: { locationId: params.locationId, weekday: day.getDay() } });
  const step = params.stepMin ?? 15;
  const out: { start: string; end: string }[] = [];
  for (const h of hours) {
    for (let m = hhmmToMin(h.openTime); m + service.durationMin <= hhmmToMin(h.closeTime); m += step) {
      const start = new Date(day); start.setHours(0, 0, 0, 0); start.setMinutes(m);
      const r = await checkAvailability({ ...params, start });
      if (r.ok) out.push({ start: start.toISOString(), end: r.endAt!.toISOString() });
    }
  }
  return out;
}
