import { Router, type Request, type Response } from 'express';
import type { TenantLifecycle } from '../lib/generated/prisma/client.js';
import {
  resolveTransition,
  TenantTransitionError,
  type BusinessLifecyclePatch,
  type ResolvedStateEvent,
} from '../lib/tenant-lifecycle/transitions.js';
import { invalidate } from '../lib/tenant-lifecycle/resolver.js';

// ---------------------------------------------------------------------------
// crm-tenant-lifecycle-gate (WU3.2) — palanca del kill switch, lado operador.
// Montado bajo /service/operator (que ya exige requireOperatorToken, ver
// service-operator.ts): el operador fija DIRECTAMENTE el estado destino del
// negocio (cualquiera de los 4, incluido TERMINATED → ACTIVE, sin 409) y
// consulta el histórico de transiciones.
//
// Invariante crítico (design §2/§7): este router JAMÁS borra datos. TERMINATED
// solo corta el acceso; la purga es una acción separada (WU6, endpoint propio
// con doble confirmación) que NINGÚN cambio de lifecycle invoca.
// ---------------------------------------------------------------------------

/** Fila de Business tras aplicar el parche de ciclo de vida. */
type BusinessLifecycleRow = {
  id: string;
  lifecycle: TenantLifecycle;
  graceUntil: Date | null;
  suspendedAt: Date | null;
};

/** Evento de auditoría expuesto en el listado (sin id interno). */
type StateEventRow = {
  fromState: TenantLifecycle;
  toState: TenantLifecycle;
  reason: string | null;
  actor: string;
  createdAt: Date;
};

/**
 * Vista de BD dentro de la transacción de transición: aplicar el parche sobre
 * Business + insertar el TenantStateEvent de auditoría, atómicamente (o las dos
 * escrituras o ninguna). Interfaz estrecha, mismo patrón que OperatorWriteTx.
 */
export interface LifecycleOperatorTx {
  business: {
    update(args: { where: { id: string }; data: BusinessLifecyclePatch }): Promise<BusinessLifecycleRow>;
  };
  tenantStateEvent: {
    create(args: { data: ResolvedStateEvent & { businessId: string } }): Promise<unknown>;
  };
}

/**
 * Dependencias de BD del router (patrón DI del repo, ver TenantKeysOperatorDb).
 * Prisma las satisface estructuralmente; los tests inyectan un doble sin BD real
 * (la migración puede no estar aplicada). Nótese que la interfaz NO expone ningún
 * método de borrado: el kill switch no puede purgar ni por accidente.
 */
export interface LifecycleOperatorDb {
  business: {
    findFirst(args: {
      where: { id: string; eliminadoEn: null };
    }): Promise<{ id: string; lifecycle: TenantLifecycle } | null>;
  };
  tenantStateEvent: {
    findMany(args: {
      where: { businessId: string };
      orderBy: { createdAt: 'desc' };
    }): Promise<StateEventRow[]>;
  };
  $transaction<T>(fn: (tx: LifecycleOperatorTx) => Promise<T>): Promise<T>;
}

export interface LifecycleHandlerOptions {
  /** Invalidación del cache del resolver; inyectable como spy en tests. */
  invalidateState?: (businessId: string) => void;
  /** Reloj inyectable para tests deterministas (validación de graceUntil). */
  now?: Date;
}

const BUSINESS_NOT_FOUND = {
  error: { code: 'business_not_found', message: 'Negocio no encontrado o inactivo' },
} as const;

/* ---------- PUT /businesses/:id/lifecycle ---------- */

/**
 * Fija el estado destino del negocio: `{ state, reason?, graceUntil? }`.
 * 1. Valida el payload vía resolveTransition (estado desconocido / GRACE sin
 *    graceUntil futuro → 400 TenantTransitionError; nunca 409).
 * 2. Aplica el parche sobre Business e inserta el TenantStateEvent en UNA
 *    transacción.
 * 3. invalidate(businessId) para que el corte/reactivación sea inmediato en este
 *    proceso (sin esperar al TTL del cache del resolver).
 */
export async function putLifecycleHandler(
  db: LifecycleOperatorDb,
  req: Request,
  res: Response,
  opts: LifecycleHandlerOptions = {},
) {
  try {
    const businessId = req.params.id;
    const business = await db.business.findFirst({ where: { id: businessId, eliminadoEn: null } });
    if (!business) return res.status(404).json(BUSINESS_NOT_FOUND);

    const body = (req.body ?? {}) as { state?: unknown; reason?: unknown; graceUntil?: unknown };
    let result;
    try {
      result = resolveTransition(
        business.lifecycle,
        {
          state: typeof body.state === 'string' ? body.state : String(body.state),
          reason: typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : null,
          graceUntil: typeof body.graceUntil === 'string' ? body.graceUntil : null,
        },
        opts.now ? { now: opts.now } : {},
      );
    } catch (e) {
      // Payload inválido → 400 (única respuesta de error de escritura; no existe 409).
      if (e instanceof TenantTransitionError) {
        return res.status(e.status).json({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    // Escritura atómica: parche de Business + evento de auditoría. NUNCA borra nada.
    const updated = await db.$transaction(async (tx) => {
      const row = await tx.business.update({ where: { id: businessId }, data: result.patch });
      await tx.tenantStateEvent.create({ data: { businessId, ...result.event } });
      return row;
    });

    // Corte/reactivación inmediatos en este proceso (multi-instancia: TTL corto acota).
    (opts.invalidateState ?? invalidate)(businessId);

    return res.json({
      id: updated.id,
      lifecycle: updated.lifecycle,
      graceUntil: updated.graceUntil,
      suspendedAt: updated.suspendedAt,
    });
  } catch (e) {
    console.error('[service-operator] error fijando lifecycle:', e);
    return res.status(500).json({ error: { code: 'server_error', message: 'No se pudo cambiar el estado del negocio' } });
  }
}

/* ---------- GET /businesses/:id/state-events ---------- */

/** Histórico de transiciones (from, to, reason, actor, createdAt) descendente. */
export async function listStateEventsHandler(db: LifecycleOperatorDb, req: Request, res: Response) {
  try {
    const businessId = req.params.id;
    const business = await db.business.findFirst({ where: { id: businessId, eliminadoEn: null } });
    if (!business) return res.status(404).json(BUSINESS_NOT_FOUND);

    const rows = await db.tenantStateEvent.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
    });
    const events = rows.map((e) => ({
      fromState: e.fromState,
      toState: e.toState,
      reason: e.reason,
      actor: e.actor,
      createdAt: e.createdAt,
    }));
    return res.json({ events });
  } catch (e) {
    console.error('[service-operator] error listando eventos de estado:', e);
    return res.status(500).json({ error: { code: 'server_error', message: 'No se pudo cargar el histórico de estados' } });
  }
}

/* ---------- Router ---------- */

export function buildLifecycleOperatorRouter(db: LifecycleOperatorDb): Router {
  const router = Router();
  router.put('/businesses/:id/lifecycle', (req, res) => {
    void putLifecycleHandler(db, req, res);
  });
  router.get('/businesses/:id/state-events', (req, res) => {
    void listStateEventsHandler(db, req, res);
  });
  return router;
}
