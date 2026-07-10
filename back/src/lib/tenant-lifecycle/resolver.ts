import { TenantLifecycle } from '../generated/prisma/client.js';
import { prisma } from '../../prisma.js';

// Resolución del estado EFECTIVO del ciclo de vida de un negocio (kill switch, lectura).
//
// - Caché in-process `Map<businessId, entry>` con TTL corto (30-60s). El cache es por proceso:
//   en multi-instancia cada proceso invalida el suyo y el TTL corto acota la ventana de
//   inconsistencia (misma decisión que el drainer: nada de estado global fuera de BD).
// - Evaluación PEREZOSA de GRACE: si el estado persistido es GRACE y `now > graceUntil`, el
//   estado efectivo es SUSPENDED sin escribir en BD — el operador formaliza cuando quiera.
//   Se evalúa en CADA lectura (no al cachear), así una gracia que expira a mitad de TTL corta
//   el servicio sin esperar a la re-lectura.
// - `invalidate(businessId)` borra la entrada; lo llama `PUT lifecycle` (WU3) en cada
//   transición para que el corte/reactivación sea inmediato en este proceso.

/** TTL del cache (ms). Dentro de la ventana 30-60s fijada en el diseño (§3). */
const DEFAULT_TTL_MS = 45_000;

/** Vista estrecha de BD que necesita el resolver — Prisma la satisface estructuralmente. */
export interface TenantStateDb {
  business: {
    findUnique(args: {
      where: { id: string };
      select: { lifecycle: true; graceUntil: true; suspendedAt: true };
    }): Promise<{
      lifecycle: TenantLifecycle;
      graceUntil: Date | null;
      suspendedAt: Date | null;
    } | null>;
  };
}

/** Estado efectivo resuelto (con GRACE perezoso ya aplicado). */
export interface ResolvedTenantState {
  effective: TenantLifecycle;
  /** Solo presente cuando el estado efectivo es GRACE (gracia aún vigente). */
  graceUntil?: Date;
}

interface CacheEntry {
  state: TenantLifecycle;
  graceUntil: Date | null;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export interface ResolveTenantStateOptions {
  /** BD inyectable para tests (patrón DI del repo, ver tenant-api-key.ts). */
  db?: TenantStateDb;
  /** Reloj inyectable para tests deterministas (TTL y expiración de gracia). */
  now?: Date;
  /** TTL del cache en ms; solo para tests. */
  ttlMs?: number;
}

/**
 * Devuelve el estado efectivo del negocio. Miss de cache (o entrada expirada) → lee `Business`
 * y cachea el estado CRUDO; el GRACE perezoso se computa en cada llamada sobre lo cacheado.
 * Negocio inexistente → efectivo TERMINATED (identidad huérfana = acceso cortado, el gate
 * responde 410; nunca se trata como ACTIVE por defecto).
 */
export async function resolveTenantState(
  businessId: string,
  opts: ResolveTenantStateOptions = {},
): Promise<ResolvedTenantState> {
  const db = opts.db ?? prisma;
  const now = opts.now ?? new Date();
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;

  let entry = cache.get(businessId);
  if (!entry || now.getTime() > entry.expiresAt) {
    const row = await db.business.findUnique({
      where: { id: businessId },
      select: { lifecycle: true, graceUntil: true, suspendedAt: true },
    });
    entry = {
      // Fila ausente → TERMINATED defensivo (fail-closed): jamás abrir servicio por defecto.
      state: row?.lifecycle ?? TenantLifecycle.TERMINATED,
      graceUntil: row?.graceUntil ?? null,
      expiresAt: now.getTime() + ttlMs,
    };
    cache.set(businessId, entry);
  }

  // GRACE perezoso: expirada (o GRACE sin fecha, defensivo) → SUSPENDED sin escribir BD.
  if (entry.state === TenantLifecycle.GRACE) {
    if (entry.graceUntil == null || now.getTime() > entry.graceUntil.getTime()) {
      return { effective: TenantLifecycle.SUSPENDED };
    }
    return { effective: TenantLifecycle.GRACE, graceUntil: entry.graceUntil };
  }

  return { effective: entry.state };
}

/**
 * Borra la entrada de cache del negocio. La llama `PUT lifecycle` en cada transición para que
 * el corte/reactivación sea inmediato en este proceso (sin esperar al TTL residual).
 */
export function invalidate(businessId: string): void {
  cache.delete(businessId);
}
