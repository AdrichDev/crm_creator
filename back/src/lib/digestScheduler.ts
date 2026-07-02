import { prisma as defaultPrisma } from '../prisma.js';
import { emit as defaultEmit } from './automation/index.js';
import { adminEmails as prodAdminEmails } from './adminEmails.js';
import { env } from '../env.js';
import type { AutomationEventName, AutomationPayloads } from './automation/index.js';

// ---------------------------------------------------------------------------
// Scheduler de digests/eventos programados (Fases 3-5).
//
// Generaliza el patrón del reminderDrainer: intervalo horario; el back CALCULA
// los agregados por negocio y EMITE eventos vía emit() directo (n8n renderiza y
// envía). Idempotencia por fila Notification con el unique
// [tipo, businessId, destino, programadoEn]:
//   - `programadoEn` = fecha lógica del digest (día 00:00 UTC para diarios,
//     lunes 00:00 UTC para semanales). Todo el cálculo es en UTC (documentado).
//   - Se crea la fila (create + catch P2002). Si ya existe y está 'sent' → skip
//     (ya emitido este período). Si existe y NO está 'sent' → se reintenta el
//     emit reutilizándola (deja fila para retry). Tras emit ok → 'sent'.
//   - `canal='digest'` para que el reminderDrainer (canal='email') NUNCA reclame
//     estas filas.
//
// SIN fallback SMTP: si AUTOMATION_WEBHOOK_URL está vacío → skip suave global
// (no se crea ninguna fila). Nunca lanza: un fallo por negocio no tumba el resto.
// ---------------------------------------------------------------------------

export const DIGEST_INTERVAL_MS = Number(process.env.DIGEST_INTERVAL_MS ?? 3_600_000);

/** Umbral de inactividad para reactivación (días). */
const REACTIVATION_DAYS = Number(process.env.DIGEST_REACTIVATION_DAYS ?? 90);

/** Máximo de clientes listados en el detalle de reactivación. */
const REACTIVATION_MAX = 50;

/** Tope de candidatos que la query de reactivación trae de la BD (evita cargar toda la tabla). */
const REACTIVATION_CANDIDATES = 500;

/** Tope de bonos por vencer que la query trae de la BD. */
const RENEWAL_CANDIDATES = 200;

// ---------------------------------------------------------------------------
// Helpers de fecha (UTC).
// ---------------------------------------------------------------------------

/** 00:00 UTC del día de `d`. */
export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** 00:00 UTC del lunes de la semana de `d` (getUTCDay: 0=domingo..6=sábado). */
export function mondayOfUtcWeek(d: Date): Date {
  const day = startOfUtcDay(d);
  const dow = day.getUTCDay();
  const backToMonday = (dow + 6) % 7; // 0 si ya es lunes
  return new Date(day.getTime() - backToMonday * 24 * 60 * 60 * 1000);
}

/** Año bisiesto gregoriano. */
function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * ¿`birth` cumple años el día de `ref` (comparación en UTC)?
 * Caso 29-feb: en años NO bisiestos los nacidos el 29-feb se felicitan el 28-feb.
 */
export function isBirthdayToday(birth: Date, ref: Date): boolean {
  const bMonth = birth.getUTCMonth() + 1;
  const bDay = birth.getUTCDate();
  const rMonth = ref.getUTCMonth() + 1;
  const rDay = ref.getUTCDate();
  if (bMonth === rMonth && bDay === rDay) return true;
  // Nacido 29-feb + hoy 28-feb en año no bisiesto → felicitar hoy (si fuera bisiesto,
  // se felicita el 29 y no se adelanta).
  if (bMonth === 2 && bDay === 29 && rMonth === 2 && rDay === 28 && !isLeapYear(ref.getUTCFullYear())) {
    return true;
  }
  return false;
}

function eur(n: number): string {
  return `${n.toFixed(2)} €`;
}

// ---------------------------------------------------------------------------
// Filas de dominio que consumen los digests (tipadas mínimamente).
// ---------------------------------------------------------------------------

export interface BusinessRow { id: string; nombre: string }
export interface InvoiceRow { numero: string; cliente: string; total: number; estado: string }
export interface SaleRow { metodo: string; total: number }
export interface ProductRow { nombre: string; stock: number; minimo: number }
export interface CustomerRow { nombre: string; apellido: string | null; email: string }
export interface InactiveCustomerRow { nombre: string; apellido: string | null; ultimaVisita: Date }
export interface RenewalRow { packageId: string; customerName: string; email: string; packageName: string; sesionesRestantes: number }
/** Fila cruda de la query $queryRaw de renovaciones (nombres de columna aliasados). */
interface DueRenewalRawRow { id: string; sesionesTotal: number; sesionesUsadas: number; nombre: string; apellido: string | null; email: string; packageName: string | null }
export interface FichajeAggRow { empleado: string; horas: number }

