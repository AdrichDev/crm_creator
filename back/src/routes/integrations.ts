import { Router, type Response } from 'express';
import { env } from '../env.js';
import { prisma } from '../prisma.js';
import { authenticate } from '../middleware/auth.js';
import { staffOnly } from '../middleware/rbac.js';
import { requireOperatorToken } from '../middleware/operator-token.js';
import type { AuthedRequest } from '../middleware/types.js';
import { emit } from '../lib/automation/index.js';
import {
  authorizationUrl,
  handleCallback,
  disconnectIntegration,
  takeOAuthState,
  ScopeInsufficientError,
  type EstadoCredencial,
  type Servicio,
} from '../lib/integrations/oauth.js';
import { syncBusinessNow } from '../lib/calendarSync.js';

// ---------------------------------------------------------------------------
// crm-integraciones-comunicacion (WU1, T1.5): rutas HTTP del flujo OAuth.
//   POST   /integrations/:servicio/connect  → devuelve la URL de consentimiento.
//   GET    /integrations/:servicio/callback → destino del redirect de Google.
//   POST   /integrations/:servicio/revoke   → soft-delete de la credencial.
//
// El callback es PÚBLICO (Google redirige el navegador sin Bearer): la identidad
// viaja en el `state` nonce anti-CSRF (businessId + servicio, un solo uso). connect
// y revoke sí exigen sesión de staff y scopean por el businessId del token.
// Mismo patrón mixto que routes/calendar.ts (feed público + autoservicio autenticado).
//
// WU1 cubre Gmail y Calendar de TENANT (businessId de la sesión). WU3 (T3.1/T3.2)
// añade el scope ADMIN (businessId=null, Calendar de plataforma) bajo las rutas
// /admin/:servicio/*, protegidas por el service token del operador (NUNCA por sesión
// de tenant). El callback es COMPARTIDO: la identidad (businessId=null) viaja en el
// `state` que solo el operador puede generar (nonce inadivinable, un solo uso), así que
// un tenant normal jamás puede tocar una credencial admin.
// ---------------------------------------------------------------------------

export const integrationsRouter = Router();

// Servicios respaldados por OAuth de Google. WhatsApp (WU2) NO pasa por aquí:
// usa un flujo de credencial marcador sin OAuth real.
const OAUTH_SERVICES: Servicio[] = ['gmail', 'calendar'];

function parseServicio(raw: string): Servicio | null {
  return (OAUTH_SERVICES as string[]).includes(raw) ? (raw as Servicio) : null;
}

/** Redirect de vuelta al front tras el callback. El `estado` es el contrato con la UI. */
/** Path same-origin válido para volver tras el OAuth (evita open-redirect). */
function isSafeReturnPath(p: unknown): p is string {
  return typeof p === 'string' && p.startsWith('/') && !p.startsWith('//');
}

function frontRedirect(servicio: string, estado: string, returnTo?: string | null): string {
  const params = new URLSearchParams({ servicio, estado });
  const path = isSafeReturnPath(returnTo) ? returnTo : '/ajustes/integraciones';
  return `${env.frontUrl}${path}?${params}`;
}

// ── Estado de integraciones (GET /) ──────────────────────────────────────────

/** Fila mínima de credencial que necesita el resumen de estado. */
export interface CredencialResumen {
  servicio: string;
  estado: string;
  updatedAt: Date;
  scopesOauth: string[];
}

export interface IntegracionEstado {
  servicio: Servicio;
  estado: EstadoCredencial | null; // null = nunca conectada
  connectedAt?: string;
  scopesOauth?: string[];
}

/**
 * Proyecta las filas de credencial_oauth al contrato de la UI: una entrada por
 * servicio OAuth, con estado null si el negocio nunca conectó ese servicio.
 * connectedAt = última transición de la credencial (updatedAt), no la fecha original.
 */
export function buildIntegrationsStatus(rows: CredencialResumen[]): IntegracionEstado[] {
  return OAUTH_SERVICES.map((servicio) => {
    const row = rows.find((r) => r.servicio === servicio);
    if (!row) return { servicio, estado: null };
    return {
      servicio,
      estado: row.estado as EstadoCredencial,
      connectedAt: row.updatedAt.toISOString(),
      scopesOauth: row.scopesOauth,
    };
  });
}

// GET / — estado por servicio OAuth del negocio de la sesión. Nunca expone tokens:
// solo estado, fecha y scopes concedidos.
integrationsRouter.get('/', authenticate, staffOnly, async (req: AuthedRequest, res: Response) => {
  if (!req.businessId) {
    return res.status(400).json({ error: { code: 'no_business', message: 'La sesión no tiene un negocio activo' } });
  }
  const rows = await prisma.oAuthCredential.findMany({
    where: { businessId: req.businessId, servicio: { in: OAUTH_SERVICES } },
    select: { servicio: true, estado: true, updatedAt: true, scopesOauth: true },
  });
  res.json({ items: buildIntegrationsStatus(rows) });
});

// POST /:servicio/connect — genera la URL de consentimiento con nonce anti-CSRF
// ligado al businessId de la sesión. El front abre esa URL.
integrationsRouter.post('/:servicio/connect', authenticate, staffOnly, async (req: AuthedRequest, res: Response) => {
  const servicio = parseServicio(req.params.servicio);
  if (!servicio) {
    return res.status(404).json({ error: { code: 'not_found', message: 'Servicio de integración no soportado' } });
  }
  if (!req.businessId) {
    return res.status(400).json({ error: { code: 'no_business', message: 'La sesión no tiene un negocio activo' } });
  }
  try {
    const rawReturn = (req.body as { returnTo?: unknown } | undefined)?.returnTo;
    const returnTo = isSafeReturnPath(rawReturn) ? rawReturn : null;
    const url = await authorizationUrl(servicio, req.businessId, returnTo);
    res.json({ url });
  } catch {
    // authorizationUrl lanza si faltan GOOGLE_OAUTH_* en el entorno.
    res.status(503).json({ error: { code: 'oauth_no_configurado', message: 'Integración OAuth no configurada en el servidor' } });
  }
});

