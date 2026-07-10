# Validación — crm-generator-versiones-historico

Historia: como **operador del generador OperaOS** quiero que cada export quede
registrado como una versión persistente ligada al negocio (con fuente descargable,
semver y estado de servicio embebido), y que el contador de "generados" del header
refleje proyectos distintos y no re-exports, para no depender de un job efímero en
memoria ni de un campo muerto en `localStorage`.

## Criterios de aceptación (AC)

- **AC1 (persistencia del export):** todo export completado, independiente del/los
  `formats` pedidos (web-zip/apk/exe/ipa), crea exactamente una fila `ExportVersion`
  ligada a `Business.id` a partir de `ctx.frontDir` (fuente compartida por todos los
  builders), solo tras subir el artefacto a Supabase Storage con éxito (orden generar →
  subir → registrar); si la subida falla, no se crea fila, pero el job de export en sí
  NO se marca fallido (el/los artefacto(s) pedidos siguen descargables).
- **AC2 (versionado):** el primer export de un negocio recibe `1.0.0` automático sin
  preguntar; desde el segundo export, el operador debe introducir `version` (semver) +
  `changeNote` opcional, y una versión no estrictamente mayor que la última existente
  se rechaza con `400` sin crear fila.
- **AC3 (contador):** el contador del header cuenta `COUNT(DISTINCT businessId)` con
  ≥1 `ExportVersion`, no filas crudas; re-exportar un negocio ya contado no lo
  incrementa.
- **AC4 (descarga):** descargar una versión concreta devuelve una URL firmada temporal
  de Supabase Storage sobre el artefacto exacto de esa versión, sin regenerar ni
  disparar un job nuevo.
- **AC5 (pestaña Generados):** lista cada versión con cliente, fecha/hora, versión,
  acción de descarga y estado de servicio (`lifecycle`, o "sin desplegar" si el
  negocio nunca pasó el gate de lifecycle).
- **AC6 (pestaña Histórico):** permite elegir proyecto y muestra debajo el control de
  lifecycle embebido (`LifecycleControl`, sin gate visual por rol — decisión de
  usuario cerrada) más la tabla de `TenantStateEvent` (estado/fecha/motivo), sin
  introducir un modelo nuevo.
- **AC7 (no regresión):** las tabs Proyecto y Exportar quedan intactas; migración
  aditiva sin DROP (`Business.generadoEn`/`Project.generatedAt` no se tocan);
  `prisma migrate status` sin drift; back+front tests verdes.

---

## Fase 1 — Modelo y migración (WU1)

### Scenario (Given-When-Then)
- **Given** el schema actual con `Business.generadoEn` y `Project.generatedAt` muertos
- **When** se aplica la migración aditiva de `ExportVersion` (`version_export`)
- **Then** ambos campos muertos siguen existiendo sin cambios
- **AND** `prisma migrate status` no reporta drift

### Tests (1 por tarea)
| Tarea | Test |
|---|---|
| 1.1 modelo `ExportVersion` + relación inversa | `prisma validate` limpio; diff de migración generado no contiene `DROP TABLE`/`DROP COLUMN` (revisión del archivo de migración) |
| 1.2 aplicar migración en Supabase (producción) | ⚠️ gate humano — no automatizable; verificación manual post-aplicación: tabla `crm.version_export` + FK + índice existen |
| 1.3 `prisma generate` + `migrate resolve --applied` | `prisma generate` finaliza sin error (workaround EPERM Windows aplicado si hace falta) |
| 1.4 verificar `prisma migrate status` sin drift | `npx prisma migrate status` → "Database schema is up to date" |

## Fase 2 — Supabase Storage helper (WU2)

### Scenario (Given-When-Then)
- **Given** un buffer de artefacto y un `businessId`/`versionId`
- **When** se invoca `uploadExportArtifact`
- **Then** el objeto se sube a `export-artifacts/{businessId}/{versionId}.zip`
- **AND** `signExportUrl(storagePath)` devuelve `{url}` firmada o propaga error si el
  `storagePath` no existe

### Tests
| Tarea | Test |
|---|---|
| 2.1 aprovisionar bucket privado `export-artifacts` | gate humano (HITL) — verificación manual: bucket existe y es privado (no público) |
| 2.2 `storage-exports.ts` (upload + signed URL) | cubierto por 2.3 |
| 2.3 test unitario | `storage-exports.test.ts`: `uploadExportArtifact` construye la key `export-artifacts/{businessId}/{versionId}.zip`; `signExportUrl` devuelve `{url}` y propaga error si `storagePath` no existe |

## Fase 3 — Integración backend (WU3)

### Scenario (Given-When-Then)
- **Given** un negocio con 0 filas `ExportVersion`
- **When** el operador completa un export (cualquier `formats`, p.ej. solo `apk`)
- **Then** se crea la fila con `version="1.0.0"`, `changeNote=null`, sin prompt previo

