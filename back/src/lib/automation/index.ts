import crypto from 'node:crypto';
import { env } from '../../env.js';
import { sign } from './signer.js';
import type { AutomationEventName, AutomationPayloads, AutomationEnvelope } from './events.js';

export type { AutomationEventName, AutomationPayloads, AutomationEnvelope } from './events.js';
export { sign, verify } from './signer.js';

// ---------------------------------------------------------------------------
// Testable precondition checker (extraída para poder hacer unit-test de H2
// sin necesitar un fetch real ni mockear el módulo completo).
// ---------------------------------------------------------------------------
export type EmitPrecondition = 'ok' | 'disabled' | 'blocked_no_secret';
export function checkEmitPrecondition(url: string, secret: string): EmitPrecondition {
  if (!url) return 'disabled';
  if (!secret) return 'blocked_no_secret';
  return 'ok';
}

export type EmitResult =
  | { status: 'sent'; eventId: string }
  | { status: 'skipped'; reason: 'disabled' | 'duplicate' }
  | { status: 'failed'; eventId: string; error: string };

export interface EmitOptions {
  businessId: string;
  eventId?: string;       // idempotencia; si se omite → uuid
  occurredAt?: Date;
}

// Memoria de eventos ya enviados en este proceso → idempotencia barata.
// (El de-dup definitivo lo hace n8n por eventId; esto evita reenvíos locales.)
const seen = new Set<string>();

/** Solo para tests: limpia la memoria de idempotencia. */
export function resetEmitterState() { seen.clear(); }

function delay(ms: number) { return new Promise<void>((r) => setTimeout(r, ms)); }

/**
 * Publica un evento de dominio hacia n8n. FALLO SUAVE: nunca lanza al caller.
 * - Si el webhook no está configurado → no-op (`skipped: disabled`).
 * - Reintenta con backoff hasta `automationMaxAttempts`.
 * - Cualquier error final se traga y se devuelve como `failed` (el caller decide,
 *   p.ej. marcar emailSent:false). El flujo de negocio del CRM nunca se rompe.
 */
export async function emit<N extends AutomationEventName>(
  name: N,
  data: AutomationPayloads[N],
  opts: EmitOptions,
): Promise<EmitResult> {
  const url = env.automationWebhookUrl;
  if (!url) return { status: 'skipped', reason: 'disabled' };

  // H2: si hay URL pero el secreto está vacío, firmar produciría un HMAC trivial
  // (secreto vacío) que cualquiera podría reproducir. Bloqueamos en lugar de
  // enviar mensajes inseguros; el operador debe configurar el secreto.
  if (!env.automationWebhookSecret) {
    console.warn('[automation] AUTOMATION_WEBHOOK_URL está configurada pero AUTOMATION_WEBHOOK_SECRET está vacío — emit bloqueado para evitar firma insegura.');
    return { status: 'skipped', reason: 'disabled' };
  }

  const eventId = opts.eventId ?? crypto.randomUUID();
  if (seen.has(eventId)) return { status: 'skipped', reason: 'duplicate' };

  const envelope: AutomationEnvelope<N> = {
    eventId,
    name,
    businessId: opts.businessId,
    occurredAt: (opts.occurredAt ?? new Date()).toISOString(),
    data,
  };
  const rawBody = JSON.stringify(envelope);

  const maxAttempts = Math.max(1, env.automationMaxAttempts);
  let lastError = 'unknown';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const timestamp = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.automationTimeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-Automation-Event': name,
          'X-Automation-Id': eventId,
          'X-Automation-Timestamp': String(timestamp),
          'X-Automation-Signature': sign(env.automationWebhookSecret, timestamp, rawBody),
        },
        body: rawBody,
      });
      clearTimeout(timer);
      if (res.ok) {
        seen.add(eventId);
        return { status: 'sent', eventId };
      }
      lastError = `http_${res.status}`;
    } catch (e) {
      clearTimeout(timer);
      lastError = e instanceof Error ? e.name : 'fetch_error';
    }
    if (attempt < maxAttempts) await delay(Math.min(2000, 200 * 2 ** (attempt - 1)));
  }

  // No se loguea `data` (puede contener enlaces con token): solo metadatos.
  console.warn(`[automation] emit ${name} falló tras ${maxAttempts} intentos (${lastError})`);
  return { status: 'failed', eventId, error: lastError };
}
