import { Router, type Request, type Response } from 'express';
import {
  upsertPlatformSecret,
  platformSecretStatus,
  type PlatformSettingDb,
} from '../lib/platform-secrets/store.js';
import { testProviderConnection, type ProviderTestResult } from '../lib/tenant-secrets/provider-test.js';
import { consume } from '../lib/rateLimit.js';
import { prisma } from '../prisma.js';

// ---------------------------------------------------------------------------
// crm-central-oauth-admin-config — API admin-PLATAFORMA para las credenciales de la
// app Google OAuth CENTRAL (compartida por defecto). Montada bajo el carril de
// operador (`/service/operator`, ver service-operator.ts), que YA exige
// `requireOperatorToken` — el mismo gate que cerró el hallazgo CRITICAL de rol de
// operador. Un admin de TENANT no la alcanza jamás (no tiene el service token).
//
// El valor de un secreto (client_id/secret/redirect) NUNCA se loguea, ni se
// devuelve en el estado, ni se filtra en la respuesta del test — solo metadatos
// (configurado sí/no) o el veredicto de formato (ok/ko). Las 3 claves son de
// plataforma y server-side: no son FRONTEND_PUBLIC, no tienen envVarName, jamás
// entran a ningún export.
// ---------------------------------------------------------------------------

/** Clave de plataforma ↔ campo del body ↔ provider de validación de formato. */
const FIELDS = [
  { field: 'clientId', key: 'GOOGLE_OAUTH_CLIENT_ID', kind: 'google' as const },
  { field: 'clientSecret', key: 'GOOGLE_OAUTH_CLIENT_SECRET', kind: 'google' as const },
  { field: 'redirectUri', key: 'GOOGLE_OAUTH_REDIRECT_URI', kind: 'url' as const },
] as const;

const PLATFORM_KEYS = FIELDS.map((f) => f.key);

// Rate-limit del endpoint de test: 20 intentos / 5 min por IP (bucket propio).
const TEST_BUCKET = 'platform-oauth-test';
const TEST_WINDOW_MS = 5 * 60_000;
const TEST_MAX = 20;

/** Inyector del validador de formato (patrón DI del repo) — default = real. */
export type TestConnFn = (kind: 'google', value: string) => Promise<ProviderTestResult>;

function ipKeyOf(req: Request): string {
  return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
}

/** Valida el formato de una redirect URI SIN filtrar el valor en el mensaje. */
function testRedirectUri(value: string): ProviderTestResult {
  // Admite el placeholder `{servicio}` que googleOAuthConfig sustituye por servicio.
  const probe = value.replace('{servicio}', 'calendar');
  let parsed: URL;
  try {
    parsed = new URL(probe);
  } catch {
    return { ok: false, detail: 'redirect URI inválida (debe ser una URL https)' };
  }
  if (parsed.protocol !== 'https:') {
    return { ok: false, detail: 'redirect URI inválida (debe ser una URL https)' };
  }
  return { ok: true };
}

/* ---------- GET /platform/oauth-config (estado, SIN secret) ---------- */

export async function getConfigHandler(db: PlatformSettingDb, _req: Request, res: Response) {
  try {
    const status = await platformSecretStatus(PLATFORM_KEYS, db);
    // Solo metadatos: configurado sí/no + fecha. NUNCA el valor.
    res.json({
      config: FIELDS.map((f) => ({
        field: f.field,
        key: f.key,
        configured: status[f.key]?.configured ?? false,
        updatedAt: status[f.key]?.updatedAt ?? null,
      })),
    });
  } catch (e) {
    console.error('[platform-oauth] error leyendo estado:', e);
    res.status(500).json({ error: { code: 'server_error', message: 'No se pudo leer la configuración' } });
  }
}

/* ---------- PUT /platform/oauth-config (upsert cifrado) ---------- */

