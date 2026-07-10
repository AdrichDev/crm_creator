# Design: crm-generator-versiones-historico

## Technical Approach

Dar memoria persistente al generador OperaOS con tres piezas:
(1) un modelo Prisma aditivo `ExportVersion` ligado a `Business.id`;
(2) persistencia del artefacto fuente en un bucket privado de Supabase Storage al
**completar** el job de export (hoy efímero, `export-job-manager.ts:150-166`), vía un
callback inyectado desde la route — sin acoplar Prisma/Storage al job manager;
(3) dos tabs nuevas en el dashboard (`Generados`, `Histórico`) que consumen endpoints
nuevos y reutilizan por import directo `LifecycleControl` + los proxies de operador
existentes. El contador del header pasa de `Project.generatedAt` (localStorage muerto,
`page.tsx:75`) a `COUNT(DISTINCT businessId)` derivado del backend.

## Architecture Decisions

### Decisión: Persistir la versión vía callback `onComplete`, no acoplando el job manager
**Choice**: Añadir `onComplete?: (job) => Promise<void>` a `StartJobParams`; el route
(`exports.ts`) construye el closure (captura `businessId`, `version`, `changeNote`) y lo
pasa. `runJob` lo invoca en el `finally` solo si `job.status === 'done'`.
**Alternatives**: importar `prisma` + Storage dentro de `export-job-manager.ts`.
**Rationale**: el manager es deliberadamente in-memory y sin Prisma
(`export-job-manager.ts:1-12`); el repo ya usa DI en todo el módulo (`ExportsDeps`,
`JobDeps`). El callback preserva esa pureza y hace testeable el flujo con fakes.

