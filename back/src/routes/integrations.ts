import { Router, type Response } from 'express';
import { env } from '../env.js';
import { authenticate } from '../middleware/auth.js';
import { staffOnly } from '../middleware/rbac.js';
import type { AuthedRequest } from '../middleware/types.js';
import { emit } from '../lib/automation/index.js';
import {
  authorizationUrl,
  handleCallback,
  disconnectIntegration,
  takeOAuthState,
  ScopeInsufficientError,
  type Servicio,
} from '../lib/integrations/oauth.js';

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
// WU1 cubre Gmail (tenant). El scope admin (businessId=null, Calendar de plataforma)
// llega en WU3 con su gate de operador; aquí no se crea ninguna credencial admin.
// ---------------------------------------------------------------------------

export const integrationsRouter = Router();

// Servicios respaldados por OAuth de Google. WhatsApp (WU2) NO pasa por aquí:
// usa un flujo de credencial marcador sin OAuth real.
const OAUTH_SERVICES: Servicio[] = ['gmail', 'calendar'];

function parseServicio(raw: string): Servicio | null {
  return (OAUTH_SERVICES as string[]).includes(raw) ? (raw as Servicio) : null;
}

/** Redirect de vuelta al front tras el callback. El `estado` es el contrato con la UI. */
function frontRedirect(servicio: string, estado: string): string {
  const params = new URLSearchParams({ servicio, estado });
  return `${env.frontUrl}/ajustes/integraciones?${params}`;
}

// POST /:servicio/connect — genera la URL de consentimiento con nonce anti-CSRF
// ligado al businessId de la sesión. El front abre esa URL.
integrationsRouter.post('/:servicio/connect', authenticate, staffOnly, (req: AuthedRequest, res: Response) => {
  const servicio = parseServicio(req.params.servicio);
  if (!servicio) {
    return res.status(404).json({ error: { code: 'not_found', message: 'Servicio de integración no soportado' } });
  }
  if (!req.businessId) {
    return res.status(400).json({ error: { code: 'no_business', message: 'La sesión no tiene un negocio activo' } });
  }
  try {
    const url = authorizationUrl(servicio, req.businessId);
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
    res.redirect(frontRedirect(servicio, 'conectado'));
  } catch (err) {
    if (err instanceof ScopeInsufficientError) {
      // Telemetría (Decisión 6): scope insuficiente. Soft-fail — no rompe el redirect.
      void emit(
        'integracion.scope_insuficiente',
        { servicio, requerido: err.required, concedidos: err.granted },
        { businessId: entry.businessId ?? '' },
      ).catch(() => {});
      return res.redirect(frontRedirect(servicio, 'scope_insuficiente'));
    }
    console.error(`[integrations] callback ${servicio} falló:`, (err as Error).message);
    res.redirect(frontRedirect(servicio, 'error'));
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
