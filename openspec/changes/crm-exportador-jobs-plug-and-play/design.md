# Design: Exportador multiformato plug-and-play

## Architecture overview

```
front (Next.js)                          back (Express)
┌──────────────────────────┐            ┌─────────────────────────────────┐
│ ExportJobProvider (ctx)  │  POST /api/exports ──► 202 {jobId}           │
│  ├ use-export-job hook   │            │  └► void runJob() (background)  │
│  ├ ExportHeaderProgress  │  GET /api/exports/:id/status (poll 1.5s)     │
│  │  (en dashboard-tabs)  │  GET /api/exports/active (reenganche)        │
│  └ ExportTable (picker   │  GET /api/exports/pick-folder (sin cambios)  │
│     obligatorio)         │            │                                 │
└──────────────────────────┘            │ export-job-manager (in-memory)  │
                                        │  ├ export-lock (1 build+watchdog)│
                                        │  ├ export-preflight (por proyecto)│
                                        │  ├ export-autoinstall (winget)  │
                                        │  └ builders: web-zip│exe│apk    │
                                        └─────────────────────────────────┘
```

## D1 — Job manager in-memory (sin Prisma)

Un build es proceso hijo del back: si el back se reinicia, el build muere. Persistir jobs en BD solo dejaría huérfanos "running". In-memory + `GET /active` cubre el requisito real (sobrevivir recarga del FRONT).

`back/src/lib/export-job-manager.ts`:

```ts
interface ExportJob {
  id: string;                       // randomUUID
  projectId: string;
  formats: BuildFormat[];
  status: 'running' | 'done' | 'error';
  currentFormat?: BuildFormat;
  step?: string;                    // texto del paso actual
  pct: number;                      // 0-100 global ponderado por formato
  perFormat: Record<string, { status: 'pending'|'running'|'done'|'error'; pct: number; outputPath?: string; error?: string }>;
  error?: string;
  createdAt: number;
  finishedAt?: number;
}
```

- `startJob(params)` valida, adquiere `acquireLock()`, arranca `startWatchdog()` y lanza `void runJob()`.
- `runJob()` ejecuta builders en serie reutilizando la firma `Emitter` actual; los eventos actualizan el job en memoria (ya no escriben al response).
- pct global = suma ponderada equitativa por formato (`(idx + pctFormato/100) / total * 100`).
- Retención: el último job terminado se conserva 30 min (`setTimeout` unref) para lectura post-recarga.
- Watchdog (20 min, existente) → aborta y marca `status:'error'`.

## D2 — Contrato HTTP

- `POST /api/exports` → validación/ownership idénticas a hoy → `202 { jobId }` | `409` si lock ocupado.
- `GET /api/exports/:id/status` → `ExportJob` serializado | `404`.
- `GET /api/exports/active` → job `running` o último terminado en retención | `204`.
- `GET /api/exports/pick-folder` → sin cambios.
- Se elimina la respuesta NDJSON.

## D3 — Front: contexto global + polling

- `front/lib/export/use-export-job.ts` reemplaza a `use-export-stream.ts` (se elimina): `start()` hace POST y guarda jobId; polling `setInterval` 1.5s a `/status`; para al llegar `done|error`; `dismiss()` limpia estado terminado.
- `front/lib/export/export-job-context.tsx`: provider montado por encima de `DashboardTabs` para que el estado sobreviva a cambios de pestaña. Al montar consulta `/active` y reengancha.
- `front/components/dashboard/export-header-progress.tsx`: barra fina en la fila de tabs de `dashboard-tabs.tsx` con `%` numérico + formato + paso; estados done (verde, clicable para ver rutas de salida) y error (rojo, clicable para detalle); botón descartar.
- `export-table.tsx`: al pulsar Exportar sin carpeta destino → invoca pick-folder automáticamente; si el usuario cancela el diálogo, se aborta (nunca `outputDir` vacío).
- `export-progress.tsx` pasa a ser panel de detalle opcional alimentado por el mismo contexto.

## D4 — Output mode conmutable

`front/next.config.ts`:

```ts
// NEXT_OUTPUT_MODE: 'standalone' (web zip) | 'export' (exe/apk) | undefined (dev, sin cambios)
const outputMode = process.env.NEXT_OUTPUT_MODE as 'standalone' | 'export' | undefined;
```

Los builders pasan la variable en `env` del spawn de `next build` (no se escribe en `.env.local` para no contaminar la copia fuente incluida en el ZIP).

Auditoría previa (Fase 3): `front/app/` no debe tener route handlers/páginas dinámicas incompatibles con `output:'export'`; si los hay, excluirlos en la copia temporal o condicionarlos.

## D5 — Estructura de ZIPs finales

Ensamblado con `archiver` (streaming, dep nueva del back; JSZip carga todo en memoria y los builds pesan cientos de MB).

