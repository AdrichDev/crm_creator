# Tasks: crm-generator-versiones-historico

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~900 (schema+migración 35, storage helper 50, job-manager 25, exports.ts+ExportsDb 180, back tests 180, front export-flow capture 70, exports-history client 35, dashboard-tabs 20, generados-tab 110, historico-tab 60, page.tsx 30, front tests 120) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | WU1 Schema → WU2 Storage → WU3 Backend integration → WU4 Front version-capture → WU5 Tab plumbing → WU6 Generados → WU7 Histórico → WU8 Contador |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes — la migración de `ExportVersion` toca la BD de
producción real (Supabase); requiere aprobación humana explícita antes de aplicarse
(no `db push` silencioso), y el usuario debe confirmar el orden de WUs (¿stacked a
main o feature-branch-chain?).

Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| WU1 | Modelo `ExportVersion` + migración aditiva | PR 1 | Migración BLOQUEADA hasta aprobación humana |
| WU2 | Storage helper (`storage-exports.ts`) | PR 2 | Depende de WU1 solo por el tipo; paralelizable |
| WU3 | Integración backend: `onComplete`, validación semver, auto-1.0.0, endpoints | PR 3 | Depende de WU1+WU2 |
| WU4 | Front: captura de versión/comentario en el flujo de export | PR 4 | Depende de WU3 (contrato del body) |
| WU5 | Front: tipo `Tab` + orden de pestañas + cliente API | PR 5 | Depende de WU3 |
| WU6 | Front: tabla Generados | PR 6 | Depende de WU5 |
| WU7 | Front: Histórico (selector + `LifecycleControl` embebido) | PR 7 | Depende de WU5, independiente de WU6 |
| WU8 | Front: contador del header | PR 8 | Depende de WU5/WU6 |

---

## Phase 1: Modelo y migración (WU1)

- [x] 1.1 `back/prisma/schema.prisma:174-231`: añadir modelo `ExportVersion` (`id`,
  `businessId @map("negocio_id")`, `version @map("version")`,
  `changeNote? @map("comentario")`, `format @map("formato")` (siempre `"source"`,
  zip de `ctx.frontDir` — independiente del/los formato(s) de build pedidos),
  `storagePath @map("ruta_storage")`, `createdAt @map("creado_en")`,
  `@@index([businessId])`, `@@map("version_export")`); relación inversa
  `exportVersions ExportVersion[]` en `Business`. Migración aditiva, sin tocar
  `Business.generadoEn`/`Project.generatedAt`.
- [x] 1.2 Aplicar migración en
  Supabase (producción real): `CREATE TABLE crm.version_export` + FK + índice
  (recipe `crm-prisma-migration-gotcha`: `migrate diff` sin DROP de tablas externas).
- [x] 1.3 `prisma generate` + `prisma migrate resolve --applied` si aplica
  (workaround EPERM en Windows, ver memoria del proyecto).
- [x] 1.4 Verificar `prisma migrate status` sin drift tras aplicar.

## Phase 2: Supabase Storage helper (WU2 — depende Phase 1 solo por tipo)

- [x] 2.1 Aprovisionar bucket privado `export-artifacts` en Supabase Storage (HITL:
  credenciales de servicio ya existen en el back, ver `upload.ts:70-81`).
- [x] 2.2 `back/src/lib/storage-exports.ts` (nuevo): `uploadExportArtifact(businessId,
  versionId, buffer)` → sube a `export-artifacts/{businessId}/{versionId}.zip`
  (patrón `upload.ts:70-81`); `signExportUrl(storagePath)` → `createSignedUrl` con
  TTL corto (~60s).
- [x] 2.3 Test unitario: `uploadExportArtifact` construye la key correcta;
  `signExportUrl` devuelve `{url}` y propaga error si `storagePath` no existe.

## Phase 3: Integración backend (WU3 — depende Phase 1+2)

- [x] 3.1 `back/src/lib/export-job-manager.ts:84`: añadir
  `onComplete?: (job: ExportJob) => Promise<void>` a `StartJobParams`; invocar en
  el `finally` de `runJob` (línea ~298) siempre que `job.status === 'done'`,
  independiente de qué `formats` se pidieron — `ctx.frontDir` (líneas 58/89/239) es
  la fuente compartida ya generada por todos los builders, se archiva SIEMPRE.
