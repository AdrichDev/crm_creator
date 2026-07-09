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

// ---------------------------------------------------------------------------
// crm-env-contract-tiers: resolución de secretos por negocio (WU2 — helper
// server-side con fallback al env del operador) y puente build-time (WU3 —
// horneado de FRONTEND_PUBLIC con envVarName en el .env.local exportado).
// ---------------------------------------------------------------------------

/** Resultado de `getTenantSecret`: distingue si el valor vino del negocio o del operador. */
export interface TenantSecretResolution {
  value: string;
  source: 'tenant' | 'operator';
}

/**
 * Resuelve UN secreto por negocio (cualquier scope, uso server-side vía
 * `readTenantSecret`) con fallback opcional a una variable de entorno del
 * operador. Devuelve `null` si no hay clave en ningún lado — el call-site
 * degrada exactamente como hoy (feature desactivada, nunca un crash).
 *
 * El valor descifrado vive solo en memoria del request: NUNCA se loguea ni
 * se reenvía en una respuesta HTTP. `source` es la señal que
 * `crm-ai-proxy`/`crm-metering-core` usarán para medir el uso de la clave del
 * operador (fallback) — este helper no mide, solo expone la distinción.
 */
export async function getTenantSecret(
  businessId: string,
  name: string,
  opts: { fallbackEnv?: string } = {},
  db: TenantSecretDb = prisma,
): Promise<TenantSecretResolution | null> {
  const tenantValue = await readTenantSecret(businessId, name, db);
  if (tenantValue) return { value: tenantValue, source: 'tenant' };

  if (opts.fallbackEnv) {
    const envValue = process.env[opts.fallbackEnv];
    if (envValue) return { value: envValue, source: 'operator' };
  }

  return null;
}

/** Fila de `TenantSecret` con `envVarName`, necesaria para el puente build-time. */
export interface BakeableSecretRow {
  name: string;
  // Prisma no estrecha el tipo por el filtro `not: null` del WHERE — sigue
  // siendo `string | null` a nivel de tipos aunque el runtime lo garantice.
  envVarName: string | null;
  valueCiphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
}

/** Vista estrecha de BD para el puente build-time (patrón DI del repo). */
export interface TenantSecretBakeDb {
  tenantSecret: {
    findMany(args: {
      where: { businessId: string; scope: 'FRONTEND_PUBLIC'; envVarName: { not: null } };
      select: { name: true; envVarName: true; valueCiphertext: true; iv: true; authTag: true; keyVersion: true };
    }): Promise<BakeableSecretRow[]>;
  };
}

/**
 * Lee y descifra los secretos `scope=FRONTEND_PUBLIC` de un negocio que
 * tienen `envVarName` asignado — la lista lista para hornear en el
 * `.env.local` de un export (`crm-env-contract-tiers` WU3). El filtro de
 * scope Y de `envVarName != null` va en el WHERE: un `BACKEND_SECRET` o un
 * `FRONTEND_PUBLIC` sin `envVarName` nunca llegan siquiera a estar en
 * memoria en esta ruta. `db` inyectable para tests.
 */
export async function readBakeableSecrets(
  businessId: string,
  db: TenantSecretBakeDb = prisma,
): Promise<Array<{ envVarName: string; value: string }>> {
  const rows = await db.tenantSecret.findMany({
    where: { businessId, scope: 'FRONTEND_PUBLIC', envVarName: { not: null } },
    select: { name: true, envVarName: true, valueCiphertext: true, iv: true, authTag: true, keyVersion: true },
  });
  // El WHERE ya garantiza envVarName != null en runtime; el filtro aquí solo
  // estrecha el tipo para TS (Prisma no lo infiere desde el WHERE).
  return rows
    .filter((row): row is BakeableSecretRow & { envVarName: string } => row.envVarName !== null)
    .map((row) => ({
      envVarName: row.envVarName,
      value: decryptSecret({ ciphertext: row.valueCiphertext, iv: row.iv, authTag: row.authTag, keyVersion: row.keyVersion }),
    }));
}
