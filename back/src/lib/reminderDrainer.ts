import { prisma as defaultPrisma } from '../prisma.js';
import { notifyBookingReminder } from './notify.js';
import type { BookingNotifyData } from './notify.js';

// ---------------------------------------------------------------------------
// Drainer de recordatorios de citas.
// Ejecuta cada REMINDER_DRAINER_INTERVAL_MS ms (default 60 s).
//
// Seguro para múltiples instancias: cada iteración RECLAMA filas de forma atómica
// (estado 'pending' -> 'processing' con locked_at = now) usando
// `FOR UPDATE SKIP LOCKED`. Dos instancias nunca reclaman la misma fila, así que
// no hay doble envío. Si una instancia muere a mitad, su fila queda 'processing'
// con locked_at viejo y otra instancia la vuelve a reclamar pasado el TTL de lock.
//
// Por cada fila reclamada:
//   1. Verifica que el booking exista y no esté cancelado/eliminado.
//   2. Envía el email de recordatorio (soft-fail).
//   3. Estado final: 'sent', 'skipped', o reintento con backoff / 'failed' al tope.
// Nunca para el proceso (errores globales son capturados y logueados).
// ---------------------------------------------------------------------------

export const REMINDER_DRAINER_INTERVAL_MS = Number(
  process.env.REMINDER_DRAINER_INTERVAL_MS ?? 60_000,
);

/** Filas reclamadas por iteración. */
const CLAIM_BATCH = Number(process.env.REMINDER_CLAIM_BATCH ?? 50);

/** Reintentos de envío antes de marcar 'failed' (terminal). */
const MAX_ATTEMPTS = Number(process.env.REMINDER_MAX_ATTEMPTS ?? 3);

/** TTL del lock: una fila 'processing' con locked_at más viejo que esto se reclama de nuevo. */
const LOCK_STALE_MS = Number(process.env.REMINDER_LOCK_STALE_MS ?? 5 * 60_000);

/** Backoff exponencial entre reintentos (base y tope). */
const BACKOFF_BASE_MS = Number(process.env.REMINDER_BACKOFF_BASE_MS ?? 5 * 60_000);
const BACKOFF_MAX_MS = Number(process.env.REMINDER_BACKOFF_MAX_MS ?? 60 * 60_000);

/** Retraso del próximo intento n (1-based): base * 2^(n-1), capado. */
export function backoffMs(intento: number): number {
  const exp = BACKOFF_BASE_MS * 2 ** Math.max(0, intento - 1);
  return Math.min(exp, BACKOFF_MAX_MS);
}

// ---------------------------------------------------------------------------
// Interfaces para inyección de dependencias (facilita testing sin DB real).
// ---------------------------------------------------------------------------

