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

export type SecretProvider =
  | 'openai'
  | 'gemini'
  | 'anthropic'
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
}

const defaultDeps: ProviderTestDeps = {
  fetchImpl: (...args) => fetch(...args),
  testMail: (cfg) => testMailConnection(cfg),
  createPool: (connectionString, timeoutMs) => {
    // Postgres gestionado (Supabase, Neon, RDS…) EXIGE SSL. `pg` no lo activa por defecto,
    // así que un `SELECT 1` contra el pooler de Supabase fallaba aunque la URL fuese
    // correcta ("no se pudo conectar la base de datos"). Se activa SSL salvo host local
    // (dev sin SSL) o si la cadena ya fija `sslmode`. `rejectUnauthorized:false` acepta la
    // cadena de certificado del pooler (patrón habitual con Supabase).
    const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])/.test(connectionString);
    const hasSslMode = /[?&]sslmode=/.test(connectionString);
    const ssl = isLocal || hasSslMode ? undefined : { rejectUnauthorized: false };
    return new Pool({
      connectionString,
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
  const { fetchImpl, createPool } = deps;
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
        return await testDatabaseUrl(value, timeoutMs, createPool);
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
        const result = await (deps.testMail ?? testMailConnection)(cfg);
        return { ok: result.imap && result.smtp, ...(result.detail ? { detail: result.detail } : {}) };
      }
    }
  } catch {
    // AbortError (timeout) o fallo de red/conexión: nunca se interpola `value` ni el error crudo.
    return { ok: false, detail: 'timeout o error de conexión al contactar al recurso' };
  }
}
