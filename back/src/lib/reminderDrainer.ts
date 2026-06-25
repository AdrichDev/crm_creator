import { prisma as defaultPrisma } from '../prisma.js';
import { sendEmail as defaultSendEmail, reminderTemplate } from './email.js';

// ---------------------------------------------------------------------------
// Drainer de recordatorios de citas.
// Ejecuta cada REMINDER_DRAINER_INTERVAL_MS ms (default 60 s).
// Consulta filas Notification con estado 'pending' y programadoEn <= ahora.
// Por cada fila:
//   1. Verifica que el booking exista y no esté cancelado/eliminado.
//   2. Envía el email de recordatorio (soft-fail).
//   3. Actualiza el estado a 'sent', 'skipped' o 'failed'.
// Nunca para el proceso (errores globales son capturados y logueados).
// ---------------------------------------------------------------------------

export const REMINDER_DRAINER_INTERVAL_MS = Number(
  process.env.REMINDER_DRAINER_INTERVAL_MS ?? 60_000,
);

// ---------------------------------------------------------------------------
// Interfaces para inyección de dependencias (facilita testing sin DB real).
// ---------------------------------------------------------------------------

export interface NotificationRow {
  id: string;
  tipo: string;
  destino: string | null;
  payload: unknown;
  businessId: string;
}

interface ReminderPayload {
  bookingId: string;
  customerName: string;
  serviceName: string;
  startsAt: string; // ISO string
  employeeName?: string;
  businessName: string;
}

function isReminderPayload(p: unknown): p is ReminderPayload {
  return typeof p === 'object' && p !== null && 'bookingId' in p && 'customerName' in p;
}

export interface DrainerDeps {
  findPending: () => Promise<NotificationRow[]>;
  findBooking: (bookingId: string) => Promise<{ id: string } | null>;
  updateNotification: (id: string, data: { estado: string; enviadoEn?: Date }) => Promise<void>;
  sendEmail: (opts: { to: string; subject: string; html: string }) => Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Lógica core — separada para testabilidad.
// ---------------------------------------------------------------------------

export async function processRow(row: NotificationRow, deps: DrainerDeps): Promise<void> {
  const payload = row.payload;
  if (!isReminderPayload(payload)) {
    console.warn(`[drainer] fila ${row.id} payload inválido — skipped`);
    await deps.updateNotification(row.id, { estado: 'skipped' });
    return;
  }

  // Verificar booking activo (no cancelado, no eliminado).
  const booking = await deps.findBooking(payload.bookingId);

  if (!booking) {
    console.log(`[drainer] fila ${row.id} booking cancelado/eliminado/inexistente — skipped`);
    await deps.updateNotification(row.id, { estado: 'skipped' });
    return;
  }

  if (!row.destino) {
    console.log(`[drainer] fila ${row.id} sin destino email — skipped`);
    await deps.updateNotification(row.id, { estado: 'skipped' });
    return;
  }

  const window = row.tipo === 'booking.reminder.24h' ? '24h' : '2h';
  const html = reminderTemplate(
    {
      customerName: payload.customerName,
      serviceName: payload.serviceName,
      startsAt: new Date(payload.startsAt),
      employeeName: payload.employeeName,
      businessName: payload.businessName,
    },
    window,
  );

  const subject = window === '24h'
    ? `Recordatorio: tu cita de mañana — ${payload.serviceName}`
    : `Recordatorio: tu cita es en 2 horas — ${payload.serviceName}`;

  const sent = await deps.sendEmail({ to: row.destino, subject, html });

  if (sent) {
    await deps.updateNotification(row.id, { estado: 'sent', enviadoEn: new Date() });
  } else {
    await deps.updateNotification(row.id, { estado: 'failed' });
    console.error(`[drainer] fila ${row.id} email fallido — failed (sin retry en MVP)`);
  }
}

async function drainWithDeps(deps: DrainerDeps): Promise<void> {
  try {
    const pending = await deps.findPending();
    for (const row of pending) {
      try {
        await processRow(row, deps);
      } catch (err) {
        console.error(`[drainer] error procesando fila ${row.id}:`, (err as Error).message);
        // Nunca para el drainer; la fila queda en 'pending' para reintentar.
      }
    }
  } catch (err) {
    console.error('[drainer] error global en iteración:', (err as Error).message);
    // Nunca lanza — el proceso Express sigue en pie.
  }
}

// ---------------------------------------------------------------------------
// Dependencias reales (producción).
// ---------------------------------------------------------------------------

function buildProdDeps(): DrainerDeps {
  return {
    findPending: () =>
      defaultPrisma.notification.findMany({
        where: { estado: 'pending', canal: 'email', programadoEn: { lte: new Date() } },
        take: 50,
      }),
    findBooking: (bookingId: string) =>
      defaultPrisma.booking.findFirst({
        where: { id: bookingId, status: { not: 'CANCELLED' }, eliminadoEn: null },
      }),
    updateNotification: async (id: string, data: { estado: string; enviadoEn?: Date }) => {
      await defaultPrisma.notification.update({ where: { id }, data });
    },
    sendEmail: defaultSendEmail,
  };
}

// ---------------------------------------------------------------------------
// Función pública de producción: drain con deps reales.
// ---------------------------------------------------------------------------

async function drain(): Promise<void> {
  await drainWithDeps(buildProdDeps());
}

let _intervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Arranca el drainer de recordatorios.
 * Llamar una sola vez desde server.ts tras app.listen.
 * En tests, no llamar (o controlar el intervalo manualmente).
 */
export function startReminderDrainer(): void {
  console.log(`[drainer] iniciado (intervalo ${REMINDER_DRAINER_INTERVAL_MS} ms)`);
  _intervalId = setInterval(() => { void drain(); }, REMINDER_DRAINER_INTERVAL_MS);
  // Permitir que el proceso Node finalice sin esperar el intervalo (e.g. tests).
  if (_intervalId.unref) _intervalId.unref();
}

/**
 * Exponer drainWithDeps para tests (permite inyectar dependencias mock).
 */
export { drainWithDeps as _drainWithDeps };
