import { Router, type Response, type NextFunction } from 'express';
import { tryResolveTenantApiKey, type TenantApiKeyDb } from '../middleware/tenant-api-key.js';
import { authenticate } from '../middleware/auth.js';
import { prisma } from '../prisma.js';
import { readPublicSecrets, readBakeableSecrets } from '../lib/tenant-secrets/store.js';
import type { AuthedRequest } from '../middleware/types.js';

// ---------------------------------------------------------------------------
// crm-tenant-api-keys / crm-tenant-secrets-runtime-maps: superficie con AUTH DUAL.
// 1) Apps exportadas (ZIP/APK/EXE/IPA): Bearer = TenantApiKey portadora
//    (tryResolveTenantApiKey), sin sesión de usuario.
// 2) Panel CRM logueado (operaos-black.vercel.app): Bearer = access token Supabase +
//    header x-business-id, resuelto vía `authenticate` (Membership) — el MISMO
//    mecanismo que el resto del panel. Se prueba (1) primero; un token de sesión
//    Supabase nunca coincide con el hash de una TenantApiKey, así que el fallback a
//    (2) no es ambiguo.
// Ambos caminos terminan fijando SOLO req.tenantBusinessId; el handler sigue
// devolviendo EXCLUSIVAMENTE secretos scope=FRONTEND_PUBLIC (filtro en el WHERE de
// Prisma, no en la app) — ningún BACKEND_SECRET es alcanzable por ninguno de los dos.
// ---------------------------------------------------------------------------

/** Dependencia inyectable (patrón DI del repo) para testear el handler sin BD real. */
export interface TenantConfigDeps {
  readPublicSecrets(businessId: string): Promise<Record<string, string>>;
  readBakeableSecrets(businessId: string): Promise<Array<{ envVarName: string; value: string }>>;
}

const defaultDeps: TenantConfigDeps = { readPublicSecrets, readBakeableSecrets };

/**
 * Handler de `GET /tenant-config`. Lee `req.tenantBusinessId` (fijado por
 * `resolveTenantConfigAuth`) y devuelve SOLO los secretos FRONTEND_PUBLIC del negocio:
 * `publicSecrets` indexado por `name` (contrato existente, sin cambios de forma) y
 * `publicEnvSecrets` indexado por `envVarName` (nuevo, solo los que tienen envVarName
 * asignado — mismo filtro que ya usan los builders del exportador para hornear .env.local).
 */
export async function tenantConfigHandler(deps: TenantConfigDeps, req: AuthedRequest, res: Response) {
  try {
    const businessId = req.tenantBusinessId;
    if (!businessId) {
      // No debería ocurrir tras resolveTenantConfigAuth (que corta con 401 antes), pero
      // fail-closed explícito por si el middleware cambia y este handler no.
      return res.status(401).json({ error: { code: 'invalid_api_key', message: 'API key ausente, inválida o revocada' } });
    }
    const [publicSecrets, bakeable] = await Promise.all([
      deps.readPublicSecrets(businessId),
      deps.readBakeableSecrets(businessId),
    ]);
    const publicEnvSecrets: Record<string, string> = {};
    for (const { envVarName, value } of bakeable) publicEnvSecrets[envVarName] = value;
    res.json({ flags: {}, publicSecrets, publicEnvSecrets });
  } catch (e) {
    console.error('[tenant-config] error leyendo config pública:', e);
    res.status(500).json({ error: { code: 'server_error', message: 'No se pudo cargar la configuración' } });
  }
}

/** Firma mínima compartida por `authenticate` (real) y sus dobles de test. */
type SessionAuthMiddleware = (req: AuthedRequest, res: Response, next: NextFunction) => unknown;

/**
 * Auth dual para `GET /tenant-config`: intenta `TenantApiKey` (apps exportadas,
 * comportamiento actual sin cambios) y, si el Bearer no resuelve como tal, cae a sesión
 * Supabase + `x-business-id` (`authenticate`, reutilizado TAL CUAL) — el mismo mecanismo que
 * usa el resto del panel logueado. `apiKeyDb`/`sessionFallback` inyectables para tests
 * (patrón DI del repo); en producción usan `prisma`/`authenticate` reales.
 */
export function resolveTenantConfigAuth(
  apiKeyDb: TenantApiKeyDb = prisma,
  sessionFallback: SessionAuthMiddleware = authenticate,
) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    let resolvedByApiKey = false;
    try {
      resolvedByApiKey = await tryResolveTenantApiKey(req, apiKeyDb);
    } catch (e) {
      // Un fallo en la consulta de TenantApiKey no debe bloquear una sesión Supabase
      // legítima: se loguea y se intenta el fallback igualmente.
      console.error('[tenant-config] error resolviendo TenantApiKey, se prueba sesión:', e);
    }
    if (resolvedByApiKey) return next();

    // Fallback: sesión Supabase + x-business-id, mismo mecanismo que `authenticate` usa
    // para el resto del panel (Membership). Si `authenticate` falla (401/403/500), ya
    // escribe esa respuesta directamente y no llama a nuestro `next` envuelto.
    await sessionFallback(req, res, () => {
      req.tenantBusinessId = req.businessId;
      next();
    });
  };
}

export const tenantConfigRouter = Router();

tenantConfigRouter.get('/', resolveTenantConfigAuth(), (req: AuthedRequest, res) => tenantConfigHandler(defaultDeps, req, res));
