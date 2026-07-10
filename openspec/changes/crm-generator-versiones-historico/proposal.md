# crm-generator-versiones-historico

## Intención
Dar al generador (consola **OperaOS**, `front/app/dashboard`) memoria persistente de lo que
produce. Hoy cada export es un job efímero en memoria (`export-job-manager.ts:153-155`, sin
tabla Prisma) y el contador de "generados" del header cuelga de un campo muerto
(`Project.generatedAt`, 100% localStorage, `markGenerated()` nunca se invoca), así que el
operador no puede: (a) ver qué proyectos ha generado, (b) recuperar el código fuente de una
versión concreta para re-buildear, (c) versionar re-exports, ni (d) ver/gestionar el estado
de servicio de cada proyecto sin salir a la página operador aparte
(`operaos-black.vercel.app/negocios/[id]`). Este change convierte el generador en un panel
con historial real: **Generados** (inventario versionado descargable) e **Histórico**
(estado de servicio embebido + auditoría de lifecycle), y arregla el contador para que cuente
proyectos distintos, no re-exports.

## Alcance

### 1. Pestaña "Generados" (entre "Proyecto" y "Exportar")
Nueva `Tab` en `dashboard-tabs.tsx` (tipo línea 15, array 83-116, labels 113). Tabla con:
- **Cliente** (nombre del `Business`).
- **Fecha y hora** de la versión.
- **Versión**: semver manual. Al re-exportar un proyecto ya exportado, el operador escribe el
  número (ej. `1.1.0`) y un comentario de cambios (tipo mensaje de commit). Cada export = una
  fila de versión, agrupada por `Business.id` (identidad estable desde el alta, no desde el
  export).
- **Descargar**: re-baja el código fuente de esa versión concreta desde Supabase Storage
  (bucket privado, URL firmada temporal por descarga; no ZIP público, no regeneración bajo
  demanda).
- **Estado de servicio**: reusa `Business.lifecycle` (`ACTIVE`/`GRACE`/`SUSPENDED`/
  `TERMINATED` del change `crm-tenant-lifecycle-gate`). Proyecto nunca desplegado → "sin
  desplegar".

### 2. Pestaña "Histórico" (entre "Generados" y "Exportar")
Nueva `Tab`. Select de proyecto → debajo, el panel operador de lifecycle **embebido en la
UX del dashboard** (no página aparte), reutilizando por import directo
`front/app/(operador)/negocios/[id]/lifecycle-control.tsx` y las funciones
`setBusinessLifecycle`/`fetchBusinessStateEvents` (`front/lib/api/operator.ts:76,84`) vía los
proxies existentes que inyectan `x-service-token` server-side. Debajo, tabla de histórico
(estado, fecha/hora, motivo) consumiendo `TenantStateEvent` (ya existe; no se crea modelo).

### 3. Contador de "generados" del header
`front/app/dashboard/page.tsx:75` deja de contar filas localStorage y pasa a un `COUNT` de
**negocios distintos con ≥1 versión de export** (backend). Re-exportar no incrementa; solo el
primer export de un proyecto nuevo suma.

## Capabilities

### New Capabilities
- `export-versioning`: modelo Prisma nuevo (p. ej. `ExportVersion`: `businessId`, `version`
  semver, `comment`, `format`, `storageKey`, `createdAt`) + subida del artefacto a Supabase
  Storage al completar el job de export + endpoint de descarga con URL firmada + persistencia
  del job hoy efímero. Contador de proyectos distintos como query derivada.
- `dashboard-generados`: pestaña Generados (tabla cliente/fecha/versión/descarga/estado) y
  binding del contador del header a la fuente real.
- `dashboard-historico`: pestaña Histórico (select de proyecto + control de lifecycle
  embebido + tabla de `TenantStateEvent`).

### Modified Capabilities
- None. `crm-tenant-lifecycle-gate` se **reutiliza** sin cambiar sus requisitos (se consumen
  `lifecycle`, `TenantStateEvent`, endpoints y `lifecycle-control.tsx` tal cual).

## Approach
- **Persistir el export**: el job (`export-job-manager.ts`) al terminar sube el ZIP fuente a
  Supabase Storage y escribe una fila `ExportVersion` ligada a `Business.id`. La captura de
  `version`+`comment` se pide en el flujo de export solo cuando ya existe ≥1 versión previa
  del mismo `Business` (primer export puede default `1.0.0`).