### Decisión: la versión SIEMPRE se archiva desde `ctx.frontDir`, sin depender de `formats`
**Choice**: `onComplete` no exige que el operador haya pedido `web-zip` entre los
`formats`. `ctx.frontDir` (`export-job-manager.ts:58,89,239`) es el directorio fuente
compartido, generado SIEMPRE antes de invocar cualquier builder — apk/exe/ipa/web-zip
son independientes entre sí (ninguno llama a `buildWebZip`, confirmado por grep). El
callback comprime `ctx.frontDir` directamente como artefacto de versión, sin build
adicional y sin saltear la fila `ExportVersion` cuando el formato pedido es solo
apk/exe/ipa.
**Alternatives descartadas**: (a) saltear versión si `web-zip` no está en `formats` —
contradice el pedido del usuario ("cada vez que se exporte... tendrá una versión",
confirmado: "Tiene que crear una version nueva cuando se exporte porque siempre se va a
seleccionar un tipo de formato"); (b) forzar build de `web-zip` aunque no se pida — coste
de build redundante innecesario, la fuente ya existe en `frontDir`.

### Decisión: Orden generar → subir → registrar; fallo de Storage no pierde el export
**Choice**: comprimir `ctx.frontDir` y subir a Storage; solo si sube OK, escribir la fila
`ExportVersion`. Un fallo de Storage se loguea (sin secretos) y NO revierte el job done.
**Rationale**: el/los artefacto(s) pedido(s) siguen descargables inmediato vía
`downloadHandler` (`exports.ts:357`); la versión histórica es best-effort added-value, no
debe romper la descarga inmediata.

### Decisión: `version`/`changeNote` capturados en POST, escritos al completar
**Choice**: `POST /api/exports` acepta `version?`+`changeNote?`. Si
`exportVersion.count({ where: { businessId } }) === 0` → auto `1.0.0`, body ignorado. Si
≥1 → `version` obligatoria y semver básico (`/^\d+\.\d+\.\d+$/`), 400 si falta/ inválida.
**Rationale**: primer export sin fricción (decisión de usuario #3); re-export exige semver
manual (proposal criterio de éxito).

### Decisión: `LifecycleControl` embebido por import directo, sin refactor
**Choice**: importar `LifecycleControl({ businessId })` tal cual en la tab Histórico.
**Rationale**: ya recibe `businessId` como prop y ya renderiza internamente la tabla de
`TenantStateEvent` (`lifecycle-control.tsx:54,216-236`). No asume routing `[id]`; es
embebible sin extracción. Cero duplicación de lógica de lifecycle.

### Decisión: Gate de rol operador — sin gate visual en front (decisión usuario #1)
**Choice**: la sub-vista Histórico se muestra siempre; la protección real es server-side
vía los proxies `/api/operator/**` (`isAuthedOperator`, `require-operator.ts:25`), que se
consumen sin tocar ni duplicar. Único usuario del dashboard ya es operator.
**Rationale**: el `PUT lifecycle` falla server-side sin rol; no hace falta lógica de UI.

## Data Flow

```
POST /api/exports {projectId,formats,version?,changeNote?}
  → count ExportVersion(businessId) → resolve version (1.0.0 | body)
  → startJob(..., onComplete=closure)
  → runJob (build formats pedidos, ctx.frontDir SIEMPRE en disco) ──done──▶ onComplete:
        zip(ctx.frontDir) → buf                                [siempre, sin depender de formats]
        supabaseAdmin.storage.from('export-artifacts')
          .upload(`${businessId}/${versionId}.zip`, buf)      [privado]
        prisma.exportVersion.create({businessId,version,changeNote,storagePath,format:'source'})

Front dashboard mount → GET /api/exports/versions
  → {versions:[{id,businessId,businessName,version,changeNote,createdAt,lifecycle}], distinctCount}
  → header counter = distinctCount ; Generados tab = versions ; Histórico select = distinct businesses

Descargar (Generados) → GET /api/exports/versions/:id/download
  → storage.createSignedUrl(storagePath, 60s) → {url} → front abre url
```

## Data Model (`back/prisma/schema.prisma`, aditivo, sin DROP)

```prisma
model ExportVersion {
  id          String   @id @default(cuid())
  businessId  String   @map("negocio_id")
  version     String   @map("version")
  changeNote  String?  @map("comentario")
  format      String   @map("formato")        // artefacto guardado: siempre "source" (zip de ctx.frontDir)
  storagePath String   @map("ruta_storage")   // key en bucket export-artifacts
  createdAt   DateTime @default(now()) @map("creado_en")
  business    Business @relation(fields: [businessId], references: [id])
  @@index([businessId])
  @@map("version_export")
}
```
Convención confirmada: modelo inglés, columnas español snake_case vía `@map`
(`schema.prisma:174-231`). Añadir back-relation `exportVersions ExportVersion[]` a `Business`.

## File Changes

| File | Change | Why |
|---|---|---|
| `back/prisma/schema.prisma:231` | Modify | Añadir `ExportVersion` + relación en `Business`; nueva migración aditiva |
| `back/src/lib/storage-exports.ts` | New | `uploadExportArtifact()` + `signExportUrl()` sobre `supabaseAdmin.storage` (patrón `upload.ts:70-81`, pero `createSignedUrl`) |
| `back/src/lib/export-job-manager.ts:84,228-307` | Modify | `onComplete?` en `StartJobParams`; invocar en `finally` si `done` |
| `back/src/routes/exports.ts:185,403` | Modify | count→version en `createExportHandler`; `onComplete` closure; nuevos `GET /versions`, `GET /versions/:id/download` scoping por membership |
| `front/lib/api/exports-history.ts` | New | client `fetchExportVersions()`, `downloadExportVersion(id)` |
| `front/components/dashboard/generados-tab.tsx` | New | tabla cliente/fecha/versión/descargar/estado |
| `front/components/dashboard/historico-tab.tsx` | New | select negocio + `<LifecycleControl businessId>` |
| `front/components/dashboard/dashboard-tabs.tsx:15,83,113` | Modify | `Tab='dashboard'\|'generados'\|'historico'\|'exportar'`; orden Proyecto→Generados→Histórico→Exportar |
| `front/app/dashboard/page.tsx:75,90` | Modify | contador ← `distinctCount`; fetch versions y pasar a tabs |

## Interfaces / Contracts

- `GET /api/exports/versions` → `{ versions: ExportVersionView[]; distinctCount: number }`
  (scoping: solo businesses con membership de `req.userId`).
- `GET /api/exports/versions/:id/download` → `200 { url }` (signed, TTL 60s) | `404`.
- `POST /api/exports` extiende body con `version?: string`, `changeNote?: string`.

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit (back node:test) | auto-1.0.0 (count=0) vs 400 semver inválido en re-export | inyectar `db.exportVersion.count` + `jobs` fake en `createExportHandler` |
| Unit (back) | `onComplete` sube a Storage y crea fila; fallo Storage no revierte done | fake storage + prisma; assert orden generar→subir→registrar |
| Unit (back) | signed URL download devuelve `{url}`; 404 si versión inexistente | fake `createSignedUrl` |
| Unit (back) | listing scoping por membership | fake db membership |
| Component (front vitest) | render Generados (columnas) y Histórico (select + LifecycleControl monta) | RTL con mock del client |
| Component (front) | header counter = `distinctCount` | mock fetch |
| Manual gate | `prisma migrate status` sin drift | HITL migración |

## Límites / Deuda conocida

- **Retención Storage (decisión usuario #2)**: sin TTL/expiry en este change; los
  artefactos se acumulan indefinidamente en `export-artifacts`. Deuda documentada,
  paralela al minteo acumulativo de `TenantApiKey` (`exports.ts:85-93`). Resolver política
  de rotación/expiry en change futuro.
- Campos muertos `Business.generadoEn` / `Project.generatedAt` se dejan estar (no DROP).
- `format` guarda siempre `"source"` (zip de `ctx.frontDir`, independiente de qué
  binario(s) pidió el operador); multi-formato no versiona APK/EXE/IPA individualmente
  en este change — el histórico es sobre el código fuente, no sobre cada binario.

## Migration / Rollout

Migración aditiva (`version_export` + índice). Rollback: DROP tabla + objetos del bucket;
front revierte 2 tabs y el binding del contador. Nada existente se toca irreversiblemente.

## Open Questions

- Ninguna bloqueante. Las 3 decisiones abiertas del proposal (gate de rol, retención,
  primer export) quedan cerradas por las decisiones de usuario #1/#2/#3.