// Resultado de intentar crear/localizar la fila de idempotencia.
export type CreateDigestResult =
  | { created: true; id: string }
  | { created: false; existing: { id: string; estado: string } | null };

export interface CreateDigestInput {
  tipo: string;
  businessId: string;
  destino: string;
  programadoEn: Date;
  payload: unknown;
}

// ---------------------------------------------------------------------------
// Dependencias inyectables (DI) — permite testear sin DB real ni red.
// ---------------------------------------------------------------------------
export interface DigestDeps {
  /** false → sin AUTOMATION_WEBHOOK_URL: skip suave global (no crea filas). */
  enabled: boolean;
  emit: typeof defaultEmit;
  listBusinesses: () => Promise<BusinessRow[]>;
  adminEmails: (businessId: string) => Promise<string[]>;
  /** create + catch P2002; si ya existe devuelve la fila (id, estado). */
  createDigestRow: (input: CreateDigestInput) => Promise<CreateDigestResult>;
  markSent: (id: string) => Promise<void>;
  // Fuentes de datos por digest.
  invoicePending: (businessId: string) => Promise<InvoiceRow[]>;
  salesForRange: (businessId: string, start: Date, end: Date) => Promise<SaleRow[]>;
  lowStock: (businessId: string) => Promise<ProductRow[]>;
  birthdaysToday: (businessId: string, ref: Date) => Promise<CustomerRow[]>;
  inactiveCustomers: (businessId: string, cutoff: Date) => Promise<InactiveCustomerRow[]>;
  dueRenewals: (businessId: string) => Promise<RenewalRow[]>;
  fichajesForRange: (businessId: string, start: Date, end: Date) => Promise<FichajeAggRow[]>;
}

function fullName(nombre: string, apellido: string | null): string {
  return apellido ? `${nombre} ${apellido}` : nombre;
}

/** emit() es soft-fail: 'sent' o un 'duplicate' idempotente cuentan como despachado. */
function emitDispatched(result: Awaited<ReturnType<typeof defaultEmit>>): boolean {
  return result.status === 'sent' || (result.status === 'skipped' && result.reason === 'duplicate');
}

// ---------------------------------------------------------------------------
// Núcleo de idempotencia + emit para un ítem de digest.
// ---------------------------------------------------------------------------
async function processDigest<N extends AutomationEventName>(
  deps: DigestDeps,
  args: {
    eventName: N;
    businessId: string;
    destino: string;       // discriminador de idempotencia (email o packageId)
    programadoEn: Date;
    data: AutomationPayloads[N];
    now: Date;
  },
): Promise<void> {
  const res = await deps.createDigestRow({
    tipo: args.eventName,
    businessId: args.businessId,
    destino: args.destino,
    programadoEn: args.programadoEn,
    payload: args.data,
  });

  let rowId: string;
  if (res.created) {
    rowId = res.id;
  } else {
    // Ya existe: si está 'sent' → idempotente, no re-emitir. Si no → retry.
    if (!res.existing || res.existing.estado === 'sent') return;
    rowId = res.existing.id;
  }

  // emit() nunca lanza (soft-fail con retry/backoff interno); guardamos por si acaso.
  let result: Awaited<ReturnType<typeof defaultEmit>>;
  try {
    result = await deps.emit(args.eventName, args.data, {
      businessId: args.businessId,
      eventId: rowId,
      occurredAt: args.now,
    });
  } catch {
    return; // deja la fila 'pending' para retry en la próxima pasada
  }
  if (emitDispatched(result)) await deps.markSent(rowId);
  // fallo → fila queda 'pending' para retry en la próxima pasada
}

// ---------------------------------------------------------------------------
// Digests concretos.
// ---------------------------------------------------------------------------

async function runInvoicePending(deps: DigestDeps, biz: BusinessRow, admins: string[], today: Date, now: Date) {
  const rows = await deps.invoicePending(biz.id);
  if (rows.length === 0) return; // sin pendientes → no emite
  const detalle = rows.map((r) => `${r.numero} — ${r.cliente} — ${eur(r.total)} (${r.estado})`).join('\n');
  for (const email of admins) {
    await processDigest(deps, {
      eventName: 'invoice.pending_digest',
      businessId: biz.id, destino: email, programadoEn: today, now,
      data: { businessName: biz.nombre, email, detalle, totalPendientes: rows.length },
    });
  }
}

