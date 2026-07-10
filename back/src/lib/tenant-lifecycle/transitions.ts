import { TenantLifecycle } from '../generated/prisma/client.js';

// Transiciones del ciclo de vida del negocio (kill switch server-authoritative).
//
// El operador fija DIRECTAMENTE el estado destino: cualquiera de los 4 estados puede llevar a
// cualquier otro, incluido TERMINATED → ACTIVE. NO hay máquina de estados con transiciones
// ilegales y, por tanto, NO existe respuesta 409. La única validación de escritura es de
// PAYLOAD (estado desconocido o GRACE sin `graceUntil` futuro → 400).
//
// Esta función es pura y con dependencias inyectables (`now`) para que el endpoint de operador
// (WU3) la reutilice sin lógica duplicada. NUNCA toca datos del negocio: solo calcula el parche
// de campos y el evento de auditoría a persistir.

/** Estados válidos del ciclo de vida (runtime, para validar payload no confiable). */
export const TENANT_LIFECYCLE_STATES = Object.values(TenantLifecycle) as TenantLifecycle[];

/** Actor por defecto cuando el llamante no especifica quién dispara la transición. */
export const DEFAULT_TRANSITION_ACTOR = 'operator';

/**
 * Error de validación de payload. Se mapea a HTTP 400 en el endpoint. NUNCA es 409: no existen
 * transiciones ilegales, solo payloads inválidos.
 */
export class TenantTransitionError extends Error {
  readonly status = 400 as const;
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'TenantTransitionError';
    this.code = code;
  }
}

/** Payload de cambio de estado (potencialmente no confiable: se valida). */
export interface TransitionPayload {
  /** Estado destino. Se valida contra `TENANT_LIFECYCLE_STATES`. */
  state: TenantLifecycle | string;
  /** Motivo opcional del cambio (queda en la auditoría). */
  reason?: string | null;
  /** Requerido y futuro solo cuando `state === GRACE`. */
  graceUntil?: Date | string | null;
  /** Quién dispara la transición; por defecto `operator`. */
  actor?: string;
}

/** Parche de campos a aplicar sobre `Business` (solo los campos que cambian). */
export interface BusinessLifecyclePatch {
  lifecycle: TenantLifecycle;
  graceUntil?: Date | null;
  suspendedAt?: Date | null;
}

/** Evento de auditoría resuelto (a insertar en `TenantStateEvent`). */
export interface ResolvedStateEvent {
  fromState: TenantLifecycle;
  toState: TenantLifecycle;
  reason: string | null;
  actor: string;
}

export interface TransitionResult {
  patch: BusinessLifecyclePatch;
  event: ResolvedStateEvent;
}

export interface TransitionOptions {
  /** Reloj inyectable para tests deterministas. */
  now?: Date;
}

function isKnownState(value: unknown): value is TenantLifecycle {
  return typeof value === 'string' && (TENANT_LIFECYCLE_STATES as string[]).includes(value);
}

/**
 * Calcula el parche de campos y el evento de auditoría de fijar `payload.state` sobre un negocio
 * que hoy está en `fromState`. No escribe nada: es responsabilidad del llamante persistir
 * `result.patch` en `Business` e insertar `result.event` en `TenantStateEvent`.
 */
export function resolveTransition(
  fromState: TenantLifecycle,
  payload: TransitionPayload,
  opts: TransitionOptions = {},
): TransitionResult {
  const now = opts.now ?? new Date();

  // 1) Estado destino conocido (validación de payload → 400, jamás 409).
  if (!isKnownState(payload.state)) {
    throw new TenantTransitionError(
      'unknown_state',
      `Estado destino desconocido: ${String(payload.state)}`,
    );
  }
  const toState: TenantLifecycle = payload.state;

  // 2) Side-effects por estado destino (no restricciones de transición).
  const patch: BusinessLifecyclePatch = { lifecycle: toState };

  if (toState === TenantLifecycle.GRACE) {
    // → GRACE exige `graceUntil` futuro. Si falta o es pasada → 400 (payload inválido).
    const graceUntil = payload.graceUntil == null ? null : new Date(payload.graceUntil);
    if (graceUntil == null || Number.isNaN(graceUntil.getTime()) || graceUntil.getTime() <= now.getTime()) {
      throw new TenantTransitionError(
        'grace_until_required',
        'GRACE requiere un `graceUntil` en el futuro.',
      );
    }
    patch.graceUntil = graceUntil;
  } else if (toState === TenantLifecycle.SUSPENDED) {
    // → SUSPENDED marca cuándo se cortó el servicio.
    patch.suspendedAt = now;
  } else if (toState === TenantLifecycle.ACTIVE) {
    // → ACTIVE (desde cualquiera, incluido TERMINATED) limpia gracia/suspensión; el servicio se
    // restaura al instante porque los datos nunca se fueron.
    patch.graceUntil = null;
    patch.suspendedAt = null;
  }
  // → TERMINATED: solo cambia el estado. No toca datos ni dispara purga alguna.

  // 3) Evento de auditoría inmutable.
  const event: ResolvedStateEvent = {
    fromState,
    toState,
    reason: payload.reason ?? null,
    actor: payload.actor ?? DEFAULT_TRANSITION_ACTOR,
  };

  return { patch, event };
}