export async function putConfigHandler(db: PlatformSettingDb, req: Request, res: Response) {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const toWrite: Array<{ key: string; value: string }> = [];

    for (const f of FIELDS) {
      const raw = body[f.field];
      if (raw === undefined || raw === null) continue; // no tocado → se deja como está
      if (typeof raw !== 'string') {
        return res.status(422).json({ error: { code: 'invalid', message: `${f.field} debe ser texto` } });
      }
      const value = raw.trim();
      if (!value) continue; // vacío = no se escribe (cae al env legacy)
      // Un salto de línea inyectaría variables/valores no deseados aguas abajo.
      if (/[\r\n]/.test(value)) {
        return res.status(422).json({ error: { code: 'invalid', message: `${f.field} no puede contener saltos de línea` } });
      }
      toWrite.push({ key: f.key, value });
    }

    if (toWrite.length === 0) {
      return res.status(422).json({ error: { code: 'invalid', message: 'No se envió ninguna credencial para guardar' } });
    }

    for (const w of toWrite) {
      await upsertPlatformSecret(w.key, w.value, db);
    }

    // Nunca se devuelve el valor (ni cifrado ni en claro) — solo el estado resultante.
    const status = await platformSecretStatus(PLATFORM_KEYS, db);
    res.json({
      config: FIELDS.map((f) => ({
        field: f.field,
        key: f.key,
        configured: status[f.key]?.configured ?? false,
        updatedAt: status[f.key]?.updatedAt ?? null,
      })),
    });
  } catch (e) {
    console.error('[platform-oauth] error guardando configuración:', e);
    res.status(500).json({ error: { code: 'server_error', message: 'No se pudo guardar la configuración' } });
  }
}

/* ---------- POST /platform/oauth-config/test (formato, sin fuga) ---------- */

export async function testConfigHandler(testConn: TestConnFn, req: Request, res: Response) {
  if (!consume(TEST_BUCKET, ipKeyOf(req), TEST_WINDOW_MS, TEST_MAX)) {
    return res.status(429).json({ error: { code: 'rate_limited', message: 'Demasiados intentos, espera unos minutos' } });
  }
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const results: Array<{ field: string; ok: boolean; detail?: string }> = [];

    for (const f of FIELDS) {
      const raw = body[f.field];
      if (raw === undefined || raw === null || raw === '') continue;
      if (typeof raw !== 'string') {
        results.push({ field: f.field, ok: false, detail: `${f.field} debe ser texto` });
        continue;
      }
      const value = raw.trim();
      const r = f.kind === 'url' ? testRedirectUri(value) : await testConn('google', value);
      // El value probado NUNCA se interpola en la respuesta — solo ok + detail genérico.
      results.push({ field: f.field, ok: r.ok, ...(r.detail ? { detail: r.detail } : {}) });
    }

    if (results.length === 0) {
      return res.status(422).json({ error: { code: 'invalid', message: 'No se envió ninguna credencial para probar' } });
    }

    res.json({ ok: results.every((r) => r.ok), results });
  } catch (e) {
    console.error('[platform-oauth] error probando configuración:', e);
    res.status(500).json({ error: { code: 'server_error', message: 'No se pudo probar la configuración' } });
  }
}

/* ---------- Router ---------- */

/**
 * Router de la config OAuth de plataforma. Se monta bajo `serviceOperatorRouter`
 * (`/service/operator`), que ya aplica `requireOperatorToken` — el gate de operador.
 * `db`/`testConn` inyectables (patrón DI del repo) para testear sin BD ni red.
 */
export function buildPlatformOAuthRouter(
  db: PlatformSettingDb = prisma as unknown as PlatformSettingDb,
  testConn: TestConnFn = (kind, value) => testProviderConnection(kind, value),
): Router {
  const router = Router();
  router.get('/platform/oauth-config', (req, res) => getConfigHandler(db, req, res));
  router.put('/platform/oauth-config', (req, res) => putConfigHandler(db, req, res));
  router.post('/platform/oauth-config/test', (req, res) => testConfigHandler(testConn, req, res));
  return router;
}