// GET /:servicio/callback — PÚBLICO. Consume el `state`, intercambia el code y
// persiste la credencial cifrada. Redirige al front con el resultado en `estado`.
integrationsRouter.get('/:servicio/callback', async (req: AuthedRequest, res: Response) => {
  const servicio = parseServicio(req.params.servicio);
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';

  if (!servicio) {
    return res.status(404).json({ error: { code: 'not_found', message: 'Servicio de integración no soportado' } });
  }

  const entry = takeOAuthState(state);
  // state inválido/caducado/reutilizado, o no coincide con el servicio de la URL → anti-CSRF.
  if (!code || !entry || entry.servicio !== servicio) {
    return res.redirect(frontRedirect(servicio, 'error'));
  }

  try {
    await handleCallback(entry.servicio, code, entry.businessId);
    res.redirect(frontRedirect(servicio, 'conectado', entry.returnTo));
  } catch (err) {
    if (err instanceof ScopeInsufficientError) {
      // Telemetría (Decisión 6): scope insuficiente. Soft-fail — no rompe el redirect.
      void emit(
        'integracion.scope_insuficiente',
        { servicio, requerido: err.required, concedidos: err.granted },
        { businessId: entry.businessId ?? '' },
      ).catch(() => {});
      return res.redirect(frontRedirect(servicio, 'scope_insuficiente', entry.returnTo));
    }
    console.error(`[integrations] callback ${servicio} falló:`, (err as Error).message);
    res.redirect(frontRedirect(servicio, 'error', entry.returnTo));
  }
});

// POST /:servicio/revoke — soft-delete de la credencial del negocio de la sesión.
integrationsRouter.post('/:servicio/revoke', authenticate, staffOnly, async (req: AuthedRequest, res: Response) => {
  const servicio = parseServicio(req.params.servicio);
  if (!servicio) {
    return res.status(404).json({ error: { code: 'not_found', message: 'Servicio de integración no soportado' } });
  }
  if (!req.businessId) {
    return res.status(400).json({ error: { code: 'no_business', message: 'La sesión no tiene un negocio activo' } });
  }
  await disconnectIntegration(req.businessId, servicio);
  res.status(204).end();
});

// POST /:servicio/sync — sincronización COMPLETA e inmediata (botón "Sincronizar
// Calendar" en /citas). Solo Calendar. Trae TODAS las citas del Google Calendar del
// negocio desde hoy, no solo las de la ventana incremental del poller.
integrationsRouter.post('/:servicio/sync', authenticate, staffOnly, async (req: AuthedRequest, res: Response) => {
  const servicio = parseServicio(req.params.servicio);
  if (servicio !== 'calendar') {
    return res.status(404).json({ error: { code: 'not_found', message: 'La sincronización manual solo aplica a Calendar' } });
  }
  if (!req.businessId) {
    return res.status(400).json({ error: { code: 'no_business', message: 'La sesión no tiene un negocio activo' } });
  }
  try {
    await syncBusinessNow(req.businessId);
    res.json({ ok: true });
  } catch (err) {
    console.error('[integrations] sync calendar falló:', (err as Error).message);
    res.status(500).json({ error: { code: 'sync_failed', message: 'No se pudo sincronizar el calendario' } });
  }
});

// ── Credencial ADMIN (businessId=null) — solo operador (WU3, T3.1/T3.2) ───────
//
// Solo Calendar tiene credencial admin (Decisión 4 del design + spec.md). Estas
// rutas se protegen con el service token del operador (x-service-token), el mismo
// gate que cerró el hallazgo CRITICAL de rol de operador. Un tenant normal no puede
// alcanzarlas (no tiene el token) ni forjar el `state` admin del callback.

// Solo se admite el servicio admin de Calendar (Gmail/WhatsApp son siempre por tenant).
function parseAdminServicio(raw: string): Servicio | null {
  return raw === 'calendar' ? 'calendar' : null;
}

// POST /admin/:servicio/connect — el operador inicia el OAuth de la credencial de
// plataforma (businessId=null). Devuelve la URL de consentimiento con nonce admin.
integrationsRouter.post('/admin/:servicio/connect', requireOperatorToken(), async (req: AuthedRequest, res: Response) => {
  const servicio = parseAdminServicio(req.params.servicio);
  if (!servicio) {
    return res.status(404).json({ error: { code: 'not_found', message: 'Servicio admin no soportado' } });
  }
  try {
    // businessId=null EXPLÍCITO → credencial admin (scope='admin' en el callback).
    const url = await authorizationUrl(servicio, null);
    res.json({ url });
  } catch {
    res.status(503).json({ error: { code: 'oauth_no_configurado', message: 'Integración OAuth no configurada en el servidor' } });
  }
});

// POST /admin/:servicio/revoke — soft-delete de la credencial admin (businessId=null).
integrationsRouter.post('/admin/:servicio/revoke', requireOperatorToken(), async (req: AuthedRequest, res: Response) => {
  const servicio = parseAdminServicio(req.params.servicio);
  if (!servicio) {
    return res.status(404).json({ error: { code: 'not_found', message: 'Servicio admin no soportado' } });
  }
  await disconnectIntegration(null, servicio);
  res.status(204).end();
});
