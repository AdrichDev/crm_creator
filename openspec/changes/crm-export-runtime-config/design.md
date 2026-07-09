# Diseño técnico — crm-export-runtime-config

## 1. Contrato asumido (de `crm-tenant-api-keys` / `crm-ai-proxy`, no implementado aquí)

Este change asume, sin implementarlo, que el backend de plataforma expone:
- `GET /tenant-config` (auth por `TENANT_ID` + `TENANT_API_KEY`) → config runtime del tenant.
- `POST /ai-proxy` (misma auth) → proxy de llamadas IA medidas/facturadas.
- Cualquier respuesta con `HTTP 423` (Locked) → señal de kill switch de plataforma (tenant
  suspendido/bloqueado).
- Y que `front/` (código fuente compartido, entregado por esas changes) ya trae un cliente que
  usa estas 3 variables de entorno: `PLATFORM_API_URL`, `TENANT_ID`, `TENANT_API_KEY`.

Si al ejecutar este change esas piezas de `front/` todavía no existen, las tareas de "cableado
del exportador" (§2) siguen siendo correctas (son variables de entorno), pero los tests de
comportamiento runtime (WU3 en `validation.md`) quedan bloqueados hasta que `front/` tenga el
cliente — se marcan como bloqueados, no se simulan.

## 2. Cambios en el exportador

### `back/src/routes/exports.ts`
- `createExportHandler`: además de `config` (TenantConfig) y `outputDir`/`frontDir`, resolver los
  3 valores runtime a pasar a los builders:
  - `platformApiUrl`: constante de entorno del backend de plataforma (env del propio `back/`,
    p.ej. `process.env.PLATFORM_API_URL`, NO del tenant).
  - `tenantId`: candidato `config.business.clienteId` (ya existe en `TenantConfig`) si
    `crm-tenant-api-keys` no define uno propio; si lo define, se usa ese.
  - `tenantApiKey`: provisto por `crm-tenant-api-keys` (tabla/servicio de API keys por tenant);
    este change NO lo genera, solo lo consume vía `deps.db` o un nuevo puerto inyectado
    (`ExportsDeps.tenantKeys?: { getApiKey(tenantId): string }`, a confirmar contra el diseño real
    de `crm-tenant-api-keys`).
- `StartJobParams` (en `export-job-manager.ts`, no listado en el código leído para este change
  pero referenciado desde `exports.ts`) gana un campo `runtimeConfig: { platformApiUrl, tenantId,
  tenantApiKey }` que se propaga a cada builder junto con `config`, `outputDir`, `frontDir`.

### Los 4 builders (`web-zip.ts`, `apk.ts`, `exe.ts`, `ipa.ts`)
- Firma de `build*` gana un parámetro `runtimeConfig` (o se añade a `config` como
  `config.runtime` si `crm-tenant-api-keys` extiende `TenantConfig` — a decidir junto con esa
  change, aquí se documenta la necesidad, no el shape final).
- Las 3 variables reales se aportan a través del punto de extensión `buildEnvContent` de
  `crm-export-clean-manifest` (hook/parámetro documentado en su `design.md` §3): el builder pasa
  `runtimeConfig` a la extensión y `writeFreshEnvLocal` — ÚNICO escritor de `.env.local` en todo
  el pipeline de exportación — incluye las líneas en su escritura única. Los builders NUNCA
  escriben ni appendean `.env.local` directamente (sin `fs.writeFileSync`/`appendFileSync`
  propios), evitando pisar o ser pisados por el `.env.local` fresco de esa change:
  ```
  PLATFORM_API_URL=<runtimeConfig.platformApiUrl>
  TENANT_ID=<runtimeConfig.tenantId>
  TENANT_API_KEY=<runtimeConfig.tenantApiKey>
  ```
  (Nombres exactos y si alguna necesita prefijo `NEXT_PUBLIC_` para ser visible en el bundle
  cliente se confirman con `crm-tenant-api-keys`; aquí se documenta el riesgo de exponer
  `TENANT_API_KEY` en el bundle, ver `proposal.md` §Riesgos.)
- `.env.example`: la emisión del archivo es propiedad exclusiva de `crm-export-clean-manifest`
  (generado en memoria por su módulo, NUNCA copiado de un `.env.example` real que pudiera tener
  valores de una sesión de desarrollo anterior). Este change NO emite el archivo: solo especifica
  QUÉ líneas placeholder deben existir en él, declaradas vía la misma extensión:
  ```
  PLATFORM_API_URL=
  TENANT_ID=
  TENANT_API_KEY=
  ```

## 3. Archivos afectados

| Archivo | Cambio |
|---|---|
| `back/src/routes/exports.ts` | `createExportHandler` resuelve y propaga `runtimeConfig` (platformApiUrl/tenantId/tenantApiKey). |
| `back/src/lib/export-job-manager.ts` | `StartJobParams`/`ExportJob` ganan `runtimeConfig` (archivo no auditado en detalle en este change; confirmar shape real antes de implementar). |
| `back/src/lib/export-builders/manifest-allowlist.ts` | Extensión de `buildEnvContent` (punto de extensión de `crm-export-clean-manifest`) para aceptar las 3 variables runtime y las 3 líneas placeholder de `.env.example`. |
| `back/src/lib/export-builders/web-zip.ts` | Pasa `runtimeConfig` a la extensión `buildEnvContent`; sin escritura directa de `.env.local` ni emisión de `.env.example`. |
| `back/src/lib/export-builders/apk.ts` | ídem. |
| `back/src/lib/export-builders/exe.ts` | ídem. |
| `back/src/lib/export-builders/ipa.ts` | ídem. |
| `front/lib/...` (cliente runtime, proxy IA, interceptor 423) | Fuera de alcance — entregado por `crm-tenant-api-keys`/`crm-ai-proxy`. |

## 4. Data flow
`POST /api/exports` → `createExportHandler` resuelve `TenantConfig` (como hoy) + `runtimeConfig`
(nuevo, desde config del propio backend de plataforma + servicio de API keys) → `startJob` →
cada builder recibe `runtimeConfig` junto a `config`/`outputDir`/`frontDir` y lo aporta a la
extensión `buildEnvContent` de `crm-export-clean-manifest` (escritor único) → el `.env.local`
del ZIP lleva las 3 variables reales + `.env.example` (emitido por esa change) con los
placeholders declarados aquí → cliente descarga ZIP → al
compilar/ejecutar, el front (código de `crm-tenant-api-keys`/`crm-ai-proxy`) lee esas variables y
habla con `/tenant-config`/`/ai-proxy`, reaccionando a 423 si la plataforma lo emite.

## 5. Estrategia de test
- Test del exportador (no del front, que es de otra change): dado un `runtimeConfig` de fixture,
  verificar que el `.env.local` del ZIP resultante de cada builder contiene las 3 variables con
  los valores esperados (aportadas vía la extensión `buildEnvContent`, sin escritura directa del
  builder), y que el `.env.example` (emitido por `crm-export-clean-manifest`) contiene las 3
  líneas placeholder declaradas aquí, solo claves vacías, nunca los valores del fixture.
- Test explícito de que `.env.example` NUNCA lleva el valor real de `tenantApiKey` del fixture
  (mismo principio anti-fuga que `crm-export-clean-manifest`, aplicado aquí a credenciales de
  plataforma en vez de a `.env.local` de desarrollo).
- Bloqueado hasta que exista: cualquier test end-to-end de que la app exportada realmente
  responde a un 423 o llama a `/tenant-config`/`/ai-proxy` — eso vive en el front que entregan
  `crm-tenant-api-keys`/`crm-ai-proxy`, no en este change.