### Scenario adicional — spec "Duplicate or lower version is rejected"
- **Given** un negocio cuya última versión es `1.1.0`
- **When** el operador envía `1.0.0` o `1.1.0` como nueva versión
- **Then** el export se rechaza con `400` y no se crea job ni fila

### Tests
| Tarea | Test |
|---|---|
| 3.1 `onComplete` en `StartJobParams` / `runJob` | cubierto en 3.8 (invocación siempre que `status==='done'`, independiente de `formats`) |
| 3.2 `ExportsDb` extendido (`exportVersion`, `business.findFirst`) | cubierto en 3.8 (fakes de `count`/`create`/`findMany`) |
| 3.3 auto-`1.0.0` / validación semver en `createExportHandler` | `exports.test.ts`: `count=0` → `1.0.0` sin body; `count>=1` sin `version` válida (`/^\d+\.\d+\.\d+$/`) o no estrictamente mayor (orden semver) → `400`, sin job creado |
| 3.4 closure `onComplete` (subir → registrar) | `exports.test.ts`: orden generar→subir→registrar; fallo de Storage no crea fila `ExportVersion` ni revierte `status:'done'` del job |
| 3.5 `GET /versions` | `exports.test.ts`: devuelve `{versions:[...], distinctCount}` scoping por membership de `req.userId`; `distinctCount` no incrementa en re-export (spec "Re-export does not increment") |
| 3.6 `GET /versions/:id/download` | `exports.test.ts`: `200 {url}` firmada si la versión pertenece a un negocio del usuario; `404` si no existe o no pertenece |
| 3.7 registro de rutas (orden literales antes de `/:id/...`) | `exports-routes.test.ts`: `/versions` y `/versions/:id/download` resuelven antes que `/:id/status` |
| 3.8 suite completa Fase 3 | `node:test` verde: auto-1.0.0, rechazo semver inválido/duplicada/menor, `onComplete` orden correcto, fallo Storage no crea fila, download 200/404, scoping membership, `distinctCount` estable en re-export |

## Fase 4 — Front: captura de versión (WU4)

### Scenario (Given-When-Then)
- **Given** un negocio con ≥1 `ExportVersion` previa
- **When** el operador dispara un nuevo export desde `export-table.tsx`
- **Then** aparece un diálogo pidiendo `version`+`changeNote` antes del `onExport`
- **AND** si es el primer export del negocio, no se pregunta nada

### Tests
| Tarea | Test |
|---|---|
| 4.1 `StartExportParams` con `version?`/`changeNote?` | tipado — cubierto por compilación (`tsc --noEmit`) + 4.3 |
| 4.2 diálogo condicional en `handleExportRow` | cubierto por 4.3 |
| 4.3 test front | vitest: diálogo aparece solo cuando hay versión previa (dato de `exports-history` client); body enviado a `onExport` incluye `version`/`changeNote` cuando corresponde, ausente en el primer export |

## Fase 5 — Front: plumbing de pestañas y cliente API (WU5)

### Scenario (Given-When-Then) — spec "Tab order" (`dashboard-generados` + `dashboard-historico`)
- **Given** la barra de tabs del dashboard
- **When** renderiza
- **Then** el orden es Proyecto → Generados → Histórico → Exportar
- **AND** Proyecto y Exportar se comportan exactamente igual que antes del change

### Tests
| Tarea | Test |
|---|---|
| 5.1 `exports-history.ts` (`fetchExportVersions`, `downloadExportVersion`) | cubierto por 5.4 y por los tests de Fase 6/8 que consumen el client |
| 5.2 `type Tab` extendido (`'generados'`/`'historico'`) | cubierto por compilación + 5.4 |
| 5.3 inserción de tabs en array y labels | cubierto por 5.4 |
| 5.4 test front | vitest (RTL): orden de tabs Proyecto→Generados→Histórico→Exportar; render de las tabs existentes sin regresión |

## Fase 6 — Front: tabla Generados (WU6)

### Scenario (Given-When-Then) — spec "Download old version returns original source"
- **Given** una fila de versión `1.0.0` de un negocio hoy en `1.2.0`
- **When** el operador hace click en descargar sobre la fila `1.0.0`
- **Then** el navegador recibe el artefacto exacto de `1.0.0` vía URL firmada
- **AND** no se dispara ningún job de export nuevo

### Tests
| Tarea | Test |
|---|---|
| 6.1 `generados-tab.tsx` (tabla cliente/fecha/versión/descarga/estado) | cubierto por 6.3 |
| 6.2 montaje en `dashboard-tabs.tsx` bajo `'generados'` | cubierto por 6.3 |
| 6.3 test front (RTL) | 3 filas para un negocio con 3 `ExportVersion`; fila sin `hasStateEvents` muestra "sin desplegar"; fila `SUSPENDED` muestra `SUSPENDED`; click en descargar llama `downloadExportVersion(id)` sin disparar un job nuevo |

