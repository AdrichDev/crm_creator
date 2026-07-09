# Tareas — crm-export-runtime-config

Alcance: cableado del exportador a config runtime de plataforma (`PLATFORM_API_URL`/`TENANT_ID`/
`TENANT_API_KEY`) + `.env.example` limpio. Nivel 2. Sin migración. Orden = por dependencia
(resolución en `exports.ts` → propagación a builders → `.env.example` → verificación). Agentic
Runtime gate antes de cualquier push. WU con dependencia externa quedan marcadas BLOQUEADA.

## WU1 — Resolución de `runtimeConfig` (back)
- [x] 1.1 Confirmar con `crm-tenant-api-keys` el shape real de `tenantId`/`tenantApiKey` (puede
  reusar `config.business.clienteId` o ser un identificador propio — decisión de esa change).
  **Resuelto**: `tenantId` = `businessId` del negocio (el mismo `projectId`/`TenantApiKey.businessId`
  real del código, NO `config.business.clienteId` — ese campo enlaza con `crm_project.id_cliente`
  en agents-agency, dominio distinto). `tenantApiKey` = token en claro de una `TenantApiKey`
  minteada FRESCA server-side en el momento de exportar (vía `generateApiKeyToken` +
  `prisma.tenantApiKey.create`, mismo mecanismo que `issueApiKeyHandler` del operador); no existe
  lectura de plaintext de una clave ya emitida (solo se persiste `tokenHash`), así que reusar una
  clave existente no es viable sin ese endpoint.
- [x] 1.2 `exports.ts` / `export-job-manager.ts`: `StartJobParams` gana `runtimeConfig:
  { platformApiUrl, tenantId, tenantApiKey }`; `createExportHandler` lo resuelve y lo pasa a
  `startJob`.
- [x] 1.3 Test `exports.test.ts`: `runtimeConfig` presente y correcto en el job arrancado.

## WU2 — Propagación a los 4 builders (vía extensión, sin escritura directa)
- [x] 2.1 `buildWebZip`/`buildApk`/`buildExe`/`buildIpa`: nuevo parámetro `runtimeConfig`,
  aportado al punto de extensión `buildEnvContent` de `crm-export-clean-manifest` (escritor
  único de `.env.local`); el `.env.local` del ZIP incluye `PLATFORM_API_URL`/`TENANT_ID`/
  `TENANT_API_KEY` reales. Ningún builder escribe/appendea `.env.local` directamente.
  Requiere `buildEnvContent` aterrizado (ver §Dependencias del `proposal.md`).
- [x] 2.2 Test por builder: valores del fixture presentes en el `.env.local` empaquetado.

## WU3 — Placeholders en `.env.example`
- [x] 3.1 Declarar ante el emisor de `.env.example` de `crm-export-clean-manifest` (único dueño
  de la emisión) las 3 líneas placeholder (`PLATFORM_API_URL=`, `TENANT_ID=`,
  `TENANT_API_KEY=`), vía la misma extensión de `buildEnvContent`; este change NO genera el
  archivo por su cuenta.
- [x] 3.2 Test parametrizado: `.env.example` de cada ZIP contiene las 3 líneas placeholder y
  nunca el valor real del fixture.

## WU4 — Consistencia cruzada
- [x] 4.1 Test de integración: mismo `runtimeConfig` para un tenant → los 4 ZIP llevan los
  mismos 3 valores.

## Bloqueadas (dependencia externa)
- [ ] B.1 Verificación end-to-end de `/tenant-config` real — BLOQUEADA por `crm-tenant-api-keys`.
- [ ] B.2 Verificación end-to-end de `/ai-proxy` real — BLOQUEADA por `crm-ai-proxy`.
- [ ] B.3 Verificación de reacción a `423` (kill switch) en la app exportada — BLOQUEADA por
  `crm-tenant-api-keys` (quién emite el 423) y por el cliente front de esa change.

## Cierre
- [x] Z.1 `tsc` limpio en `back/`.
- [x] Z.2 Suite de `back/` verde (WU1-WU4; B.1-B.3 quedan fuera hasta desbloquearse). 691/691.
- [ ] Z.3 Agentic Runtime review antes de cualquier push (foco: `TENANT_API_KEY` no debe quedar
  logueada ni expuesta fuera del `.env.local` del ZIP correspondiente). Pendiente: requiere
  revisión humana/reviewer dedicado antes de push, no se marca DONE por autoverificación del
  implementador.
- [x] Z.4 Registrar en Engram el acoplamiento con `crm-tenant-api-keys`/`crm-ai-proxy` para que no
  se pierda la dependencia si se retoma más adelante.
