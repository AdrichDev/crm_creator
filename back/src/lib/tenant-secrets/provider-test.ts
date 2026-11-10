// crm-onboarding-tenant-keys: módulo puro compartido, SIN `Request`/`Response`/Prisma.
// Es el ÚNICO punto que contacta un proveedor externo o la BD del tenant para validar
// una API key/URL pegada por un humano. Lo importan este change y
// `crm-tenant-keys-self-service` (dependencia dura, ver su design.md).
//
// Regla de seguridad no negociable: `value` NUNCA se loguea ni se interpola en `detail`.
// Para `database`, `detail` jamás incluye host/usuario/contraseña de la cadena.
//
// Nota de implementación (desviación menor de design.md §1): `testProviderConnection`
// acepta un tercer parámetro OPCIONAL `deps` (patrón DI ya usado en todo el repo, p. ej.
// `TenantSecretDb`/`CreateProjectDeps`). Los call-sites reales (route handler) SIGUEN
// llamando con la firma de 2 argumentos del design (`deps` usa el default de producción,
// `fetch` global + `pg.Pool` real); solo `provider-test.test.ts` inyecta dobles, porque
// `node:test` en este repo no corre con `--experimental-test-module-mocks`, así que mockear
// el módulo `pg` desde fuera no es viable sin ese flag.

import { Pool } from 'pg';
import { testMailConnection, type MailTestConfig, type MailTestResult } from '../mail-connector.js';
import { assertPublicHost, assertPublicUrl, SsrfError, type LookupFn } from '../ssrf.js';

export type SecretProvider =
  | 'openai'
  | 'gemini'
  | 'anthropic'
  | 'nanbuilders'
  | 'maps'
  | 'database'
  | 'supabase_url'
  | 'supabase_anon'
  | 'google'
  | 'mail';

// crm-tenant-oauth-creds: patrones de las credenciales OAuth de Google. El "Probar" de
// estos slots es solo validación de FORMATO local (sin red): el mismo provider ('google')
// cubre dos slots (client_id y client_secret), así que se acepta cualquiera de las dos
// formas. NUNCA se interpola el `value` en el `detail`.
//   - client_id: `<n>-<hash>.apps.googleusercontent.com`.
//   - client_secret: `GOCSPX-<token>` (formato actual) o token opaco largo (legacy).
const GOOGLE_CLIENT_ID_PATTERN = /^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/;
const GOOGLE_CLIENT_SECRET_PATTERN = /^(GOCSPX-[A-Za-z0-9_-]{10,}|[A-Za-z0-9_-]{20,})$/;

export interface ProviderTestResult {
  ok: boolean;
  detail?: string; // mensaje corto; NUNCA el value probado ni el body/URL crudo
}

/** Vista mínima de un pool de conexión de un solo uso — Pool de `pg` la satisface estructuralmente. */
export interface OneShotPool {
  query(sql: string): Promise<unknown>;
  end(): Promise<void>;
}

/** Dependencias inyectables (patrón DI del repo). Default = `fetch` global + `pg.Pool` real. */
export interface ProviderTestDeps {
  fetchImpl: typeof fetch;
  createPool: (connectionString: string, timeoutMs: number) => OneShotPool;
  /**
   * crm-tenant-oauth-creds-and-mail-connector (Fase 2): IMAP+SMTP del conector de
   * correo. Opcional — dobles de test para otros providers (openai/gemini/…) no lo
   * declaran; por defecto usa el `testMailConnection` real.
   */
  testMail?: (cfg: MailTestConfig) => Promise<MailTestResult>;
  /**
   * Guard anti-SSRF (hallazgo F-04, spec S2): resolución DNS para validar que el
   * destino es público. Opcional — por defecto usa el DNS real del sistema; los tests
   * inyectan un stub porque `node:test` aquí no puede mockear `node:dns`.
   */
  lookupHost?: LookupFn;
}

/**
 * Motivo de rechazo del guard anti-SSRF, tal cual se devuelve en `detail`. Claro,
 * genérico y sin datos del destino: nunca revela el host/IP sondeado (evita convertir
 * el endpoint en un oráculo de la red interna).
 */
const BLOCKED_DETAIL = 'Destino no permitido';

/** Entorno que decide la política TLS del pool de prueba (inyectable en tests). */
export interface PostgresTlsEnv {
  NODE_ENV?: string;
  PG_TLS_INSECURE?: string;
}

export interface PostgresConnectConfig {
  connectionString: string;
  /** `undefined` = no se fuerza `ssl`: lo decide la propia cadena (`sslmode`). */
  ssl?: { rejectUnauthorized: boolean };
}