## Fase 7 — Front: Histórico (WU7)

### Scenario (Given-When-Then) — spec "Selecting a project loads its data"
- **Given** dos proyectos con historiales de lifecycle distintos
- **When** el operador selecciona el proyecto B en el selector
- **Then** `LifecycleControl` y la tabla de eventos debajo se actualizan para reflejar
  el proyecto B

### Scenario adicional — spec "Non-operator session sees the same control, server rejects the write"
- **Given** una sesión de dashboard sin rol operador
- **When** esa sesión intenta cambiar el switch de lifecycle
- **Then** el switch/selector se renderiza igual que para una sesión operadora
- **AND** el proxy rechaza la escritura server-side, sin ocultamiento a nivel UI

### Tests
| Tarea | Test |
|---|---|
| 7.1 `historico-tab.tsx` (selector + `<LifecycleControl businessId>` embebido) | cubierto por 7.4 |
| 7.2 sin lógica de gate/hide/disable por rol alrededor de `LifecycleControl` | revisión de código (ausencia de condicionales de rol) + 7.4 confirma render idéntico |
| 7.3 montaje en `dashboard-tabs.tsx` bajo `'historico'` | cubierto por 7.4 |
| 7.4 test front (RTL) | seleccionar negocio B monta `LifecycleControl` con su `businessId`; negocio sin `TenantStateEvent` no rompe el render (estado vacío ya cubierto por el componente reusado) |

## Fase 8 — Front: contador del header (WU8)

### Scenario (Given-When-Then) — spec "Counter matches distinct businesses with exports"
- **Given** 4 negocios distintos con ≥1 `ExportVersion` cada uno, uno de ellos
  re-exportado 2 veces
- **When** el header renderiza
- **Then** el contador muestra 4, no 5

### Tests
| Tarea | Test |
|---|---|
| 8.1 `page.tsx` reemplaza `generatedAt` por `distinctCount` de `fetchExportVersions()` | cubierto por 8.2 |
| 8.2 test front | vitest: contador muestra `distinctCount` del backend, no el conteo local de `generatedAt`; 4 negocios con export (uno reexportado 2 veces) → 4, no 5 |

## Fase 9 — Cierre y verificación

### Scenario (Given-When-Then)
- **Given** todas las fases 1-8 completadas y sus tests en verde
- **When** se corre la verificación final de cierre
- **Then** no hay drift de migración, `tsc` limpio en front+back, y las suites
  completas (back `node:test`, front vitest) pasan sin regresiones

### Tests / verificaciones
| Tarea | Test / verificación |
|---|---|
| 9.1 `prisma migrate status` sin drift (post-merge WU1) | comando directo, checklist manual |
| 9.2 `npx tsc --noEmit` en `front/` y `back/` | 0 errores en ambos |
| 9.3 suite completa `back/` (`node:test`) | 0 regresiones; todos los tests de Fase 3 verdes |
| 9.4 suite completa `front/` (vitest) | 0 regresiones; todos los tests de Fases 4/5/6/7/8 verdes |
| 9.5 confirmar deuda documentada sin implementar | checklist: sin TTL/retención en `export-artifacts`, sin versionado por formato binario individual (APK/EXE/IPA), campos muertos `Business.generadoEn`/`Project.generatedAt` intactos |
| 9.6 aprobación humana explícita antes de mergear | gate humano — migración toca BD de producción + bucket Storage nuevo |

---

> Regla del repo: una tarea está DONE solo cuando su test asociado está verde. Una
> fase se considera cerrada solo con todos sus tests verdes; las tareas marcadas
> como gate humano (1.2, 2.1, 9.6) requieren aprobación explícita del usuario, no
> son automatizables.

## Estado (histórico — ver ARCHIVE-REPORT.md para el estado final real)

PROPUESTA — proposal/design/specs/tasks cerrados, sin código iniciado. WU1.2
(aplicar migración en Supabase producción) y WU9.6 (aprobación final) están
bloqueadas por HITL explícito. WU2.1 (aprovisionar bucket) también requiere gate
humano. El resto de WUs (3-8) son implementables en cadena según el orden de
dependencias documentado en `tasks.md`.

> **Nota de archivo (2026-07-11):** este párrafo "Estado" quedó desactualizado en
> el momento de la implementación — todas las fases (incluidas 1.2/1.3/1.4, 2.1,
> 9.1, 9.6) se completaron, verificaron (`verify-report`, PASS-WITH-NOTES) y
> mergearon a `main` (commit `3810b67`). Se conserva el texto original sin editar
> como registro histórico del último punto de sincronización de `sdd-spec`; el
> estado final real está documentado en `ARCHIVE-REPORT.md`.
