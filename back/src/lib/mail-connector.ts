import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { prisma } from '../prisma.js';
import { getTenantSecret } from './tenant-secrets/store.js';
import type { TenantSecretDb } from './tenant-secrets/store.js';

// ---------------------------------------------------------------------------
// crm-tenant-oauth-creds-and-mail-connector (Fase 2): conector de correo IMAP/SMTP
// provider-agnóstico para tenants con buzón fuera de Google/Microsoft (Hostinger,
// Zoho, cPanel, IONOS, GoDaddy…). Reusa el store de secretos por-tenant existente
// (6 slots del catálogo: MAIL_ADDRESS, MAIL_APP_PASSWORD, IMAP_HOST/PORT, SMTP_HOST/PORT).
//
// Reglas no negociables:
//   - `MAIL_APP_PASSWORD` NUNCA se loguea ni se interpola en un error/detail.
//   - Sin config → error claro (`MailNotConfiguredError`), nunca un crash opaco.
//   - Lectura IMAP: timeout duro en CADA operación de red (connect/lock/fetch/logout),
//     best-effort — nunca cuelga aunque el servidor no responda.
// ---------------------------------------------------------------------------

export const DEFAULT_IMAP_PORT = 993;
export const DEFAULT_SMTP_PORT = 465;
const DEFAULT_READ_TIMEOUT_MS = 10_000;
const DEFAULT_READ_LIMIT = 10;
const DEFAULT_TEST_TIMEOUT_MS = 8_000;
const LOGOUT_TIMEOUT_MS = 3_000;

/** El tenant no tiene correo propio configurado, o falta el host necesario para la operación pedida. */
export class MailNotConfiguredError extends Error {
  constructor(message = 'Correo del tenant no configurado') {
    super(message);
    this.name = 'MailNotConfiguredError';
  }
}

export interface ResolvedMailConfig {
  address: string;
  appPassword: string;
  imapHost: string | null;
  imapPort: number;
  smtpHost: string | null;
  smtpPort: number;
}