async function runCashSummary(deps: DigestDeps, biz: BusinessRow, admins: string[], today: Date, now: Date) {
  // Ventas del día ANTERIOR: [ayer 00:00 UTC, hoy 00:00 UTC).
  const start = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const rows = await deps.salesForRange(biz.id, start, today);
  // Agrupar por método.
  const porMetodo = new Map<string, { count: number; total: number }>();
  let total = 0;
  for (const s of rows) {
    const acc = porMetodo.get(s.metodo) ?? { count: 0, total: 0 };
    acc.count += 1; acc.total += s.total; total += s.total;
    porMetodo.set(s.metodo, acc);
  }
  const detalle = porMetodo.size === 0
    ? 'Sin ventas'
    : [...porMetodo.entries()].map(([m, a]) => `${m}: ${a.count} ventas — ${eur(a.total)}`).join('\n');
  const fecha = start.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
  for (const email of admins) {
    // Se emite AUNQUE haya 0 ventas (resumen diario de caja).
    await processDigest(deps, {
      eventName: 'cash.daily_summary',
      businessId: biz.id, destino: email, programadoEn: today, now,
      data: { businessName: biz.nombre, email, fecha, total, detalle },
    });
  }
}

async function runLowStock(deps: DigestDeps, biz: BusinessRow, admins: string[], today: Date, now: Date) {
  const rows = await deps.lowStock(biz.id);
  if (rows.length === 0) return; // sin filas → no emite
  const detalle = rows.map((r) => `${r.nombre} — stock ${r.stock} (mín ${r.minimo})`).join('\n');
  for (const email of admins) {
    await processDigest(deps, {
      eventName: 'stock.low_digest',
      businessId: biz.id, destino: email, programadoEn: today, now,
      data: { businessName: biz.nombre, email, detalle, numProductos: rows.length },
    });
  }
}

async function runBirthdays(deps: DigestDeps, biz: BusinessRow, today: Date, now: Date) {
  const rows = await deps.birthdaysToday(biz.id, now);
  for (const c of rows) {
    // Uno por cliente, destino = email del cliente (idempotencia email + día).
    await processDigest(deps, {
      eventName: 'customer.birthday',
      businessId: biz.id, destino: c.email, programadoEn: today, now,
      data: { businessName: biz.nombre, customerName: fullName(c.nombre, c.apellido), email: c.email },
    });
  }
}

async function runRenewals(deps: DigestDeps, biz: BusinessRow, today: Date, now: Date) {
  const rows = await deps.dueRenewals(biz.id);
  for (const r of rows) {
    // Uno por BONO. El unique no incluye packageId y un cliente puede tener varios
    // bonos vencidos el mismo día → discriminamos idempotencia por packageId en
    // `destino` (el email real viaja en el payload).
    await processDigest(deps, {
      eventName: 'package.renewal_due',
      businessId: biz.id, destino: r.packageId, programadoEn: today, now,
      data: {
        businessName: biz.nombre, customerName: r.customerName, email: r.email,
        packageName: r.packageName, sesionesRestantes: r.sesionesRestantes,
      },
    });
  }
}

async function runReactivation(deps: DigestDeps, biz: BusinessRow, admins: string[], monday: Date, now: Date) {
  const cutoff = new Date(now.getTime() - REACTIVATION_DAYS * 24 * 60 * 60 * 1000);
  const rows = await deps.inactiveCustomers(biz.id, cutoff);
  if (rows.length === 0) return;
  const detalle = rows.slice(0, REACTIVATION_MAX).map((c) => {
    const fecha = c.ultimaVisita.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
    return `${fullName(c.nombre, c.apellido)} — última cita ${fecha}`;
  }).join('\n');
  for (const email of admins) {
    await processDigest(deps, {
      eventName: 'customer.reactivation_digest',
      businessId: biz.id, destino: email, programadoEn: monday, now,
      data: { businessName: biz.nombre, email, detalle, numClientes: rows.length },
    });
  }
}

