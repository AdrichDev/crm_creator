import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// ---------------------------------------------------------------------------
// Cifrado AES-256-GCM para TenantSecret (crm-tenant-api-keys). Mismo esquema
// probado que back/src/lib/crypto.ts (iv 12B, authTag 16B, hex), pero con clave
// PROPIA (SECRETS_MASTER_KEY, distinta de CRM_OAUTH_ENCRYPTION_KEY) para contener
// el blast radius: una fuga de la clave maestra de secretos de negocio no debe
// comprometer las credenciales OAuth y viceversa.
//
// Soporta rotación de clave maestra sin re-emitir los secretos ya cifrados: cada
// fila persiste su `keyVersion`; la versión 1 lee SECRETS_MASTER_KEY, la versión N
// (N>1) lee SECRETS_MASTER_KEY_V{N}. La versión "actual" (la que usan los cifrados
// nuevos) se fija con SECRETS_MASTER_KEY_VERSION (default 1).
// ---------------------------------------------------------------------------

/** Payload cifrado AES-256-GCM de un TenantSecret, listo para persistir en fila. */
export interface EncryptedSecret {
  ciphertext: string; // hex
  iv: string;          // hex, 12 bytes
  authTag: string;      // hex, 16 bytes
  keyVersion: number;
}

/** Nombre de la env var que guarda la clave de una versión dada. v1 = SECRETS_MASTER_KEY. */
function envNameForVersion(version: number): string {
  return version <= 1 ? 'SECRETS_MASTER_KEY' : `SECRETS_MASTER_KEY_V${version}`;
}

/** Carga y valida la clave de una versión concreta. Lanza si falta o tiene longitud incorrecta. */
function getKey(version: number): Buffer {
  const envName = envNameForVersion(version);
  const raw = process.env[envName];
  if (!raw) {
    throw new Error(`Configuración de cifrado incompleta: ${envName} no definida (keyVersion=${version})`);
  }
  // Acepta hex (64 chars) o base64 (44 chars para 32 bytes) — igual que crypto.ts.
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(
      `Configuración de cifrado incompleta: ${envName} debe ser 32 bytes (64 hex chars o base64 de 32 bytes), longitud actual: ${key.length}`,
    );
  }
  return key;
}

/**
 * Versión de clave maestra "actual" — la que usan los cifrados nuevos.
 * Default 1 (SECRETS_MASTER_KEY). Se sube tras publicar SECRETS_MASTER_KEY_V{N} y
 * fijar SECRETS_MASTER_KEY_VERSION=N; las filas ya cifradas con versiones
 * anteriores se siguen descifrando mientras esa env siga presente.
 */
export function currentKeyVersion(): number {
  const raw = process.env.SECRETS_MASTER_KEY_VERSION;
  const parsed = raw ? Number(raw) : 1;
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
}

/** Cifra un string con AES-256-GCM usando la versión de clave indicada (default: la actual). */
export function encryptSecret(plain: string, keyVersion: number = currentKeyVersion()): EncryptedSecret {
  const key = getKey(keyVersion);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: data.toString('hex'),
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    keyVersion,
  };
}

/** Descifra un TenantSecret. Usa la clave de la versión que persiste el propio payload. */
export function decryptSecret(payload: EncryptedSecret): string {
  const key = getKey(payload.keyVersion);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(payload.authTag, 'hex'));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'hex')),
    decipher.final(),
  ]);
  return plain.toString('utf8');
}