function parsePort(raw: string | undefined, fallback: number): number {
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Resuelve los 6 secretos de correo del tenant (`getTenantSecret`, sin fallback a env
 * central — el conector es opt-in por-tenant). `null` = el tenant NO configuró correo
 * propio (`MAIL_ADDRESS`/`MAIL_APP_PASSWORD` ausentes): el caller debe caer a su
 * fallback (SMTP central) SIN error, igual que el 'missing' de Gmail. Puertos con
 * default sano si se dejan vacíos.
 */
export async function resolveMailConfig(
  businessId: string,
  db: TenantSecretDb = prisma,
): Promise<ResolvedMailConfig | null> {
  const [address, appPassword, imapHost, imapPortRaw, smtpHost, smtpPortRaw] = await Promise.all([
    getTenantSecret(businessId, 'MAIL_ADDRESS', {}, db),
    getTenantSecret(businessId, 'MAIL_APP_PASSWORD', {}, db),
    getTenantSecret(businessId, 'IMAP_HOST', {}, db),
    getTenantSecret(businessId, 'IMAP_PORT', {}, db),
    getTenantSecret(businessId, 'SMTP_HOST', {}, db),
    getTenantSecret(businessId, 'SMTP_PORT', {}, db),
  ]);
  if (!address || !appPassword) return null;
  return {
    address: address.value,
    appPassword: appPassword.value,
    imapHost: imapHost?.value ?? null,
    imapPort: parsePort(imapPortRaw?.value, DEFAULT_IMAP_PORT),
    smtpHost: smtpHost?.value ?? null,
    smtpPort: parsePort(smtpPortRaw?.value, DEFAULT_SMTP_PORT),
  };
}

export interface OutgoingMail {
  to: string;
  subject: string;
  html: string;
}

/** Subconjunto mínimo de un `Transporter` de nodemailer que este módulo necesita. */
export interface MinimalMailTransporter {
  sendMail(opts: { from: string; to: string; subject: string; html: string }): Promise<unknown>;
  verify(): Promise<true>;
}

/** Subconjunto mínimo de un cliente `ImapFlow` que este módulo necesita. */
export interface MinimalImapClient {
  connect(): Promise<void>;
  getMailboxLock(path: string): Promise<{ path: string; release(): void }>;
  fetch(
    range: string,
    query: { envelope?: boolean; source?: boolean },
  ): AsyncIterable<{ uid: number; envelope?: { subject?: string; from?: Array<{ address?: string }>; date?: Date }; source?: Buffer }>;
  readonly mailbox: { exists: number } | false;
  logout(): Promise<void>;
  /** Cierre duro y síncrono del socket subyacente (imapflow `close()`): destruye la
   * conexión sin negociar con el servidor. Seguro de llamar aunque el connect nunca
   * completara — es el escape para que un timeout de conexión no filtre un socket colgado. */
  close(): void;
}

interface SmtpConnectOptions {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
}

interface ImapConnectOptions {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
}

/** Dependencias inyectables (patrón DI del repo — ver `ProviderTestDeps`): reales por defecto. */
export interface MailConnectorDeps {
  resolveConfig: (businessId: string) => Promise<ResolvedMailConfig | null>;
  createTransport: (opts: SmtpConnectOptions) => MinimalMailTransporter;
  createImapClient: (opts: ImapConnectOptions) => MinimalImapClient;
}

export const defaultMailDeps: MailConnectorDeps = {
  resolveConfig: (businessId) => resolveMailConfig(businessId, prisma),
  createTransport: (opts) => nodemailer.createTransport(opts),
  // logger:false — nunca imprime credenciales/tráfico IMAP crudo por consola.
  createImapClient: (opts) => new ImapFlow({ ...opts, logger: false }) as unknown as MinimalImapClient,
};

/** Ejecuta `promise` con un timeout duro; rechaza con un Error legible (sin filtrar secretos). */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout: ${label}`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Envía un correo por el SMTP DEL TENANT (nodemailer, creds propias). Lanza
 * `MailNotConfiguredError` si el tenant no tiene correo propio o falta `SMTP_HOST` — el
 * caller (`notify.ts`) lo interpreta como "cae al siguiente eslabón de la cadena".
 * NUNCA loguea `appPassword`.
 */
export async function sendViaTenantSmtp(
  businessId: string,
  msg: OutgoingMail,
  deps: MailConnectorDeps = defaultMailDeps,
): Promise<void> {
  const cfg = await deps.resolveConfig(businessId);
  if (!cfg) throw new MailNotConfiguredError();
  if (!cfg.smtpHost) throw new MailNotConfiguredError('SMTP_HOST no configurado para este tenant');

  const transporter = deps.createTransport({
    host: cfg.smtpHost,
    port: cfg.smtpPort,
    secure: cfg.smtpPort === 465,
    auth: { user: cfg.address, pass: cfg.appPassword },
  });
  await transporter.sendMail({ from: cfg.address, to: msg.to, subject: msg.subject, html: msg.html });
}

export interface InboxMessage {
  uid: number;
  subject: string;
  from: string;
  date: Date | null;
  text: string;
}

export interface ReadInboxOptions {
  limit?: number;
  timeoutMs?: number;
}

/**
 * Lee los últimos N mensajes del INBOX del tenant vía IMAP (imapflow). Best-effort:
 * CADA operación de red va envuelta en un timeout duro — nunca cuelga aunque el
 * servidor no responda. Lanza `MailNotConfiguredError` sin config; cualquier otro
 * fallo (red/credenciales/timeout) se relanza tal cual (el caller decide qué hacer).
 * Capacidad únicamente — la invocación desde el agente queda para un change aparte.
 */
export async function readTenantInbox(
  businessId: string,
  opts: ReadInboxOptions = {},
  deps: MailConnectorDeps = defaultMailDeps,
): Promise<InboxMessage[]> {
  const cfg = await deps.resolveConfig(businessId);
  if (!cfg) throw new MailNotConfiguredError();
  if (!cfg.imapHost) throw new MailNotConfiguredError('IMAP_HOST no configurado para este tenant');

  const timeoutMs = opts.timeoutMs ?? DEFAULT_READ_TIMEOUT_MS;
  const limit = opts.limit ?? DEFAULT_READ_LIMIT;

  const client = deps.createImapClient({
    host: cfg.imapHost,
    port: cfg.imapPort,
    secure: true,
    auth: { user: cfg.address, pass: cfg.appPassword },
  });

  try {
    await withTimeout(client.connect(), timeoutMs, 'conexión IMAP');
    const lock = await withTimeout(client.getMailboxLock('INBOX'), timeoutMs, 'apertura de INBOX');
    try {
      const total = client.mailbox ? client.mailbox.exists : 0;
      if (!total) return [];
      const from = Math.max(1, total - limit + 1);
      const range = `${from}:${total}`;
      const messages: InboxMessage[] = [];
      await withTimeout(
        (async () => {
          for await (const msg of client.fetch(range, { envelope: true, source: true })) {
            messages.push({
              uid: msg.uid,
              subject: msg.envelope?.subject ?? '(sin asunto)',
              from: msg.envelope?.from?.[0]?.address ?? '',
              date: msg.envelope?.date ?? null,
              text: msg.source ? msg.source.toString('utf-8') : '',
            });
          }
        })(),
        timeoutMs,
        'lectura de mensajes',
      );
      return messages;
    } finally {
      lock.release();
    }
  } catch (err) {
    // Cierre DURO ante cualquier fallo (incluido un timeout de connect): el `logout()`
    // del finally es un no-op si el handshake nunca completó y podría dejar el socket
    // colgado. `close()` destruye el socket sincrónicamente para no filtrar la conexión.
    client.close();
    throw err;
  } finally {
    // Cierre best-effort con SU PROPIO timeout: nunca deja la función colgada esperando
    // un logout que el servidor no confirma.
    await withTimeout(client.logout(), LOGOUT_TIMEOUT_MS, 'cierre IMAP').catch(() => undefined);
  }
}

export interface MailTestConfig {
  address: string;
  appPassword: string;
  imapHost?: string;
  imapPort?: number;
  smtpHost?: string;
  smtpPort?: number;
}

export interface MailTestResult {
  imap: boolean;
  smtp: boolean;
  detail?: string; // mensaje corto; NUNCA la dirección/contraseña probada
}

/**
 * Prueba IMAP (login) + SMTP (verify) con la config dada. Nunca lanza — cualquier
 * fallo de red/credenciales/timeout se resume en `detail` genérico. Usado por
 * `provider-test.ts` ('mail') y por el botón "Probar conexión" del panel.
 */
export async function testMailConnection(
  cfg: MailTestConfig,
  deps: MailConnectorDeps = defaultMailDeps,
): Promise<MailTestResult> {
  const timeoutMs = DEFAULT_TEST_TIMEOUT_MS;
  const details: string[] = [];

  let imapOk = false;
  if (cfg.imapHost) {
    let imapClient: MinimalImapClient | undefined;
    try {
      imapClient = deps.createImapClient({
        host: cfg.imapHost,
        port: cfg.imapPort ?? DEFAULT_IMAP_PORT,
        secure: true,
        auth: { user: cfg.address, pass: cfg.appPassword },
      });
      await withTimeout(imapClient.connect(), timeoutMs, 'IMAP login');
      imapOk = true;
      await withTimeout(imapClient.logout(), LOGOUT_TIMEOUT_MS, 'cierre IMAP').catch(() => undefined);
    } catch {
      // Cierre DURO: un connect fallido/timeout puede dejar el socket sin cerrar y
      // `logout()` no serviría — destruimos el socket para no filtrar la conexión.
      imapClient?.close();
      details.push('IMAP: no se pudo conectar (host/puerto/credenciales)');
    }
  } else {
    details.push('IMAP: falta IMAP_HOST');
  }

  let smtpOk = false;
  if (cfg.smtpHost) {
    try {
      const smtpPort = cfg.smtpPort ?? DEFAULT_SMTP_PORT;
      const transporter = deps.createTransport({
        host: cfg.smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: cfg.address, pass: cfg.appPassword },
      });
      await withTimeout(transporter.verify(), timeoutMs, 'SMTP verify');
      smtpOk = true;
    } catch {
      details.push('SMTP: no se pudo verificar (host/puerto/credenciales)');
    }
  } else {
    details.push('SMTP: falta SMTP_HOST');
  }

  return { imap: imapOk, smtp: smtpOk, ...(details.length ? { detail: details.join(' | ') } : {}) };
}
