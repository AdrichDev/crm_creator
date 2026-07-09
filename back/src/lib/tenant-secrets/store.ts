import { prisma } from '../../prisma.js';
import { decryptSecret } from './crypto.js';

// ---------------------------------------------------------------------------
// crm-tenant-api-keys: acceso de lectura a TenantSecret. La frontera público/
// privado la impone ESTE archivo, no cada caller: `readPublicSecrets` filtra por
// scope=FRONTEND_PUBLIC en la query (nunca lee BACKEND_SECRET), mientras que
// `readTenantSecret` es de uso EXCLUSIVO server-side (ai-proxy, integraciones) y
// puede leer cualquier scope, pero su resultado nunca debe reenviarse por HTTP.
// ---------------------------------------------------------------------------

/** Fila mínima de TenantSecret necesaria para descifrar. */
export interface SecretRow {
  name: string;
  scope: 'FRONTEND_PUBLIC' | 'BACKEND_SECRET';
  valueCiphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
}

/** Vista estrecha de BD (patrón DI del repo) — Prisma la satisface estructuralmente. */
export interface TenantSecretDb {
  tenantSecret: {
    findUnique(args: {
      where: { businessId_name: { businessId: string; name: string } };
      select: { name: true; scope: true; valueCiphertext: true; iv: true; authTag: true; keyVersion: true };
    }): Promise<SecretRow | null>;
    findMany(args: {
      where: { businessId: string; scope: 'FRONTEND_PUBLIC' };
      select: { name: true; scope: true; valueCiphertext: true; iv: true; authTag: true; keyVersion: true };
    }): Promise<SecretRow[]>;
  };
}

function decryptRow(row: SecretRow): string {
  return decryptSecret({
    ciphertext: row.valueCiphertext,
    iv: row.iv,
    authTag: row.authTag,
    keyVersion: row.keyVersion,
  });
}

/**
 * Lee y descifra UN secreto de un negocio por nombre, sea cual sea su scope.
 * Uso EXCLUSIVO server-side (p. ej. ai-proxy leyendo una clave de proveedor):
 * el valor devuelto NUNCA debe reenviarse tal cual en una respuesta HTTP
 * tenant-facing. Devuelve `null` si no existe. `db` inyectable para tests.
 */
export async function readTenantSecret(
  businessId: string,
  name: string,
  db: TenantSecretDb = prisma,
): Promise<string | null> {
  const row = await db.tenantSecret.findUnique({
    where: { businessId_name: { businessId, name } },
    select: { name: true, scope: true, valueCiphertext: true, iv: true, authTag: true, keyVersion: true },
  });
  if (!row) return null;
  return decryptRow(row);
}

/**
 * Lee y descifra TODOS los secretos `scope=FRONTEND_PUBLIC` de un negocio.
 * Es el ÚNICO punto de lectura que consume `GET /tenant-config`: el filtro
 * `scope: 'FRONTEND_PUBLIC'` va en la query, así que un BACKEND_SECRET nunca
 * llega siquiera a estar en memoria en esta ruta. `db` inyectable para tests.
 */
export async function readPublicSecrets(
  businessId: string,
  db: TenantSecretDb = prisma,
): Promise<Record<string, string>> {
  const rows = await db.tenantSecret.findMany({
    where: { businessId, scope: 'FRONTEND_PUBLIC' },
    select: { name: true, scope: true, valueCiphertext: true, iv: true, authTag: true, keyVersion: true },
  });
  const out: Record<string, string> = {};
  for (const row of rows) {
    out[row.name] = decryptRow(row);
  }
  return out;
}
