// ---------------------------------------------------------------------------
// Envío de email vía Gmail API del propio negocio (crm-integraciones-comunicacion,
// WU1, T1.6). Consumidor de getValidToken(): el refresh/lock/reauth vive en oauth.ts,
// aquí solo se construye el MIME y se llama a users.messages.send.
//   - Negocio sin Gmail conectado (IntegrationMissingError) → 'missing' (el caller
//     cae a SMTP, sin ruido).
//   - Token muerto en vuelo (401) o refresh fallido → ReauthRequiredError (el caller
//     hace fallback a notify.ts + telemetría, sin lanzar al negocio).
//   - 5xx del proveedor → ProviderError (el caller emite integracion.fallo_proveedor).
// Deps (getToken + fetch) inyectables → unit-test sin red ni credencial real.
// ---------------------------------------------------------------------------

import {
  getValidToken,
  IntegrationMissingError,
  ReauthRequiredError,
} from './oauth.js';

const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

/** Mensaje mínimo a enviar por Gmail (el From lo pone la cuenta autenticada). */
export interface GmailMessage {
  to: string;
  subject: string;
  html: string;
}

/** 'sent' = enviado; 'missing' = el negocio no tiene Gmail conectado (cae a SMTP). */
export type GmailSendResult = 'sent' | 'missing';

/** Fallo del proveedor (5xx / red) — el caller lo traduce a telemetría, no lo propaga al negocio. */
export class ProviderError extends Error {
  readonly servicio: string;
  readonly codigo: string;
  constructor(servicio: string, codigo: string) {
    super(`Fallo del proveedor ${servicio}: ${codigo}`);
    this.name = 'ProviderError';
    this.servicio = servicio;
    this.codigo = codigo;
  }
}

/** Puerto inyectable: obtención de token + fetch. */
export interface GmailSendDeps {
  getToken(businessId: string): Promise<string>;
  fetch: typeof fetch;
}

function defaultDeps(): GmailSendDeps {
  return {
    getToken: (businessId) => getValidToken(businessId, 'gmail'),
    fetch: (...args) => fetch(...args),
  };
}

/** Codifica el Subject en RFC 2047 (base64) para soportar acentos/UTF-8. */
function encodeSubject(subject: string): string {
  return `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
}

/** Construye el mensaje RFC 2822 y lo codifica en base64url para el campo `raw`. */
function buildRawMessage(msg: GmailMessage): string {
  const mime = [
    `To: ${msg.to}`,
    `Subject: ${encodeSubject(msg.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(msg.html, 'utf8').toString('base64'),
  ].join('\r\n');
  return Buffer.from(mime, 'utf8').toString('base64url');
}

/**
 * Envía un email por el Gmail conectado del negocio. Devuelve 'missing' si el negocio
 * no conectó Gmail. Lanza ReauthRequiredError (token muerto) o ProviderError (5xx) —
 * ambos los maneja notify.ts como fallback + telemetría, sin romper el negocio.
 */
export async function sendGmailMessage(
  businessId: string,
  msg: GmailMessage,
  deps: GmailSendDeps = defaultDeps(),
): Promise<GmailSendResult> {
  let token: string;
  try {
    token = await deps.getToken(businessId);
  } catch (e) {
    if (e instanceof IntegrationMissingError) return 'missing';
    throw e; // ReauthRequiredError u otro → lo maneja el caller
  }

  const res = await deps.fetch(GMAIL_SEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: buildRawMessage(msg) }),
  });

  if (res.ok) return 'sent';
  // Token revocado/caducado en vuelo → tratar como reauth (Decisión 3: evento en vuelo).
  if (res.status === 401) throw new ReauthRequiredError(businessId, 'gmail');
  throw new ProviderError('gmail', `http_${res.status}`);
}
