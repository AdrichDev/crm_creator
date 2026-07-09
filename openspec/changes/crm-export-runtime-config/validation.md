# Validación — crm-export-runtime-config

Historia: como **operador de la plataforma** que exporta la app de un tenant, quiero que el ZIP
entregado salga ya cableado a la config runtime de plataforma, al proxy de IA medido y al kill
switch (423), para no tener que re-exportar y re-entregar manualmente cada app existente cuando
`crm-tenant-api-keys`/`crm-ai-proxy` entren en producción.

## Criterios de aceptación (AC)
- **AC1 (variables runtime en `.env.local`):** el `.env.local` de cada ZIP (web/apk/exe/ipa)
  contiene `PLATFORM_API_URL`, `TENANT_ID`, `TENANT_API_KEY` con los valores reales resueltos
  para ese tenant, aportadas vía la extensión `buildEnvContent` de `crm-export-clean-manifest`
  (escritor único de `.env.local`); ningún builder escribe/appendea el archivo directamente.
- **AC2 (`.env.example` limpio):** el `.env.example` del ZIP (emitido en exclusiva por
  `crm-export-clean-manifest`; este change solo declara las líneas) contiene las 3 claves vacías
  (`PLATFORM_API_URL=`, `TENANT_ID=`, `TENANT_API_KEY=`), nunca valores reales del tenant en
  curso ni de ningún otro.
- **AC3 (consistencia entre formatos):** los 4 formatos reciben el mismo cableado runtime (mismas
  3 variables, mismos valores para un mismo tenant/job de exportación).
- **AC4 (no rompe lo existente):** `config.api.url` (modelo SaaS-puro histórico) sigue
  funcionando igual que hoy si el tenant lo tiene configurado; `NEXT_PUBLIC_TENANT_JSON` sigue
  presente sin cambios.
- **AC5 (bloqueo explícito, no simulado):** cualquier verificación de comportamiento runtime real
  (llamada efectiva a `/tenant-config`/`/ai-proxy`, reacción a 423) queda marcada como BLOQUEADA
  por dependencia hasta que `crm-tenant-api-keys`/`crm-ai-proxy` existan; no se simula ni se da
  por buena sin esas piezas.

## Por tarea (Given-When-Then + test)
- **WU1** Resolución de `runtimeConfig` en `exports.ts` → Given un `projectId` con
  `tenantId`/`tenantApiKey` resolubles (fixture de `deps.db`/servicio de API keys), When
  `createExportHandler`, Then el `job` arrancado incluye `runtimeConfig` con los 3 valores. Test:
  `exports.test.ts` (ampliar suite existente de `createExportHandler`).
- **WU2** `.env.local` runtime por builder → Given `runtimeConfig` de fixture, When
  `buildWebZip`/`buildApk`/`buildExe`/`buildIpa` (aportando el fixture a la extensión
  `buildEnvContent`, sin escritura directa del builder), Then el `.env.local` del ZIP contiene
  las 3 variables con los valores del fixture. Test: por builder, ampliar suite existente.
- **WU3** Placeholders de `.env.example` sin fuga → Given el mismo fixture, When se ejecuta cada
  builder (emisión del archivo a cargo de `crm-export-clean-manifest`), Then el `.env.example`
  del ZIP contiene las 3 claves vacías declaradas por este change (nunca el valor real del
  fixture). Test: parametrizado por los 4 builders.
- **WU4** Consistencia entre formatos → Given un mismo `runtimeConfig`, When se ejecutan los 4
  builders para el mismo tenant, Then los 4 ZIP resultantes llevan exactamente los mismos 3
  valores. Test: comparación cruzada en un test de integración del job manager.
- **WU5 (BLOQUEADA)** Comportamiento runtime real (kill switch 423, `/tenant-config`,
  `/ai-proxy`) → depende de `crm-tenant-api-keys`/`crm-ai-proxy`; sin test hasta que esas changes
  entreguen el cliente front y los endpoints reales.

> Regla del repo: una tarea está DONE solo cuando su test está verde. Sin spec → no code.
> WU5 queda explícitamente BLOQUEADA por dependencia externa, no se marca DONE por simulación.

## Estado
PROPUESTA — sin iniciar. Depende de `crm-tenant-api-keys` y `crm-ai-proxy` para completarse
end-to-end (ver `proposal.md` §Dependencias); WU1 y WU4 son ejecutables sobre el propio
exportador, WU2/WU3 requieren además el punto de extensión `buildEnvContent` y la emisión de
`.env.example` de `crm-export-clean-manifest`.