- [x] 3.2 `back/src/routes/exports.ts:56` (`ExportsDb`): extender con
  `exportVersion: { count, create, findMany }` y `business: { findFirst }` (para
  `lifecycle` en el listado).
- [x] 3.3 `back/src/routes/exports.ts:185` (`createExportHandler`): tras verificar
  membership, `count = await db.exportVersion.count({ where: { businessId:
  projectId } })`. Si `count === 0` → versión resuelta `"1.0.0"`, `changeNote:
  null`, body de `version`/`changeNote` ignorado (decisión usuario: primer export
  sin fricción). Si `count >= 1` → `version` del body es obligatoria y validada
  con `/^\d+\.\d+\.\d+$/`; comparar en orden semver (no lexical) contra la última
  versión de ese `businessId`; si no es estrictamente mayor o el formato es
  inválido → `400` de rechazo duro, no se crea el job.
- [x] 3.4 `back/src/routes/exports.ts`: construir el closure `onComplete` (captura
  `businessId`, `version` resuelta, `changeNote`) y pasarlo a `startJob`; dentro:
  comprimir `ctx.frontDir` (zip de la fuente, no un `perFormat[...]` específico) y
  subirlo vía `uploadExportArtifact`, solo si sube OK escribir
  `exportVersion.create({..., format: 'source'})`. Fallo de Storage se loguea sin
  secretos y NO revierte el job `done` (el/los artefacto(s) pedidos siguen
  descargables por `downloadHandler` existente).
