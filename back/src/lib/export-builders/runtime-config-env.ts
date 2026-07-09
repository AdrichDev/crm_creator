/**
 * back/src/lib/export-builders/runtime-config-env.ts
 *
 * crm-export-runtime-config: variables de entorno que cablean el ZIP exportado
 * al runtime de plataforma (`/tenant-config`, `/ai-proxy`, kill switch 423 —
 * ver design.md). Este modulo NO escribe archivos: solo declara las lineas
 * que se aportan al punto de extension `extraLines` de `buildEnvContent` /
 * `buildEnvExampleContent` (`manifest-allowlist.ts`, escritor unico de
 * `.env.local`/`.env.example`, propiedad de `crm-export-clean-manifest`).
 */

/** Config runtime resuelta para UN tenant en el momento de exportar (design.md §2). */
export interface RuntimeConfig {
  /** URL del backend de plataforma (env del propio `back/`, NO del tenant). */
  platformApiUrl: string;
  /** Identificador de tenant ante la plataforma — el `businessId` del negocio. */
  tenantId: string;
  /** Token en claro de una `TenantApiKey` valida para este tenant. */
  tenantApiKey: string;
}

/**
 * Lineas reales de `.env.local` para el cableado runtime. Sin `runtimeConfig`
 * (build invocado fuera del pipeline de job, p. ej. tests unitarios directos
 * de un builder) no aporta ninguna linea — comportamiento previo intacto.
 */
export function buildRuntimeConfigEnvLines(runtimeConfig?: RuntimeConfig): string[] {
  if (!runtimeConfig) return [];
  return [
    `PLATFORM_API_URL=${runtimeConfig.platformApiUrl}`,
    `TENANT_ID=${runtimeConfig.tenantId}`,
    `TENANT_API_KEY=${runtimeConfig.tenantApiKey}`,
  ];
}

/**
 * Placeholders de `.env.example` — SIEMPRE las 3 claves vacias, nunca el
 * valor real del tenant en curso ni de ningun otro (AC2 de validation.md).
 * Se declaran incondicionalmente (independientes de si `runtimeConfig` se
 * pudo resolver) porque documentan el contrato de variables que la app
 * exportada espera, no el resultado de un export concreto.
 */
export const RUNTIME_CONFIG_ENV_EXAMPLE_LINES: readonly string[] = [
  'PLATFORM_API_URL=',
  'TENANT_ID=',
  'TENANT_API_KEY=',
];
