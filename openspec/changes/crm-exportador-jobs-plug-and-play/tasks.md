# Tasks: Exportador multiformato plug-and-play

Orden crítico: 1 → 2 → 3 → 4 → 5 → 6. Gate humano al final de cada fase (verificación e2e de validation.md) antes de empezar la siguiente.

## Fase 1 — Job manager back

- [x] 1.1 Crear `back/src/lib/export-job-manager.ts` (ExportJob, startJob/runJob/getJob/getActiveJob; reutiliza export-lock + watchdog) + test lifecycle
- [x] 1.2 pct global ponderado por formato + test (2 formatos → 50%)
- [x] 1.3 Integración lock: segundo startJob falla → ruta responde 409 + test
- [x] 1.4 Retención 30 min del último job terminado + test
- [x] 1.5 Builder que falla / watchdog → status error + lock liberado + test
- [x] 1.6 Modificar `back/src/routes/exports.ts`: POST→202 {jobId}, GET /:id/status, GET /active (pick-folder intacto) + tests de rutas
- [x] 1.V Verificación fase: `npm test` back verde + curl manual (202 inmediato, status progresa con builder web actual)

## Fase 2 — Front: polling + barra header + picker obligatorio

- [x] 2.1 Crear `front/lib/export/use-export-job.ts` (POST + polling 1.5s + stop en done/error) + test; eliminar `use-export-stream.ts`
- [x] 2.2 Crear `front/lib/export/export-job-context.tsx` (provider global, reenganche vía GET /active al montar) + test remount
- [x] 2.3 Crear `front/components/dashboard/export-header-progress.tsx` + insertar en fila de tabs de `dashboard-tabs.tsx` + test render
- [x] 2.4 `export-table.tsx`: picker obligatorio (auto-invocar pick-folder, abortar si cancela) + test; adaptar `export-progress.tsx` a panel detalle
- [x] 2.V Verificación fase: vitest verde + manual: exportar, cambiar pestaña, recargar → barra sigue con %

## Fase 3 — Web ZIP = app completa

- [x] 3.1 `front/next.config.ts`: output según `NEXT_OUTPUT_MODE` + auditoría de route handlers/páginas dinámicas incompatibles con export + test
- [x] 3.2 `back/src/lib/export-temp-copy.ts`: excluir node_modules/.next/out, `npm ci` en tmp con progreso + test
- [x] 3.3 Reescribir `back/src/lib/export-builders/web-zip.ts` (standalone + fuente + schema + README vía `archiver`) + plantilla `readme-web.md` + test
- [x] 3.4 Modo app exportada: hornear config real (`.env.local` efectivo en build) + CONSUMIR `BAKED_TENANT_CONFIG` (gap heredado: se exporta pero nadie lo usa) — con config horneada la app arranca como app del tenant (/panel con su negocio), no como consola OperaOS + test
- [x] 3.V Verificación fase: descomprimir ZIP real, `node standalone/server.js`, abrir navegador con tenant correcto

## Fase 4 — Electron + builder exe

- [x] 4.1 Scaffolding: `front/electron/main.cjs` + `preload.cjs` + `front/electron-builder.yml` + devDeps electron/electron-builder + `"main"` en package.json + .gitignore (dist-electron/, out/) — `next build` sigue verde
- [x] 4.2 Reescribir `back/src/lib/export-builders/exe.ts` (NEXT_OUTPUT_MODE=export, electron-builder local vía cmd /c, ZIP fuente+portable+nsis, plantilla readme-desktop.md) + test
- [x] 4.3 Extraer `back/src/lib/spawn-async.ts` compartido (fix cmd /c Windows) y usarlo en todos los builders + test
- [x] 4.V Verificación fase: export exe real; portable abre app con tenant horneado

## Fase 5 — Capacitor + builder apk

- [x] 5.1 Scaffolding: deps @capacitor/*, `front/capacitor.config.ts`, generar y commitear `front/android/` con gradle wrapper (excepciones .gitignore) + test existencia
- [x] 5.2 Firma: `ensureKeystore` (keytool, back/keystore/) + `signingConfigs.release` por `-P` en `android/app/build.gradle` con fallback debug + test
- [x] 5.3 Reescribir `back/src/lib/export-builders/apk.ts` (export estático, cap sync, local.properties, gradlew.bat assembleRelease, ZIP fuente+apk, plantilla readme-android.md) + test
- [x] 5.V Verificación fase: export apk real; verificado con apksigner verify (firma release OK) + aapt badging (package y label del tenant) — sin dispositivo físico, adb install pendiente de usuario

## Fase 6 — Preflight por proyecto + autoinstall

- [x] 6.1 Reescribir `back/src/lib/export-preflight.ts` (`checkToolchain(format, frontDir)` → {ok, missing[]}; herramientas del proyecto, no PATH) + test
- [x] 6.2 Crear `back/src/lib/export-autoinstall.ts` (winget JDK 17 --scope user, descarga cmdline-tools, licencias, sdkmanager; progreso por paso; AbortSignal) + test secuencia
- [x] 6.3 Fallback instrucciones manuales exactas en fallo + integración en apk.ts (preflight→autoinstall→re-preflight→build) + test
- [x] 6.V Verificación fase: entorno sin JDK instala toolchain solo con progreso visible

## Cierre

- [x] 7.1 `npm test` back + front verdes completos
- [ ] 7.2 Export real de los 3 formatos end-to-end
- [ ] 7.3 sdd-verify + archivar change
