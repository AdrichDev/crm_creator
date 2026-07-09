/**
 * back/src/lib/export-builders/public-env-secrets.ts
 *
 * crm-env-contract-tiers (WU3.3): puente build-time secreto->variable de build.
 * Convierte los `FRONTEND_PUBLIC` con `envVarName` ya resueltos y descifrados
 * (`readBakeableSecrets`, tenant-secrets/store.ts) en lineas `NEXT_PUBLIC_*`
 * para el punto de extension `extraLines` de `buildEnvContent`
 * (`manifest-allowlist.ts`, escritor unico de `.env.local`). Este modulo NO
 * escribe archivos ni descifra: solo transforma valores ya en memoria.
 *
 * Defensa en profundidad: la regex y el rechazo de saltos de linea YA se
 * validan al alta del secreto (`service-operator-tenant-keys.ts` WU3.2), pero
 * se re-validan aqui porque una fila puede predatar esa validacion (secretos
 * creados antes de este change, o escritos directo en BD).
 */

const ENV_VAR_NAME_PATTERN = /^NEXT_PUBLIC_[A-Z0-9_]+$/;

/**
 * Variables que `buildEnvContent` SIEMPRE puede emitir por su cuenta
 * (`NEXT_PUBLIC_TENANT_JSON`, `NEXT_PUBLIC_API_URL`). Un secreto de tenant
 * con `envVarName` igual a una de estas NUNCA gana: la base garantiza que la
 * app arranca (`BAKED_TENANT_CONFIG`), no se deja en manos de un valor de
 * operador que pudiera romper el arranque.
 */
export const BASE_ENV_VAR_NAMES: readonly string[] = ['NEXT_PUBLIC_TENANT_JSON', 'NEXT_PUBLIC_API_URL'];

export interface PublicEnvSecret {
  envVarName: string;
  value: string;
}

/**
 * Lineas `NEXT_PUBLIC_*=valor` para el `.env.local` horneado, a partir de los
 * secretos `FRONTEND_PUBLIC` con `envVarName` ya resueltos de UN negocio.
 * Descarta silenciosamente (con warning en consola, sin lanzar) cualquier
 * fila que no pase la re-validacion o que colisione con una variable base —
 * un secreto legacy/corrupto no debe tumbar el export completo.
 */
export function buildPublicEnvSecretsLines(
  secrets: PublicEnvSecret[],
  baseVarNames: readonly string[] = BASE_ENV_VAR_NAMES,
): string[] {
  const lines: string[] = [];
  for (const secret of secrets) {
    if (baseVarNames.includes(secret.envVarName)) {
      console.warn(`[export] secreto de tenant ignorado: ${secret.envVarName} colisiona con una variable base de .env.local`);
      continue;
    }
    if (!ENV_VAR_NAME_PATTERN.test(secret.envVarName)) {
      console.warn(`[export] secreto de tenant ignorado: envVarName invalido (${secret.envVarName})`);
      continue;
    }
    if (/[\r\n]/.test(secret.value)) {
      console.warn(`[export] secreto de tenant ignorado: valor con salto de linea (${secret.envVarName})`);
      continue;
    }
    lines.push(`${secret.envVarName}=${secret.value}`);
  }
  return lines;
}