async function runFichajeWeekly(deps: DigestDeps, biz: BusinessRow, admins: string[], monday: Date, now: Date) {
  // Semana ANTERIOR: [lunes-7d, lunes).
  const start = new Date(monday.getTime() - 7 * 24 * 60 * 60 * 1000);
  const rows = await deps.fichajesForRange(biz.id, start, monday);
  if (rows.length === 0) return;
  const detalle = rows.map((r) => `${r.empleado}: ${r.horas.toFixed(1)} h`).join('\n');
  for (const email of admins) {
    await processDigest(deps, {
      eventName: 'fichaje.weekly_summary',
      businessId: biz.id, destino: email, programadoEn: monday, now,
      data: { businessName: biz.nombre, email, detalle },
    });
  }
}

// ---------------------------------------------------------------------------
// Orquestador (testeable con deps + now inyectados).
// ---------------------------------------------------------------------------
export async function runDigestsWithDeps(deps: DigestDeps, now: Date = new Date()): Promise<void> {
  if (!deps.enabled) return; // skip suave global: sin webhook no se crea nada

  const today = startOfUtcDay(now);
  const monday = mondayOfUtcWeek(now);
  const isMonday = now.getUTCDay() === 1;

  try {
    const businesses = await deps.listBusinesses();
    for (const biz of businesses) {
      try {
        const admins = await deps.adminEmails(biz.id);
        // Diarios a admins.
        if (admins.length > 0) {
          await runInvoicePending(deps, biz, admins, today, now);
          await runCashSummary(deps, biz, admins, today, now);
          await runLowStock(deps, biz, admins, today, now);
        }
        // Diarios directos.
        await runBirthdays(deps, biz, today, now);
        await runRenewals(deps, biz, today, now);
        // Semanales (lunes) a admins.
        if (isMonday && admins.length > 0) {
          await runReactivation(deps, biz, admins, monday, now);
          await runFichajeWeekly(deps, biz, admins, monday, now);
        }
      } catch (err) {
        console.error(`[digest] error procesando negocio ${biz.id}:`, (err as Error).message);
      }
    }
  } catch (err) {
    console.error('[digest] error global en la pasada:', (err as Error).message);
  }
}