export interface NotificationRow {
  id: string;
  tipo: string;
  destino: string | null;
  payload: unknown;
  businessId: string;
  intentos: number;
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

/** Campos actualizables de una notificación tras procesarla. */
export interface NotificationUpdate {
  estado: string;
  enviadoEn?: Date;
  /** null libera el lock; se setea en todo estado terminal o reintento. */
  lockedAt?: Date | null;
  intentos?: number;
  /** Reprograma el próximo intento (backoff). */
  programadoEn?: Date;
}

export interface DrainerDeps {
  /** Reclama atómicamente filas pendientes (y colgadas) marcándolas 'processing'. */
  claimPending: () => Promise<NotificationRow[]>;
  findBooking: (bookingId: string) => Promise<{ id: string } | null>;
  updateNotification: (id: string, data: NotificationUpdate) => Promise<void>;
  /**
   * Paso de envío vía puerto: emit a n8n o SMTP directo según config (lo decide
   * notify.ts). Devuelve true si se despachó. eventId de idempotencia = row.id.
   */
  notifyReminder: (row: NotificationRow, payload: ReminderPayload) => Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Lógica core — separada para testabilidad.
// ---------------------------------------------------------------------------

export async function processRow(row: NotificationRow, deps: DrainerDeps): Promise<void> {
  const payload = row.payload;
  if (!isReminderPayload(payload)) {
    console.warn(`[drainer] fila ${row.id} payload inválido — skipped`);
    await deps.updateNotification(row.id, { estado: 'skipped', lockedAt: null });
    return;
  }

  // Verificar booking activo (no cancelado, no eliminado).
  const booking = await deps.findBooking(payload.bookingId);

  if (!booking) {
    console.log(`[drainer] fila ${row.id} booking cancelado/eliminado/inexistente — skipped`);
    await deps.updateNotification(row.id, { estado: 'skipped', lockedAt: null });
    return;
  }

  if (!row.destino) {
    console.log(`[drainer] fila ${row.id} sin destino email — skipped`);
    await deps.updateNotification(row.id, { estado: 'skipped', lockedAt: null });
    return;
  }

  // El puerto es soft-fail por contrato (devuelve false), pero si lanza (error
  // transitorio) lo tratamos igual que false: así la fila NO queda atascada en
  // 'processing' y entra en el flujo acotado de reintentos/backoff.
  let sent = false;
  try {
    sent = await deps.notifyReminder(row, payload);
  } catch (err) {
    console.error(`[drainer] fila ${row.id} notifyReminder lanzó:`, (err as Error).message);
    sent = false;
  }

  if (sent) {
    await deps.updateNotification(row.id, { estado: 'sent', enviadoEn: new Date(), lockedAt: null });
    return;
  }

  // Soft-fail: reintentar con backoff hasta MAX_ATTEMPTS; al tope -> 'failed'.
  const intentos = row.intentos + 1;
  if (intentos >= MAX_ATTEMPTS) {
    await deps.updateNotification(row.id, { estado: 'failed', intentos, lockedAt: null });
    console.error(`[drainer] fila ${row.id} email fallido tras ${intentos} intentos — failed`);
  } else {
    const programadoEn = new Date(Date.now() + backoffMs(intentos));
    await deps.updateNotification(row.id, { estado: 'pending', intentos, lockedAt: null, programadoEn });
    console.warn(`[drainer] fila ${row.id} email fallido — reintento ${intentos} en ~${Math.round(backoffMs(intentos) / 1000)}s`);
  }
}

async function drainWithDeps(deps: DrainerDeps): Promise<void> {
  try {
    const claimed = await deps.claimPending();
    for (const row of claimed) {
      try {
        await processRow(row, deps);
      } catch (err) {
        console.error(`[drainer] error procesando fila ${row.id}:`, (err as Error).message);
        // No liberamos el lock aquí: la fila queda 'processing' y el TTL de lock
        // la reclamará en una iteración futura. Evita un bucle de fallo inmediato.
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
    // Claim atómico: marca 'processing' + locked_at las filas elegibles y las
    // devuelve. Elegibles = 'pending' vencidas, o 'processing' con lock caducado
    // (instancia muerta). FOR UPDATE SKIP LOCKED evita que dos instancias colisionen.
    claimPending: async () => {
      const now = new Date();
      const staleBefore = new Date(now.getTime() - LOCK_STALE_MS);
      return defaultPrisma.$queryRaw<NotificationRow[]>`
        UPDATE crm.notificacion
        SET estado = 'processing', locked_at = ${now}
        WHERE id IN (
          SELECT id FROM crm.notificacion
          WHERE canal = 'email'
            AND programado_en <= ${now}
            AND (
              estado = 'pending'
              OR (estado = 'processing' AND locked_at < ${staleBefore})
            )
          ORDER BY programado_en
          FOR UPDATE SKIP LOCKED
          LIMIT ${CLAIM_BATCH}
        )
        RETURNING id, tipo, destino, payload, negocio_id AS "businessId", intentos
      `;
    },
    findBooking: (bookingId: string) =>
      defaultPrisma.booking.findFirst({
        where: { id: bookingId, status: { not: 'CANCELLED' }, eliminadoEn: null },
      }),
    updateNotification: async (id: string, data: NotificationUpdate) => {
      await defaultPrisma.notification.update({ where: { id }, data });
    },
    // Envío vía puerto: notify.ts decide emit(n8n) o SMTP directo. eventId = row.id
    // (idempotencia por fila reclamada). processRow ya garantizó row.destino != null.
    notifyReminder: (row: NotificationRow, payload: ReminderPayload) => {
      const ventana = row.tipo === 'booking.reminder.24h' ? '24h' : '2h';
      const data: BookingNotifyData = {
        bookingId: payload.bookingId,
        businessId: row.businessId,
        businessName: payload.businessName,
        customerName: payload.customerName,
        email: row.destino ?? '',
        serviceName: payload.serviceName,
        employeeName: payload.employeeName,
        startsAt: new Date(payload.startsAt),
      };
      return notifyBookingReminder(data, ventana, row.id);
    },
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