/**
 * Quita de la cadena los parámetros que DESACTIVAN la verificación del certificado.
 *
 * `pg` parsea `connectionString` y SUS valores PISAN el `ssl` explícito del Pool
 * (`pg/lib/connection-parameters.js`: `Object.assign({}, config, parse(connectionString))`),
 * así que neutralizarlos en la cadena es la única forma efectiva de garantizar que en
 * producción se verifica el certificado TLS. Solo se tocan los dos parámetros que
 * apagan la verificación (`sslmode=no-verify`, `uselibpqcompat=true`): el resto de la
 * cadena (host, credenciales, otras opciones) se devuelve byte a byte tal cual si no
 * hay nada que quitar.
 */
function stripWeakTlsParams(connectionString: string): string {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    return connectionString;
  }
  const params = url.searchParams;
  let changed = false;
  if ((params.get('sslmode') ?? '').toLowerCase() === 'no-verify') {
    params.delete('sslmode');
    changed = true;
  }
  if ((params.get('uselibpqcompat') ?? '').toLowerCase() === 'true') {
    params.delete('uselibpqcompat');
    changed = true;
  }
  if (!changed) return connectionString;
  url.search = params.toString();
  return url.toString();
}

/**
 * Configuración de conexión de la prueba Postgres: cadena saneada + política TLS.
 *
 * En PRODUCCIÓN el certificado del servidor SIEMPRE se verifica (F-04/S2): el antiguo
 * `ssl: { rejectUnauthorized: false }` permitía un man-in-the-middle sobre la prueba.
 * Si la cadena fija `sslmode` (ya sin los modos que apagan la verificación, ver
 * `stripWeakTlsParams`) se respeta esa elección explícita del tenant sobre SU base de
 * datos; si no, se fuerza `rejectUnauthorized: true`.
 *
 * Escape SOLO para desarrollo local: `PG_TLS_INSECURE=1` permite aceptar un certificado
 * autofirmado. Se IGNORA por completo cuando `NODE_ENV === 'production'`, y no tiene
 * efecto si la cadena fija `sslmode`.
 */
export function postgresConnectConfig(
  connectionString: string,
  env: PostgresTlsEnv = process.env,
): PostgresConnectConfig {
  const sanitized = stripWeakTlsParams(connectionString);
  // La cadena ya eligió su TLS (`sslmode=…`, ya saneado arriba): se respeta.
  if (/[?&]sslmode=/.test(sanitized)) return { connectionString: sanitized };
  const insecureAllowed = env.NODE_ENV !== 'production' && env.PG_TLS_INSECURE === '1';
  return { connectionString: sanitized, ssl: { rejectUnauthorized: !insecureAllowed } };
}

const defaultDeps: ProviderTestDeps = {
  fetchImpl: (...args) => fetch(...args),
  testMail: (cfg) => testMailConnection(cfg),
  createPool: (connectionString, timeoutMs) => {
    // Postgres gestionado (Supabase, Neon, RDS…) EXIGE SSL. `pg` no lo activa por defecto,
    // así que un `SELECT 1` contra el pooler de Supabase fallaba aunque la URL fuese
    // correcta ("no se pudo conectar la base de datos"). Se activa SSL con el certificado
    // VERIFICADO (`postgresConnectConfig`, F-04/S2), salvo que la cadena fije `sslmode`.
    // Los hosts locales (localhost/127.0.0.1) ya no llegan aquí: el guard anti-SSRF los
    // rechaza antes de crear el pool.
    const { connectionString: sanitized, ssl } = postgresConnectConfig(connectionString);
    return new Pool({
      connectionString: sanitized,
      connectionTimeoutMillis: timeoutMs,
      query_timeout: timeoutMs,
      max: 1,
      ...(ssl ? { ssl } : {}),
    });
  },
};

const DEFAULT_TIMEOUT_MS = 5_000;

/** Ejecuta `fn` con un `AbortController` que aborta a los `timeoutMs`. Limpia el timer en `finally`. */
async function testWithTimeout(
  timeoutMs: number,
  fn: (signal: AbortSignal) => Promise<ProviderTestResult>,
): Promise<ProviderTestResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Extrae el host de una cadena de conexión Postgres. `null` = no se pudo determinar
 * (cadena inválida o conexión por socket UNIX `postgresql:///db`) → el guard rechaza
 * (fail-closed) en lugar de conectar a un destino que no supo validar.
 */
