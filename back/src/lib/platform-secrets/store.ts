import { prisma } from '../../prisma.js';
import { encryptSecret, decryptSecret } from '../tenant-secrets/crypto.js';

// ---------------------------------------------------------------------------
// crm-central-oauth-admin-config: store de secretos de PLATAFORMA (sin negocio).
// Analogo a tenant-secrets/store.ts pero a nivel plataforma: las credenciales
// centrales (hoy la app Google OAuth compartida) viven cifradas AES-256-GCM en la
// tabla platform_setting, con la MISMA clave maestra (SECRETS_MASTER_KEY) y crypto
// que TenantSecret. Uso EXCLUSIVO server-side: el valor descifrado NUNCA se loguea
// ni se reenvia en una respuesta HTTP tenant-facing ni entra a ningun export.
//
// Decision de persistencia (design §B, Opcion B): tabla propia platform_setting en
// vez de un businessId centinela en TenantSecret, porque TenantSecret.negocio_id es
// una FK NOT NULL con onDelete Cascade — un centinela exigiria una fila Business
// falsa o soltar la FK, ambas sucias.
// ---------------------------------------------------------------------------

/** Fila minima de platform_setting necesaria para descifrar. */
export interface PlatformSettingRow {
  key: string;
  valueCiphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
}

/** Vista estrecha de BD (patron DI del repo) — Prisma la satisface estructuralmente. */
export interface PlatformSettingDb {
  platformSetting: {
    findUnique(args: {
      where: { key: string };
      select: { key: true; valueCiphertext: true; iv: true; authTag: true; keyVersion: true };
    }): Promise<PlatformSettingRow | null>;
    upsert(args: {
      where: { key: string };
      create: { key: string; valueCiphertext: string; iv: string; authTag: string; keyVersion: number };
      update: { valueCiphertext: string; iv: string; authTag: string; keyVersion: number };
    }): Promise<{ key: string; keyVersion: number; updatedAt: Date }>;
    findMany(args: {
      where: { key: { in: string[] } };
      select: { key: true; updatedAt: true };
    }): Promise<Array<{ key: string; updatedAt: Date }>>;
  };
}

/**
 * DB por defecto: el Prisma real. El cast es deliberado — el delegate
 * `platformSetting` solo existe en el cliente generado DESPUES de
 * `prisma generate` (que corre el build de despliegue). En este arbol de
 * codigo (sin regenerar) el cast permite typecheck; en runtime, si el delegate
 * aun no existe, `readPlatformSecret` degrada a `null` (ver guard) → cae al env.
 */
function defaultPlatformDb(): PlatformSettingDb {
  return prisma as unknown as PlatformSettingDb;
}

/**
 * Lee y descifra UN ajuste de plataforma por clave. Devuelve `null` si no existe.
 * Guard defensivo: si el delegate `platformSetting` aun no esta en el cliente
 * (cliente sin regenerar / feature no desplegada), devuelve `null` en vez de
 * romper el hot-path de OAuth — la resolucion cae al env (regresion cero).
 * `db` inyectable para tests.
 */
export async function readPlatformSecret(
  key: string,
  db: PlatformSettingDb = defaultPlatformDb(),
): Promise<string | null> {
  if (!db?.platformSetting?.findUnique) return null;
  const row = await db.platformSetting.findUnique({
    where: { key },
    select: { key: true, valueCiphertext: true, iv: true, authTag: true, keyVersion: true },
  });
  if (!row) return null;
  return decryptSecret({ ciphertext: row.valueCiphertext, iv: row.iv, authTag: row.authTag, keyVersion: row.keyVersion });
}

/** Resultado de `getPlatformSecret`: distingue si el valor vino de plataforma (BD) o del env. */
export interface PlatformSecretResolution {
  value: string;
  source: 'platform' | 'env';
}

/**
 * Resuelve UN secreto de plataforma con fallback opcional a una variable de
 * entorno (legacy / retro-compat). Devuelve el valor de BD si existe; si no, el
 * env de `fallbackEnv`; si tampoco, `null`. Analogo a `getTenantSecret`, pero a
 * nivel plataforma. `db` inyectable para tests.
 */
export async function getPlatformSecret(
  key: string,
  opts: { fallbackEnv?: string } = {},
  db: PlatformSettingDb = defaultPlatformDb(),
): Promise<PlatformSecretResolution | null> {
  const platformValue = await readPlatformSecret(key, db);
  if (platformValue) return { value: platformValue, source: 'platform' };

  if (opts.fallbackEnv) {
    const envValue = process.env[opts.fallbackEnv];
    if (envValue) return { value: envValue, source: 'env' };
  }

  return null;
}

/**
 * Cifra y persiste (upsert por clave) UN ajuste de plataforma. El valor en claro
 * solo vive en memoria del request: se cifra aqui y NUNCA se loguea ni se devuelve.
 * `db` inyectable para tests.
 */
export async function upsertPlatformSecret(
  key: string,
  value: string,
  db: PlatformSettingDb = defaultPlatformDb(),
): Promise<{ key: string; keyVersion: number; updatedAt: Date }> {
  const enc = encryptSecret(value);
  return db.platformSetting.upsert({
    where: { key },
    create: { key, valueCiphertext: enc.ciphertext, iv: enc.iv, authTag: enc.authTag, keyVersion: enc.keyVersion },
    update: { valueCiphertext: enc.ciphertext, iv: enc.iv, authTag: enc.authTag, keyVersion: enc.keyVersion },
  });
}

/**
 * Estado (configurado si/no) de un conjunto de claves de plataforma, SIN devolver
 * ningun valor (ni cifrado ni en claro) — para la respuesta de estado de la API
 * admin. `db` inyectable para tests.
 */
export async function platformSecretStatus(
  keys: string[],
  db: PlatformSettingDb = defaultPlatformDb(),
): Promise<Record<string, { configured: boolean; updatedAt: Date | null }>> {
  const out: Record<string, { configured: boolean; updatedAt: Date | null }> = {};
  for (const k of keys) out[k] = { configured: false, updatedAt: null };
  if (!db?.platformSetting?.findMany) return out;
  const rows = await db.platformSetting.findMany({ where: { key: { in: keys } }, select: { key: true, updatedAt: true } });
  for (const row of rows) out[row.key] = { configured: true, updatedAt: row.updatedAt };
  return out;
}