- **web** `<slug>-web.zip`: `app/` (fuente sin node_modules/.next/out) · `standalone/` (`.next/standalone` + `.next/static` y `public/` recolocados según doc Next) · `schema.sql` · `schema.prisma` · `manifest.json` · `README.md`.
- **exe** `<slug>-desktop.zip`: `desktop-src/` (fuente + `electron/`) · `<Product>-portable.exe` · `<Product>-setup.exe` (NSIS) · `README.md`.
- **apk** `<slug>-android.zip`: `mobile-src/` (fuente + `android/`, sin builds) · `app-release.apk` · `README.md`.

READMEs desde plantillas `back/src/lib/export-templates/readme-{web,desktop,android}.md` (despliegue local, dominio/reverse proxy, instalación).

## D6 — Scaffolding Electron (Fase 4)

- `front/electron/main.cjs`: BrowserWindow que hace `loadFile('out/index.html')`; `preload.cjs` mínimo.
- `front/package.json`: devDeps reales `electron` + `electron-builder`; `"main": "electron/main.cjs"` (inofensivo para `next dev`).
- `front/electron-builder.yml`: `files: ['electron/**','out/**']`, targets win `portable` + `nsis`, `directories.output: dist-electron`, `productName` sobreescribible vía env (`EB_PRODUCT_NAME` desde el tenant).
- Builder exe: `NEXT_OUTPUT_MODE=export` → `next build` → `cmd /c node_modules\.bin\electron-builder --win …` en el tmp → ZIP final.

## D7 — Scaffolding Capacitor + firma APK (Fase 5)

- `front/package.json`: `@capacitor/core` (dep), `@capacitor/cli` + `@capacitor/android` (devDeps).
- `front/capacitor.config.ts`: `webDir: 'out'`; appId/appName base, sobreescritos por el builder en el tmp según tenant.
- `front/android/` generado con `npx cap add android` y COMMITEADO, incluyendo `gradlew`, `gradlew.bat`, `gradle/wrapper/gradle-wrapper.jar` (excepciones `.gitignore`); se ignoran `android/app/build/`, `android/.gradle/`, `android/local.properties`.
- Firma: keystore por instalación generado con `keytool` (incluido en JDK) en `back/keystore/export-release.keystore` (password aleatorio persistido junto al keystore con permisos restringidos); `android/app/build.gradle` define `signingConfigs.release` leyendo propiedades `-PrelKeystore/-PrelAlias/-PrelPass` con fallback a debug signing.
- Builder apk: preflight → (autoinstall) → `next build` export → `npx cap sync android` → escribir `local.properties` con `sdk.dir` → `cmd /c gradlew.bat assembleRelease -P…` → ZIP final.

## D8 — Preflight por proyecto (Fase 6)

`checkToolchain(format, frontDir)` → `{ ok: boolean; missing: Array<'node_modules'|'electron_builder'|'gradlew'|'jdk'|'sdk'> }`:

- exe: `frontDir/node_modules/.bin/electron-builder.cmd` existe (si no → "ejecuta npm install en front/").
- apk: `frontDir/android/gradlew.bat` + `gradle/wrapper/gradle-wrapper.jar` (NUNCA PATH global); JDK 17 (`JAVA_HOME` o `where java` + parse `java -version`); Android SDK (`ANDROID_HOME` → fallback `%LOCALAPPDATA%\Android\Sdk` con `platforms/`).

## D9 — Auto-instalación toolchain Android (Fase 6)

`back/src/lib/export-autoinstall.ts` — `ensureAndroidToolchain(missing, emit, signal)`:

1. JDK: `winget install EclipseAdoptium.Temurin.17.JDK --scope user --silent --accept-package-agreements --accept-source-agreements`.
2. SDK: descarga PowerShell (`Invoke-WebRequest`) del zip oficial `commandlinetools-win-<VER>.zip` (versión fijada en constante `CMDLINE_TOOLS_URL`) a `%LOCALAPPDATA%\Android\Sdk\cmdline-tools\latest`, luego `sdkmanager --licenses` (pipe de "y") y `sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"`.
3. Cada paso emite `{type:'progress', step:'Instalando JDK 17…'}` al job; timeout propio por paso; respeta `AbortSignal`.
4. Fallo de cualquier paso → `format-error` con instrucciones manuales completas (comandos exactos).
5. Tras autoinstall → re-preflight; solo entonces build.

## D10 — spawn compartido y fix Windows

`back/src/lib/spawn-async.ts`: extrae el `spawnAsync` duplicado de exe.ts/apk.ts. En Windows todo comando `.cmd`/`.bat` (npx, gradlew.bat, electron-builder) se invoca vía `cmd /c`. Acepta `env` extra y `AbortSignal`.

## Test strategy

- Back (node:test): job manager con builders fake (lifecycle, 409, retención, watchdog), preflight con fs mockeado, autoinstall con exec mockeado, builders verificando env `NEXT_OUTPUT_MODE` y entradas del ZIP con spawn mockeado.
- Front (vitest): hook use-export-job con fetch mockeado (start→poll→done; remount reengancha vía /active), render de ExportHeaderProgress, picker obligatorio en export-table.
- E2E manual por fase (ver validation.md).
