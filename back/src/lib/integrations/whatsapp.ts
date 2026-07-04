// ---------------------------------------------------------------------------
// WhatsApp delegado a n8n (crm-integraciones-comunicacion, WU2). Ref: design.md
// Decisión 5 — el CRM NO guarda secreto real de Twilio ni usa su SDK en el back.
// La fila `OAuthCredential` con servicio='whatsapp' es un MARCADOR de estado de
// conexión (accessToken='', sin refreshToken/expiresAt/scopesOauth reales): el
// secreto de Twilio vive solo en variables de entorno de n8n.
//
// T2.1 — connectWhatsApp: persiste/reactiva el marcador (find-then-write, mismo
//        patrón null-safe que handleCallback en oauth.ts).
// T2.2 — disconnectWhatsApp: NO reimplementa revoke; reusa disconnectIntegration()
//        de oauth.ts (mismo soft-delete estado='revoked' + revokedAt que Gmail/Calendar).
// T2.3 — notifyWhatsAppEvent: emite un evento tipado a n8n vía emit() (Decisión 6).
//        Fire-and-forget / soft-fail: NUNCA lanza. Sin reintento adicional desde el
//        CRM más allá del retry que emit() ya hace para alcanzar n8n (llegar al
//        webhook) — si Twilio falla DENTRO de n8n una vez aceptado el evento, ese
//        fallo es interno de n8n y el backend nunca reintenta esa entrega.
// ---------------------------------------------------------------------------

import { emit as defaultEmit } from '../automation/index.js';
import {
  defaultDeps,
  disconnectIntegration,
  type OAuthDeps,
} from './oauth.js';

export type WhatsAppTipoEvento = 'connected' | 'revoked';

/** Dependencia de emisión inyectable (permite testear sin red/HMAC real). */
export interface WhatsAppNotifyDeps {
  emit: typeof defaultEmit;
}

function defaultNotifyDeps(): WhatsAppNotifyDeps {
  return { emit: defaultEmit };
}

/**
 * Conecta (o reconecta) WhatsApp para un negocio. Sin OAuth real: crea/actualiza
 * la fila marcador (accessToken='', estado='connected'). WhatsApp SIEMPRE es
 * scope='tenant' — no existe credencial admin para este servicio (a diferencia
 * de Calendar, spec.md no define ese caso de uso).
 */
export async function connectWhatsApp(
  businessId: string,
  oauthDeps: OAuthDeps = defaultDeps(),
  notifyDeps: WhatsAppNotifyDeps = defaultNotifyDeps(),
): Promise<void> {
  if (!businessId) {
    throw new Error('connectWhatsApp requiere businessId: WhatsApp no admite credencial admin');
  }

  const existing = await oauthDeps.findCredential(businessId, 'whatsapp');
  if (existing) {
    await oauthDeps.updateCredential(existing.id, {
      accessToken: '',
      refreshToken: null,
      expiresAt: null,
      scopesOauth: [],
      estado: 'connected',
      revokedAt: null,
    });
    await notifyWhatsAppEvent(businessId, existing.id, 'connected', notifyDeps);
    return;
  }

  await oauthDeps.createCredential({
    businessId,
    servicio: 'whatsapp',
    scope: 'tenant',
    accessToken: '',
    refreshToken: null,
    expiresAt: null,
    scopesOauth: [],
    estado: 'connected',
  });

  // createCredential no devuelve el id (mismo contrato que handleCallback en oauth.ts);
  // se relee para poder emitir el evento con el credentialId real.
  const created = await oauthDeps.findCredential(businessId, 'whatsapp');
  if (created) await notifyWhatsAppEvent(businessId, created.id, 'connected', notifyDeps);
}

/**
 * Revoca WhatsApp de un negocio. NO reimplementa el soft-delete: delega en
 * disconnectIntegration() de oauth.ts (T2.2 — mismo camino que Gmail/Calendar,
 * sin endpoint nuevo). Solo añade la notificación a n8n (T2.3) tras revocar.
 */
export async function disconnectWhatsApp(
  businessId: string,
  oauthDeps: OAuthDeps = defaultDeps(),
  notifyDeps: WhatsAppNotifyDeps = defaultNotifyDeps(),
): Promise<void> {
  const revoked = await disconnectIntegration(businessId, 'whatsapp', oauthDeps);
  if (revoked) await notifyWhatsAppEvent(businessId, revoked.id, 'revoked', notifyDeps);
}

/**
 * Emite el evento `whatsapp.credential_event` a n8n. Soft-fail: nunca lanza,
 * devuelve `boolean` (despachado o no) igual que notify.ts. Sin reintento propio
 * más allá del que ya hace emit() para llegar al webhook.
 */
export async function notifyWhatsAppEvent(
  businessId: string,
  credentialId: string,
  tipoEvento: WhatsAppTipoEvento,
  deps: WhatsAppNotifyDeps = defaultNotifyDeps(),
): Promise<boolean> {
  try {
    const r = await deps.emit(
      'whatsapp.credential_event',
      { businessId, credentialId, tipoEvento },
      { businessId, eventId: `${credentialId}:${tipoEvento}` },
    );
    return r.status === 'sent' || (r.status === 'skipped' && r.reason === 'duplicate');
  } catch (err) {
    console.error(`[whatsapp] notifyWhatsAppEvent soft-fail (${credentialId})`, (err as Error).message);
    return false;
  }
}
