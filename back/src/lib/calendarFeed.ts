import type { CalendarItem } from './ics.js';

// ---------------------------------------------------------------------------
// Selección de ítems del feed ICS (crm-citas-google-calendar, WU2.2/2.3).
// Lógica pura de rango/privacidad separada del transporte HTTP (Express) y de
// Prisma, para poder testear scoping y exclusión de notas sin DB real — mismo
// principio que buildReminderCandidates() en bookings.email.test.ts.
// ---------------------------------------------------------------------------

export interface FeedBookingRow {
  id: string;
  startAt: Date;
  endAt: Date;
  service: { nombre: string } | null;
  customer: { nombre: string; apellido: string | null } | null;
  location: { direccion: string | null } | null;
}

export interface FeedReminderRow {
  id: string;
  titulo: string;
  fechaPrevista: Date | null;
  customer: { nombre: string; apellido: string | null; direccion: string | null } | null;
}

export interface FeedRange {
  from: Date;
  to: Date;
}

const DIA_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAYS_BEFORE = 30;
const DEFAULT_DAYS_AFTER = 90;
/** Duración fija asignada a los recordatorios en el ICS (no tienen hora de fin). */
const REMINDER_DURATION_MS = 30 * 60 * 1000;

/** Rango del feed: [-30, +90] días desde `now` (AC1). */
export function feedRange(now: Date = new Date()): FeedRange {
  return {
    from: new Date(now.getTime() - DEFAULT_DAYS_BEFORE * DIA_MS),
    to: new Date(now.getTime() + DEFAULT_DAYS_AFTER * DIA_MS),
  };
}

function joinNombre(p: { nombre: string; apellido?: string | null } | null | undefined): string {
  if (!p) return '';
  return [p.nombre, p.apellido].filter(Boolean).join(' ').trim();
}

function inRange(d: Date, range: FeedRange): boolean {
  return d.getTime() >= range.from.getTime() && d.getTime() <= range.to.getTime();
}

/**
 * Construye los ítems ICS a partir de filas ya resueltas por el caller (bookings +
 * reminders del usuario dueño del token). SOLO título, cliente asociado, fecha/hora
 * y dirección (AC3) — nunca `notes`/`descripcion` (notas comerciales). Filtra por
 * rango como defensa en profundidad (aunque la query ya debería acotarlo).
 */
export function buildFeedItems(
  bookings: FeedBookingRow[],
  reminders: FeedReminderRow[],
  range: FeedRange = feedRange(),
): CalendarItem[] {
  const items: CalendarItem[] = [];

  for (const b of bookings) {
    if (!inRange(b.startAt, range)) continue;
    items.push({
      uid: `booking-${b.id}@crm`,
      title: b.service?.nombre || 'Cita',
      start: b.startAt,
      end: b.endAt,
      description: joinNombre(b.customer) || undefined,
      location: b.location?.direccion ?? undefined,
    });
  }

  for (const r of reminders) {
    if (!r.fechaPrevista || !inRange(r.fechaPrevista, range)) continue;
    const start = r.fechaPrevista;
    items.push({
      uid: `reminder-${r.id}@crm`,
      title: r.titulo,
      start,
      end: new Date(start.getTime() + REMINDER_DURATION_MS),
      description: joinNombre(r.customer) || undefined,
      location: r.customer?.direccion ?? undefined,
    });
  }

  return items;
}

/** Puerto de datos — inyectable para tests (sin Prisma/DB real). */
export interface CalendarFeedDeps {
  findBookingsForUser(userId: string, range: FeedRange): Promise<FeedBookingRow[]>;
  findRemindersForUser(userId: string, range: FeedRange): Promise<FeedReminderRow[]>;
}

/** Resuelve los ítems del feed para el usuario dueño del token (scoping por userId). */
export async function resolveFeedItems(
  deps: CalendarFeedDeps,
  userId: string,
  range: FeedRange = feedRange(),
): Promise<CalendarItem[]> {
  const [bookings, reminders] = await Promise.all([
    deps.findBookingsForUser(userId, range),
    deps.findRemindersForUser(userId, range),
  ]);
  return buildFeedItems(bookings, reminders, range);
}