function postgresHost(connectionString: string): string | null {
  try {
    const { hostname } = new URL(connectionString);
    return hostname ? hostname : null;
  } catch {
    return null;
  }
}

/**
 * Conexión de solo lectura de un solo uso: `SELECT 1` con timeout corto, cierra siempre
 * en `finally`. Nunca interpola `value` (la cadena de conexión) en el `detail` de retorno.
 */
async function testDatabaseUrl(
  value: string,
  timeoutMs: number,
  createPool: ProviderTestDeps['createPool'],
): Promise<ProviderTestResult> {
  const pool = createPool(value, timeoutMs);
  try {
    await pool.query('SELECT 1');
    return { ok: true };
  } catch {
    return { ok: false, detail: 'no se pudo conectar la base de datos' };
  } finally {
    await pool.end().catch(() => undefined);
  }
}

export async function testProviderConnection(
  provider: SecretProvider,
  value: string,
  deps: ProviderTestDeps = defaultDeps,
): Promise<ProviderTestResult> {
  const timeoutMs = DEFAULT_TIMEOUT_MS;
  const { fetchImpl, createPool, lookupHost } = deps;
  try {
    switch (provider) {
      case 'openai':
        return await testWithTimeout(timeoutMs, async (signal) => {
          const r = await fetchImpl('https://api.openai.com/v1/models', {
            headers: { Authorization: `Bearer ${value}` },
            signal,
          });
          return r.ok ? { ok: true } : { ok: false, detail: `openai respondió ${r.status}` };
        });
      case 'gemini':
        return await testWithTimeout(timeoutMs, async (signal) => {
          const r = await fetchImpl(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(value)}`,
            { signal },
          );
          return r.ok ? { ok: true } : { ok: false, detail: `gemini respondió ${r.status}` };
        });
      case 'anthropic':
        return await testWithTimeout(timeoutMs, async (signal) => {
          const r = await fetchImpl('https://api.anthropic.com/v1/models', {
            headers: { 'x-api-key': value, 'anthropic-version': '2023-06-01' },
            signal,
          });
          return r.ok ? { ok: true } : { ok: false, detail: `anthropic respondió ${r.status}` };
        });
      case 'nanbuilders': {
        // Proveedor INTERNO OpenAI-compatible: se comprueba la clave contra /models de SU base
        // URL. Sin NANBUILDERS_BASE_URL configurada no hay destino y se falla cerrado (nunca se
        // manda la clave a la API de OpenAI por accidente). El host pasa por el guard anti-SSRF
        // igual que el resto: es una URL del entorno, no del tenant.
        const base = (process.env.NANBUILDERS_BASE_URL ?? '').trim();
        if (!base) return { ok: false, detail: 'falta NANBUILDERS_BASE_URL en el servidor' };
        let host: string;
        try {
          host = new URL(base).hostname;
        } catch {
          return { ok: false, detail: 'NANBUILDERS_BASE_URL no es una URL válida' };
        }
        // Se pasa el `lookupHost` inyectado igual que en las demás ramas: los tests no tocan red.
        await assertPublicHost(host, lookupHost);
        return await testWithTimeout(timeoutMs, async (signal) => {
          const r = await fetchImpl(`${base.replace(/\/+$/, '')}/models`, {
            headers: { Authorization: `Bearer ${value}` },
            signal,
          });
          return r.ok ? { ok: true } : { ok: false, detail: `nanbuilders respondió ${r.status}` };
        });
      }
      case 'maps':
        return await testWithTimeout(timeoutMs, async (signal) => {
          const r = await fetchImpl(
            `https://maps.googleapis.com/maps/api/geocode/json?address=test&key=${encodeURIComponent(value)}`,
            { signal },
          );
          const body = (await r.json().catch(() => ({}))) as { status?: string };
          const denied = body.status === 'REQUEST_DENIED' || body.status === 'INVALID_REQUEST';
          return denied ? { ok: false, detail: `maps: ${body.status}` } : { ok: true };
        });
      case 'database':
        // F-04/S2: la cadena la escribe un humano del tenant, así que el host se valida
        // ANTES de crear el pool — nunca se abre un socket hacia loopback/red privada/
        // link-local/metadata/CGNAT. Un rechazo es `ok:false` (nunca un throw) y no
        // cambia el contrato del endpoint.
        {
          const host = postgresHost(value);
          if (!host) return { ok: false, detail: BLOCKED_DETAIL };
          await assertPublicHost(host, lookupHost);
          return await testDatabaseUrl(value, timeoutMs, createPool);
        }
      case 'supabase_url':
        // NEXT_PUBLIC_SUPABASE_URL es pública (va al bundle del front). Se valida
        // formato (https) + ALCANZABILIDAD del host. Basta con que el host RESPONDA:
        // el gateway de Supabase (Kong) contesta 401 a /auth/v1/health cuando no se
        // manda `apikey`, pero ese 401 ya confirma que la URL apunta a un Supabase
        // real y alcanzable. Solo un fallo de red/DNS/timeout (throw → catch general)
        // significa que la URL no responde. Nunca se interpola `value` en `detail`.
        return await testWithTimeout(timeoutMs, async (signal) => {
          let parsed: URL;
          try {
            parsed = new URL(value);
          } catch {
            return { ok: false, detail: 'URL de Supabase inválida' };
          }
          if (parsed.protocol !== 'https:') {
            return { ok: false, detail: 'URL de Supabase inválida' };
          }
          // F-04/S2: guard anti-SSRF DESPUÉS del formato (un `http://` conserva el
          // mensaje de siempre) y ANTES de cualquier fetch.
          await assertPublicUrl(parsed.toString(), { lookup: lookupHost });
          // Cualquier respuesta HTTP (200, 401, 404…) = host alcanzable → ok.
          await fetchImpl(`${value.replace(/\/$/, '')}/auth/v1/health`, { signal });
          return { ok: true };
        });
      case 'supabase_anon':
        // NEXT_PUBLIC_SUPABASE_ANON_KEY: sin la URL del proyecto no hay endpoint
        // contra el que probarla, así que se queda en validación de FORMATO
        // LOCAL (patrón JWT-ish), sin red. Nunca se interpola `value` en `detail`.
        return /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./.test(value)
          ? { ok: true }
          : { ok: false, detail: 'anon key con formato inválido' };
      case 'google':
        // client_id/client_secret de OAuth: sin un intercambio real (que requeriría un
        // code de consentimiento) solo se valida el FORMATO local, sin red. El value
        // NUNCA se interpola en `detail`.
        return GOOGLE_CLIENT_ID_PATTERN.test(value) || GOOGLE_CLIENT_SECRET_PATTERN.test(value)
          ? { ok: true }
          : { ok: false, detail: 'formato de credencial de Google inválido' };
      case 'mail': {
        // crm-tenant-oauth-creds-and-mail-connector (Fase 2): `value` viene JSON-codificado
        // desde el panel con los 6 campos del conector (dirección, contraseña, hosts/puertos
        // de IMAP y SMTP) — el endpoint de test solo admite un `value` por-slot, así que el
        // front serializa la config completa. `testMailConnection` YA tiene su propio timeout
        // duro interno (mail-connector.ts), no se envuelve en `testWithTimeout`. El valor
        // (contraseña incluida) nunca se interpola en `detail`.
        let cfg: MailTestConfig;
        try {
          cfg = JSON.parse(value) as MailTestConfig;
        } catch {
          return { ok: false, detail: 'configuración de correo con formato inválido' };
        }
        // F-04/S2: los hosts IMAP/SMTP los escribe un humano del tenant → se validan
        // ANTES de invocar al conector, así no se abre ningún socket hacia la red
        // interna. Sin hosts configurados no hay nada que resolver (comportamiento
        // previo: el conector reporta los campos que faltan).
        for (const rawHost of [cfg.imapHost, cfg.smtpHost]) {
          if (rawHost === undefined || rawHost === null || rawHost === '') continue;
          await assertPublicHost(String(rawHost), lookupHost);
        }
        const result = await (deps.testMail ?? testMailConnection)(cfg);
        return { ok: result.imap && result.smtp, ...(result.detail ? { detail: result.detail } : {}) };
      }
      default:
        // model-catalog S4: el switch es exhaustivo sobre los proveedores del catálogo. Un
        // nombre heredado (p. ej. una fila vieja `deepseek`) no abre NINGUNA conexión: se falla
        // cerrado con un detail fijo (nunca el value).
        return { ok: false, detail: 'proveedor no soportado' };
    }
  } catch (e) {
    // F-04/S2: un destino no público es un rechazo del guard anti-SSRF, no un fallo de
    // red — se distingue para devolver un motivo claro (y solo para eso: el resto del
    // contrato de `detail` no cambia).
    if (e instanceof SsrfError) return { ok: false, detail: BLOCKED_DETAIL };
    // AbortError (timeout) o fallo de red/conexión: nunca se interpola `value` ni el error crudo.
    return { ok: false, detail: 'timeout o error de conexión al contactar al recurso' };
  }
}
