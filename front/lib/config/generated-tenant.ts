// Config del tenant horneada en build.
//
// Históricamente este fichero era sobreescrito literalmente por un generador
// legacy (generar.mjs, retirado) que parcheaba el código fuente antes de
// compilar. Ese exportador ya no existe, pero TODO el consumo (dashboard/page,
// tenant-config-context, app-shell, sidebar) sigue vivo y probado — se
// reutiliza tal cual apuntando a la fuente de verdad actual (D4/D5):
// BAKED_TENANT_CONFIG, horneado via NEXT_PUBLIC_TENANT_JSON por el exportador
// web-zip (export-temp-copy.ts + export-builders/web-zip.ts).
//
// En el repo fuente (sin la env var) BAKED_TENANT_CONFIG es null y la app
// arranca como consola multi-proyecto, exactamente igual que antes.
import { BAKED_TENANT_CONFIG, type TenantConfig } from './tenant-config';

export const GENERATED_TENANT: TenantConfig | null = BAKED_TENANT_CONFIG;
