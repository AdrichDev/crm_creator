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

export type SecretProvider =
  | 'openai'
  | 'gemini'
  | 'anthropic'
  | 'maps'
  | 'database'
  | 'supabase_url'
  | 'supabase_anon';

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
}

const defaultDeps: ProviderTestDeps = {
  fetchImpl: (...args) => fetch(...args),
  createPool: (connectionString, timeoutMs) =>
    new Pool({ connectionString, connectionTimeoutMillis: timeoutMs, query_timeout: timeoutMs, max: 1 }),
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
        // NEXT_PUBLIC_SUPABASE_URL es pública (va al bundle del front) y SÍ se
        // puede probar con una llamada real: valida que la URL responda como
        // proyecto Supabase de verdad (no solo que "parezca" una URL). Nunca
        // se interpola `value` en `detail`.
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
          const r = await fetchImpl(`${value.replace(/\/$/, '')}/auth/v1/health`, { signal });
          return r.ok ? { ok: true } : { ok: false, detail: 'Supabase no responde en esa URL' };
        });
      case 'supabase_anon':
        // NEXT_PUBLIC_SUPABASE_ANON_KEY: sin la URL del proyecto no hay endpoint
        // contra el que probarla, así que se queda en validación de FORMATO
        // LOCAL (patrón JWT-ish), sin red. Nunca se interpola `value` en `detail`.
        return /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./.test(value)
          ? { ok: true }
          : { ok: false, detail: 'anon key con formato inválido' };
    }
  } catch {
    // AbortError (timeout) o fallo de red/conexión: nunca se interpola `value` ni el error crudo.
    return { ok: false, detail: 'timeout o error de conexión al contactar al recurso' };
  }
}