- **Reutilización, no duplicación**: Generados e Histórico son route-group siblings del mismo
  árbol Next.js (`saas-negocios`, mismo dominio); importan el control operador y las funciones
  API existentes. Cero lógica de lifecycle replicada, cero cruce de dominios.
- **Aditivo puro**: migración nueva sin DROP; los campos muertos (`Business.generadoEn`,
  `Project.generatedAt`) se dejan estar o se deprecan, no se borran en este change.

## Affected Areas
| Área | Impacto | Descripción |
|---|---|---|
| `back/prisma/schema.prisma` | New | Modelo `ExportVersion` (migración aditiva). |
| `back/src/lib/export-job-manager.ts` | Modified | Al completar: subir a Storage + escribir versión. |
| `back/src/routes/exports.ts` | Modified | Aceptar `version`/`comment`; endpoints listar/descargar. |
| `back` Storage util | New | Cliente Supabase Storage (upload + signed URL). |
| `front/components/dashboard/dashboard-tabs.tsx` | Modified | 2 tabs nuevas intercaladas (no reescribir Proyecto/Exportar). |
| `front/app/dashboard/page.tsx` | Modified | Contador del header a fuente real. |
| `front/lib/api/operator.ts` proxies | Reused | Consumidos desde Histórico; sin cambios. |

## Riesgos
| Riesgo | Prob. | Mitigación |
|---|---|---|
| **Gate de rol operador dentro del dashboard**: Histórico embebe el switch de lifecycle, que requiere `app_metadata.role === 'operator'`. ¿Todo usuario del generador debe verlo/operarlo, o hay que gatear la sub-vista por rol operador? **Sin decidir por el usuario → pregunta abierta.** | Alta | Los proxies ya validan operador server-side (el `PUT` fallará sin rol), pero la UI podría mostrar un control inoperable a no-operadores. Decidir si ocultar/deshabilitar la sub-vista o dejarla visible read-only. Bloqueante de diseño. |
| Migrar el contador de campo muerto a fuente real sin romper lo existente | Media | El contador hoy está inerte (siempre 0/impreciso); el cambio solo puede mejorar. No se borran los campos muertos; se cambia el binding. |
| Storage: URLs firmadas con TTL, artefactos acumulándose sin política de retención/rotación | Media | Definir TTL de firma corto y dejar retención como deuda documentada (paralelo al minteo acumulativo de `TenantApiKey`). |
| Colisión/validación de semver manual (versión repetida o menor) | Baja | Validar unicidad por `Business.id` en el endpoint; el usuario asume semver manual. |
| Job efímero → persistente puede cambiar el timing del flujo de export | Media | Escribir la fila solo al completar OK; fallo de Storage no debe perder el export (orden: generar → subir → registrar). |

## Rollback
Migración aditiva (`ExportVersion` + índice por `businessId`): revertible con DROP de la tabla
y del bucket/objetos. Front: quitar las 2 tabs y revertir el binding del contador al valor
previo. Nada de lo existente (Proyecto/Exportar/lifecycle-gate) se toca de forma irreversible.

## Dependencias
- `crm-tenant-lifecycle-gate` (ya mergeado): aporta `Business.lifecycle`, `TenantStateEvent`,
  endpoints y `lifecycle-control.tsx`. Este change los **consume**.
- **Supabase Storage** (infra nueva): bucket privado + credenciales de servicio en el back +
  firma de URLs. Pieza de infraestructura a aprovisionar (HITL: secretos).
- `crm-tenant-api-keys` / minteo de `TenantApiKey` por export (contexto del flujo actual).

## Criterios de éxito
- [ ] La pestaña Generados lista cada proyecto con cliente, fecha/hora, versión, descarga y
  estado de servicio; descargar recupera el fuente exacto de esa versión desde Storage vía URL
  firmada.
- [ ] Re-exportar un proyecto crea una versión nueva (semver+comentario) agrupada bajo el mismo
  `Business.id`, sin duplicar el proyecto.
- [ ] La pestaña Histórico permite elegir proyecto, muestra el control de lifecycle embebido en
  la UX del dashboard y la tabla de `TenantStateEvent` (estado/fecha/motivo).
- [ ] El contador del header cuenta **proyectos distintos con ≥1 export**, no re-exports.
- [ ] Las tabs Proyecto y Exportar quedan intactas; solo se intercalan las 2 nuevas.
- [ ] Migración aditiva sin DROP; `prisma migrate status` sin drift; back+front tests verde.
- [ ] Resuelta (por el usuario) la decisión del gate de rol operador para la sub-vista de
  Histórico.