- [x] 3.5 `back/src/routes/exports.ts`: nuevo `GET /versions` (ruta literal, junto
  a `/active` línea 407, antes de `/:id/status`) — devuelve `{versions:
  [{id,businessId,businessName,version,changeNote,createdAt,lifecycle,
  hasStateEvents}], distinctCount}`, scoping por membership de `req.userId`.
  Nota: `lifecycle` de `Business` nace `ACTIVE` por defecto incluso sin
  desplegar nunca — usar `hasStateEvents` (¿existe ≥1 `TenantStateEvent` para
  ese `businessId`?) para distinguir "sin desplegar" de "ACTIVE real" en el
  front (gap no resuelto explícitamente en el design; ver Requirement "Service
  Status via Lifecycle" del spec `dashboard-generados`).
- [x] 3.6 `back/src/routes/exports.ts`: nuevo `GET /versions/:id/download` — 404 si
  la versión no existe o no pertenece a un negocio del `req.userId`; si existe,
  `signExportUrl(storagePath)` → `200 {url}`.
- [x] 3.7 `router` (`makeExportsRouter`): registrar `/versions` y
  `/versions/:id/download` respetando el orden (literales antes de `/:id/...`).
- [x] 3.8 Tests back (`node:test`): auto-`1.0.0` con `count=0` sin prompt; `400` en
  semver inválido/duplicada/menor desde el 2º export (spec `export-versioning`
  escenarios "Duplicate or lower version is rejected"); `onComplete` sube y
  crea fila en orden generar→subir→registrar; fallo de Storage no crea fila ni
  revierte `done`; `GET /versions/:id/download` devuelve `{url}` firmada o
  `404`; listado scoping por membership; contador `distinctCount` no
  incrementa en re-export (spec escenarios "Re-export does not increment").

## Phase 4: Front — captura de versión en el flujo de export (WU4 — depende Phase 3)

- [x] 4.1 `front/lib/export/types.ts:30` (`StartExportParams`): añadir `version?:
  string; changeNote?: string`.
- [x] 4.2 `front/components/dashboard/export-table.tsx:96` (`handleExportRow`):
  antes de invocar `onExport`, si el negocio ya tiene ≥1 versión previa (dato
  disponible vía `exports-history` client, Phase 5), pedir `version`+`changeNote`
  mediante diálogo (patrón `useDialog()` ya usado en `handleDelete`); si es el
  primer export, no preguntar.
- [x] 4.3 Test front: diálogo aparece solo cuando hay versión previa; body enviado
  incluye `version`/`changeNote` cuando corresponde.

## Phase 5: Front — plumbing de pestañas y cliente API (WU5 — depende Phase 3)

- [x] 5.1 `front/lib/api/exports-history.ts` (nuevo): `fetchExportVersions()` →
  `{versions, distinctCount}`; `downloadExportVersion(id)` → abre la `url`
  firmada devuelta por `GET /versions/:id/download`.
- [x] 5.2 `front/components/dashboard/dashboard-tabs.tsx:15`: `type Tab =
  'dashboard' | 'generados' | 'historico' | 'exportar'`.
- [x] 5.3 `dashboard-tabs.tsx:83` (array de tabs) y `:113` (labels): insertar
  `'generados'`→"Generados" y `'historico'`→"Histórico" entre `'dashboard'` y
  `'exportar'`; sin tocar el render existente de Proyecto/Exportar.
- [x] 5.4 Test front: orden de tabs Proyecto→Generados→Histórico→Exportar; tabs
  existentes siguen renderizando igual (regresión).

## Phase 6: Front — tabla Generados (WU6 — depende Phase 5)

- [x] 6.1 `front/components/dashboard/generados-tab.tsx` (nuevo): tabla con
  columnas cliente (`businessName`), fecha/hora (`createdAt`), versión,
  descargar (llama `downloadExportVersion(id)`, sin regenerar), estado de
  servicio (`lifecycle`, o "sin desplegar" si `!hasStateEvents`).
- [x] 6.2 Montar `GenerandosTab` en `dashboard-tabs.tsx` bajo el tab `'generados'`.
- [x] 6.3 Test front (RTL): 3 filas para un negocio con 3 `ExportVersion`; fila sin
  `hasStateEvents` muestra "sin desplegar"; fila `SUSPENDED` muestra `SUSPENDED`;
  click en descargar no dispara un job nuevo (spec `dashboard-generados`
  escenario "Download old version returns original source").

## Phase 7: Front — Histórico (WU7 — depende Phase 5, independiente de Phase 6)

- [x] 7.1 `front/components/dashboard/historico-tab.tsx` (nuevo): selector de
  proyecto reusando `projects` ya disponible en `DashboardTabs` (`Project.id ===
  Business.id`, confirmado en `exports.ts:233`); debajo, montar
  `<LifecycleControl businessId={selected} />` (import directo desde
  `front/app/(operador)/negocios/[id]/lifecycle-control.tsx:54`). El componente
  ya renderiza internamente la tabla de `TenantStateEvent`
  (`lifecycle-control.tsx:216-236`, vía `fetchBusinessStateEvents`,
  `operator.ts:84`) — **no construir una tabla de eventos nueva**, solo el
  selector.
- [x] 7.2 Sin lógica de gate/hide/disable por rol alrededor de `LifecycleControl`
  (decisión de usuario cerrada): se renderiza igual para cualquier sesión; la
  autorización real la aplican los proxies `/api/operator/**` server-side
  (`isAuthedOperator`), sin cambios.
- [x] 7.3 Montar `HistoricoTab` en `dashboard-tabs.tsx` bajo el tab `'historico'`.
- [x] 7.4 Test front (RTL): seleccionar negocio B monta `LifecycleControl` con su
  `businessId`; negocio sin eventos no rompe el render (estado vacío ya cubierto
  por el componente reusado).

## Phase 8: Front — contador del header (WU8 — depende Phase 5/6)

- [x] 8.1 `front/app/dashboard/page.tsx:75`: reemplazar
  `projects.filter((p) => p.generatedAt).length` por `distinctCount` obtenido de
  `fetchExportVersions()` en el mount (junto al fetch existente de `projects`).
- [x] 8.2 Test front: contador muestra `distinctCount` del backend, no el conteo
  local de `generatedAt`; 4 negocios con export, uno reexportado 2 veces → 4, no
  5 (spec `dashboard-generados` escenario "Counter matches distinct businesses").

## Phase 9: Cierre y verificación

- [x] 9.1 `prisma migrate status` sin drift (confirmación final post-merge de WU1).
- [x] 9.2 `npx tsc --noEmit` en `front/` y `back/` — 0 errores.
- [x] 9.3 Suite completa `back/` (`node:test`) — 0 regresiones, todos los tests de
  Phase 3 en verde.
- [x] 9.4 Suite completa `front/` (vitest) — 0 regresiones, todos los tests de
  Phases 4/5/6/7/8 en verde.
- [x] 9.5 Confirmar deuda documentada, no implementada en este change: sin
  TTL/retención en `export-artifacts` (decisión usuario), sin versionado por
  formato binario individual (APK/EXE/IPA), campos muertos
  `Business.generadoEn`/`Project.generatedAt` intactos.
- [x] 9.6 Aprobación humana explícita antes de mergear (toca DB de producción vía
  migración aditiva + bucket Storage nuevo).