// ---------------------------------------------------------------------------
// Dependencias reales (producción) construidas sobre prisma.
// ---------------------------------------------------------------------------
function buildProdDeps(): DigestDeps {
  const prisma = defaultPrisma;
  return {
    enabled: Boolean(env.automationWebhookUrl),
    emit: defaultEmit,
    listBusinesses: async () => {
      const rows = await prisma.business.findMany({ where: { eliminadoEn: null }, select: { id: true, nombre: true } });
      return rows;
    },
    adminEmails: (businessId) => prodAdminEmails(businessId),
    createDigestRow: async (input) => {
      try {
        const row = await prisma.notification.create({
          data: {
            businessId: input.businessId, tipo: input.tipo, canal: 'digest',
            destino: input.destino, payload: input.payload as object,
            programadoEn: input.programadoEn, estado: 'pending',
          },
          select: { id: true },
        });
        return { created: true, id: row.id };
      } catch (e) {
        if ((e as { code?: string }).code === 'P2002') {
          const existing = await prisma.notification.findUnique({
            where: {
              tipo_businessId_destino_programadoEn: {
                tipo: input.tipo, businessId: input.businessId,
                destino: input.destino, programadoEn: input.programadoEn,
              },
            },
            select: { id: true, estado: true },
          });
          return { created: false, existing };
        }
        throw e;
      }
    },
    markSent: async (id) => {
      await prisma.notification.update({ where: { id }, data: { estado: 'sent', enviadoEn: new Date() } });
    },
    invoicePending: async (businessId) => {
      const rows = await prisma.invoice.findMany({
        where: { businessId, eliminadoEn: null, estado: { in: ['Pendiente', 'Vencida'] } },
        select: { numero: true, cliente: true, total: true, estado: true },
      });
      return rows.map((r) => ({ numero: r.numero, cliente: r.cliente, total: Number(r.total), estado: r.estado }));
    },
    salesForRange: async (businessId, start, end) => {
      const rows = await prisma.sale.findMany({
        where: { businessId, eliminadoEn: null, fecha: { gte: start, lt: end } },
        select: { metodo: true, total: true },
      });
      return rows.map((r) => ({ metodo: r.metodo, total: Number(r.total) }));
    },
    lowStock: async (businessId) => {
      // Prisma no compara dos columnas directamente; filtramos en memoria.
      const rows = await prisma.product.findMany({
        where: { businessId, eliminadoEn: null },
        select: { nombre: true, stock: true, minimo: true },
      });
      return rows.filter((r) => r.stock <= r.minimo);
    },
    birthdaysToday: async (businessId, ref) => {
      const rows = await prisma.customer.findMany({
        where: { businessId, eliminadoEn: null, fechaNacimiento: { not: null }, email: { not: null } },
        select: { nombre: true, apellido: true, email: true, fechaNacimiento: true },
      });
      return rows
        .filter((r) => r.fechaNacimiento && isBirthdayToday(r.fechaNacimiento, ref))
        .map((r) => ({ nombre: r.nombre, apellido: r.apellido, email: r.email as string }));
    },
    inactiveCustomers: async (businessId, cutoff) => {
      // Filtro en BD (no en memoria): clientes con al menos una cita, todas anteriores
      // al cutoff (equivale a max(startAt) < cutoff). Acotado a REACTIVATION_CANDIDATES.
      const rows = await prisma.customer.findMany({
        where: {
          businessId, eliminadoEn: null,
          AND: [
            { bookings: { some: {} } },
            { bookings: { none: { startAt: { gte: cutoff } } } },
          ],
        },
        select: {
          nombre: true, apellido: true,
          bookings: { orderBy: { startAt: 'desc' }, take: 1, select: { startAt: true } },
        },
        take: REACTIVATION_CANDIDATES,
      });
      return rows
        .map((r) => ({ nombre: r.nombre, apellido: r.apellido, last: r.bookings[0]?.startAt ?? null }))
        .filter((r): r is { nombre: string; apellido: string | null; last: Date } => r.last !== null)
        .map((r) => ({ nombre: r.nombre, apellido: r.apellido, ultimaVisita: r.last }));
    },
    dueRenewals: async (businessId) => {
      // Prisma no compara dos columnas entre sí → $queryRaw (patrón reminderDrainer).
      // La resta sesiones_total - sesiones_usadas <= 1 y el filtro email se hacen en BD,
      // con LIMIT para no traer toda la tabla.
      const rows = await prisma.$queryRaw<DueRenewalRawRow[]>`
        SELECT cp.id,
               cp.sesiones_total  AS "sesionesTotal",
               cp.sesiones_usadas AS "sesionesUsadas",
               c.nombre,
               c.apellido,
               c.email,
               p.nombre AS "packageName"
        FROM crm.paquete_cliente cp
        JOIN crm.cliente c ON c.id = cp.cliente_id
        JOIN crm.paquete p ON p.id = cp.paquete_id
        WHERE cp.negocio_id = ${businessId}
          AND cp.estado = 'ACTIVE'
          AND cp.sesiones_total - cp.sesiones_usadas <= 1
          AND c.email IS NOT NULL
        ORDER BY (cp.sesiones_total - cp.sesiones_usadas) ASC
        LIMIT ${RENEWAL_CANDIDATES}
      `;
      return rows.map((r) => ({
        packageId: r.id,
        customerName: fullName(r.nombre, r.apellido),
        email: r.email,
        packageName: r.packageName ?? 'Bono',
        sesionesRestantes: r.sesionesTotal - r.sesionesUsadas,
      }));
    },
    fichajesForRange: async (businessId, start, end) => {
      const rows = await prisma.fichaje.findMany({
        where: { businessId, eliminadoEn: null, fecha: { gte: start, lt: end } },
        select: { empleado: true, horas: true, employee: { select: { nombre: true, apellido: true } } },
      });
      const agg = new Map<string, number>();
      for (const r of rows) {
        const nombre = r.employee ? fullName(r.employee.nombre, r.employee.apellido) : (r.empleado ?? 'Sin nombre');
        agg.set(nombre, (agg.get(nombre) ?? 0) + Number(r.horas ?? 0));
      }
      return [...agg.entries()].map(([empleado, horas]) => ({ empleado, horas }));
    },
  };
}

async function runDigests(): Promise<void> {
  await runDigestsWithDeps(buildProdDeps());
}

let _intervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Arranca el scheduler de digests. Llamar una sola vez desde server.ts tras listen.
 * En tests no llamar (usar runDigestsWithDeps con deps mock).
 */
export function startDigestScheduler(): void {
  console.log(`[digest] iniciado (intervalo ${DIGEST_INTERVAL_MS} ms)`);
  _intervalId = setInterval(() => { void runDigests(); }, DIGEST_INTERVAL_MS);
  if (_intervalId.unref) _intervalId.unref();
}
