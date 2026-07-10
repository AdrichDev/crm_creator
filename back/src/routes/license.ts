import { Router, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import { resolveTenantState, type TenantStateDb } from '../lib/tenant-lifecycle/resolver.js';

// ---------------------------------------------------------------------------
// crm-tenant-lifecycle-gate (WU3.3) — POST /license/heartbeat, FIRMADO (HMAC).
//
// Para las formas binario/offline (exe/apk exportados): el binario reporta su
// businessId con una firma HMAC-SHA256 y el back responde el estado de ciclo de
// vida FIRMADO, para que el cliente verifique que la respuesta viene del servidor
// y no de un proxy manipulado.
//
// DISUASIÓN, no garantía (design §6, matriz de palanca): un binario self-host
// puede parchearse para ignorar (o no llamar) este heartbeat. El corte real y
// autoritativo es SIEMPRE server-side (tenantGate sobre las rutas del back).
//
// Auth: HMAC con secreto compartido LICENSE_HEARTBEAT_SECRET (env-only, mismo
// espíritu fail-closed que OPERATOR_SERVICE_TOKEN): sin secreto configurado el
// endpoint responde 503 y no firma nada. El timestamp del cliente se valida en
// una ventana corta como freno básico de replay.
// ---------------------------------------------------------------------------

/** Ventana máxima de desfase aceptada al timestamp del cliente (anti-replay básico). */
export const HEARTBEAT_MAX_SKEW_MS = 5 * 60 * 1000;

/** Cadena canónica que firma el CLIENTE en la petición (header x-license-signature). */
export function canonicalHeartbeatRequest(businessId: string, ts: string, nonce: string): string {
  return `${businessId}.${ts}.${nonce}`;
}

/** Cadena canónica que firma el SERVIDOR en la respuesta (campo `signature`). */
export function canonicalHeartbeatResponse(
  businessId: string,
  lifecycle: string,
  graceUntilIso: string,
  ts: string,
): string {
  return `${businessId}.${lifecycle}.${graceUntilIso}.${ts}`;
}

/** HMAC-SHA256 hex del payload canónico. */
export function signHeartbeat(secret: string, payload: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/** Comparación en tiempo constante (mismo patrón que operator-token.ts). */
function signaturesEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/** Dependencias inyectables para tests (patrón DI del repo). */
export interface HeartbeatDeps {
  /** Secreto HMAC; por defecto LICENSE_HEARTBEAT_SECRET (leído por request). */
  secret?: () => string;
  /** BD del resolver de estado; por defecto el prisma global. */
  db?: TenantStateDb;
  /** Reloj inyectable para tests deterministas (ventana de replay y ts de respuesta). */
  now?: () => Date;
}

/**
 * Handler de `POST /license/heartbeat`. Body: `{ businessId, ts, nonce? }` +
 * header `x-license-signature` = HMAC(secret, `businessId.ts.nonce`).
 * Responde `{ businessId, lifecycle, graceUntil?, ts, signature }` con
 * `signature` = HMAC(secret, `businessId.lifecycle.graceUntil.ts`).
 * Un negocio inexistente resuelve TERMINATED (fail-closed del resolver): el
 * binario huérfano recibe corte, nunca ACTIVE por defecto.
 */
export async function heartbeatHandler(deps: HeartbeatDeps, req: Request, res: Response) {
  try {
    const secret = (deps.secret ?? (() => process.env.LICENSE_HEARTBEAT_SECRET ?? ''))();
    if (!secret) {
      // Fail-closed: sin secreto configurado no se emite NINGUNA respuesta de estado
      // (firmada o no). El heartbeat queda deshabilitado, no degradado a "sin firma".
      return res.status(503).json({
        error: { code: 'heartbeat_unconfigured', message: 'Heartbeat de licencia no configurado' },
      });
    }

    const body = (req.body ?? {}) as { businessId?: unknown; ts?: unknown; nonce?: unknown };
    const businessId = typeof body.businessId === 'string' ? body.businessId : '';
    const ts = typeof body.ts === 'string' ? body.ts : '';
    const nonce = typeof body.nonce === 'string' ? body.nonce : '';
    if (!businessId || !ts) {
      return res.status(400).json({ error: { code: 'invalid_payload', message: 'Faltan businessId o ts' } });
    }

    // Firma del cliente en tiempo constante. Sin firma válida no se revela NADA
    // (ni siquiera si el negocio existe).
    const provided = req.header('x-license-signature') ?? '';
    const expected = signHeartbeat(secret, canonicalHeartbeatRequest(businessId, ts, nonce));
    if (!provided || !signaturesEqual(provided, expected)) {
      return res.status(401).json({ error: { code: 'invalid_signature', message: 'Firma inválida' } });
    }

    // Freno básico de replay: el ts firmado debe estar dentro de la ventana.
    const now = (deps.now ?? (() => new Date()))();
    const clientTs = new Date(ts);
    if (Number.isNaN(clientTs.getTime()) || Math.abs(now.getTime() - clientTs.getTime()) > HEARTBEAT_MAX_SKEW_MS) {
      return res.status(401).json({ error: { code: 'stale_timestamp', message: 'Timestamp fuera de ventana' } });
    }

    const { effective, graceUntil } = await resolveTenantState(businessId, deps.db ? { db: deps.db } : {});
    const respTs = now.toISOString();
    const graceIso = graceUntil ? graceUntil.toISOString() : '';
    const signature = signHeartbeat(secret, canonicalHeartbeatResponse(businessId, effective, graceIso, respTs));

    return res.json({
      businessId,
      lifecycle: effective,
      ...(graceUntil ? { graceUntil: graceIso } : {}),
      ts: respTs,
      signature,
    });
  } catch (e) {
    console.error('[license] error en heartbeat:', e);
    return res.status(500).json({ error: { code: 'server_error', message: 'Error interno' } });
  }
}

export function buildLicenseRouter(deps: HeartbeatDeps = {}): Router {
  const router = Router();
  router.post('/heartbeat', (req, res) => {
    void heartbeatHandler(deps, req, res);
  });
  return router;
}

/** Router de producción (secreto desde env, prisma global vía resolver). */
export const licenseRouter = buildLicenseRouter();
