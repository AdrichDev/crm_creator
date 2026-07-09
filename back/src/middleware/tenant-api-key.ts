import type { Response, NextFunction } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '../prisma.js';
import type { AuthedRequest } from './types.js';

// ---------------------------------------------------------------------------
// crm-tenant-api-keys: carril de auth PARALELO al de sesión de usuario
// (authenticate + rbac) y al de operador (requireOperatorToken). Resuelve el
// businessId de una app externa del tenant a partir de una TenantApiKey
// portadora, sin arrastrar sesión ni abrir RBAC de panel. No falsea req.user.
//
// Solo se persiste el HASH SHA-256 del token (nunca el valor en claro); el
// lookup es por columna @unique(tokenHash) — sin timing leak del secreto,
// porque lo que se compara es un hash indexado, no el secreto byte a byte.
// ---------------------------------------------------------------------------

/** Longitud (bytes) del secreto aleatorio del token, antes de hex-encode. */
const TOKEN_SECRET_BYTES = 24;
/** Chars visibles del prefix (NO secreto), para listados/logs sin exponer la clave. */
const PREFIX_LENGTH = 8;

/** Hash SHA-256 (hex) de un token en claro — lo único que se persiste en BD. */
export function hashApiKeyToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Genera un token en claro nuevo con un prefix visible de 8 chars y su hash SHA-256.
 * El token en claro NUNCA se persiste — el caller lo devuelve al operador una sola vez.
 */
export function generateApiKeyToken(): { token: string; prefix: string; tokenHash: string } {
  const prefix = randomBytes(PREFIX_LENGTH / 2).toString('hex'); // 8 hex chars
  const secret = randomBytes(TOKEN_SECRET_BYTES).toString('hex');
  const token = `tk_${prefix}_${secret}`;
  return { token, prefix, tokenHash: hashApiKeyToken(token) };
}

/** Vista estrecha de BD que necesita el middleware — Prisma la satisface estructuralmente. */
export interface TenantApiKeyDb {
  tenantApiKey: {
    findUnique(args: {
      where: { tokenHash: string };
      select: { id: true; businessId: true; revokedAt: true };
    }): Promise<{ id: string; businessId: string; revokedAt: Date | null } | null>;
    update(args: { where: { id: string }; data: { lastUsedAt: Date } }): Promise<unknown>;
  };
}

const INVALID_API_KEY = { error: { code: 'invalid_api_key', message: 'API key ausente, inválida o revocada' } };

/**
 * Intenta resolver `req.tenantBusinessId` desde un `Authorization: Bearer <token>` que sea
 * una `TenantApiKey` válida (no revocada), SIN escribir en `res`. Devuelve `true` si resolvió;
 * `false` si no hay token o no es una `TenantApiKey` válida — en ambos casos el caller decide
 * cómo responder (401 directo, o caer a otro mecanismo de auth). Lanza si la consulta a BD
 * falla (el caller decide si eso es 500 o si igualmente intenta un fallback). Actualiza
 * `lastUsedAt` best-effort si resuelve. Extraído para reutilizarse tanto desde
 * `resolveTenantApiKey` (carril único, apps exportadas) como desde `resolveTenantConfigAuth`
 * (`routes/tenant-config.ts`, carril dual panel+apps).
 */
export async function tryResolveTenantApiKey(
  req: AuthedRequest,
  db: TenantApiKeyDb = prisma,
): Promise<boolean> {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return false;

  const key = await db.tenantApiKey.findUnique({
    where: { tokenHash: hashApiKeyToken(token) },
    select: { id: true, businessId: true, revokedAt: true },
  });
  if (!key || key.revokedAt != null) return false;

  req.tenantBusinessId = key.businessId;
  // Best-effort: no se espera ni bloquea la respuesta por esto.
  void db.tenantApiKey
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
    .catch((e) => console.error('[tenant-api-key] error actualizando lastUsedAt:', e));
  return true;
}

/**
 * Middleware: exige `Authorization: Bearer <token>`, resuelve el `businessId` de la
 * TenantApiKey correspondiente y lo fija en `req.tenantBusinessId`. Clave ausente,
 * desconocida o revocada → 401 `invalid_api_key`. `db` inyectable para tests
 * (patrón DI del repo, ver service-operator.ts).
 */
export function resolveTenantApiKey(db: TenantApiKeyDb = prisma) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const resolved = await tryResolveTenantApiKey(req, db);
      if (!resolved) {
        return res.status(401).json(INVALID_API_KEY);
      }
      next();
    } catch (e) {
      console.error('[tenant-api-key] error resolviendo clave:', e);
      return res.status(500).json({ error: { code: 'server_error', message: 'Error interno' } });
    }
  };
}
