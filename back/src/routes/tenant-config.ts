import { Router, type Response } from 'express';
import { resolveTenantApiKey } from '../middleware/tenant-api-key.js';
import { readPublicSecrets } from '../lib/tenant-secrets/store.js';
import type { AuthedRequest } from '../middleware/types.js';

// ---------------------------------------------------------------------------
// crm-tenant-api-keys: superficie TENANT-FACING. Auth por TenantApiKey
// (resolveTenantApiKey), NO por sesión de usuario (authenticate). Devuelve
// EXCLUSIVAMENTE los secretos scope=FRONTEND_PUBLIC del negocio de la clave +
// flags de configuración. `flags` queda como objeto vacío en esta primera
// tanda (sin fuente de flags definida en el spec) — extensible sin romper
// el contrato de la respuesta.
// ---------------------------------------------------------------------------

/** Dependencia inyectable (patrón DI del repo) para testear el handler sin BD real. */
export interface TenantConfigDeps {
  readPublicSecrets(businessId: string): Promise<Record<string, string>>;
}

const defaultDeps: TenantConfigDeps = { readPublicSecrets };

/**
 * Handler de `GET /tenant-config`. Lee `req.tenantBusinessId` (fijado por
 * resolveTenantApiKey) y devuelve SOLO los secretos FRONTEND_PUBLIC del negocio.
 */
export async function tenantConfigHandler(deps: TenantConfigDeps, req: AuthedRequest, res: Response) {
  try {
    const businessId = req.tenantBusinessId;
    if (!businessId) {
      // No debería ocurrir tras resolveTenantApiKey (que corta con 401 antes), pero
      // fail-closed explícito por si el middleware cambia y este handler no.
      return res.status(401).json({ error: { code: 'invalid_api_key', message: 'API key ausente, inválida o revocada' } });
    }
    const publicSecrets = await deps.readPublicSecrets(businessId);
    res.json({ flags: {}, publicSecrets });
  } catch (e) {
    console.error('[tenant-config] error leyendo config pública:', e);
    res.status(500).json({ error: { code: 'server_error', message: 'No se pudo cargar la configuración' } });
  }
}

export const tenantConfigRouter = Router();

tenantConfigRouter.get('/', resolveTenantApiKey(), (req: AuthedRequest, res) => tenantConfigHandler(defaultDeps, req, res));
