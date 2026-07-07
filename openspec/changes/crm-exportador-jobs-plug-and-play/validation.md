# Validation: Exportador multiformato plug-and-play

## User story

Como dueño de un proyecto en el CRM, quiero exportarlo como web, escritorio (.exe) o móvil (.apk) eligiendo dónde guardarlo, siguiendo el progreso desde el header mientras sigo trabajando, y obteniendo aplicaciones completas listas para producción sin instalar herramientas a mano.

## Acceptance criteria

- AC-1: POST /api/exports responde 202 con jobId al instante; el build corre en background en el servidor.
- AC-2: El progreso (% global + paso) es consultable por polling y sobrevive a recarga de página del front.
- AC-3: El header del dashboard muestra un progress bar con % durante toda la exportación, visible en cualquier pestaña.
- AC-4: No se puede exportar sin carpeta destino elegida (picker nativo).
- AC-5: El Web ZIP contiene una app Next.js standalone que arranca con `node server.js` + fuente + schema + README de despliegue con dominio.
- AC-6: El export .exe produce un ZIP con fuente de escritorio + .exe portable + instalador NSIS, sin requerir electron-builder global.
- AC-7: El export .apk produce un ZIP con fuente móvil + APK firmado instalable, sin requerir Gradle global (wrapper embebido).
- AC-8: Si faltan JDK 17 / Android SDK, el sistema los instala automáticamente con progreso visible; si la instalación falla, muestra instrucciones manuales exactas.

---

## Fase 1 — Job manager back

### Scenario (Given-When-Then)
- **Given** un proyecto válido y ningún build en curso
- **When** POST /api/exports con `{projectId, formats:['web']}`
- **Then** responde 202 `{jobId}` inmediatamente y GET /api/exports/:id/status refleja `pct` creciente hasta `status:'done'`.

### Tests (1 por tarea)
| Tarea | Test |
|---|---|
| 1.1 job manager | `export-job-manager.test.ts`: con builders fake, `startJob` → status pasa running→done y pct llega a 100 |
| 1.2 pct ponderado | test: 2 formatos, primero al 100% → pct global = 50 |
| 1.3 lock/409 | test: segundo `startJob` con job activo lanza error de lock (ruta → 409) |
| 1.4 retención | test: job terminado sigue accesible vía `getActiveJob()` (retención) y `getJob(id)` |
| 1.5 watchdog/error | test: builder fake que rechaza → `status:'error'` + lock liberado |
| 1.6 rutas | `exports-routes.test.ts`: POST→202 {jobId}; GET /:id/status→200; GET id inexistente→404; GET /active sin job→204 |

## Fase 2 — Front: polling + barra header + picker

### Scenario
- **Given** una exportación en curso iniciada desde la pestaña Exportar
- **When** el usuario cambia a la pestaña Proyecto o recarga la página
- **Then** el header sigue mostrando el progress bar con el % actual (reenganchado vía GET /active).

### Tests
| Tarea | Test |
|---|---|
| 2.1 hook use-export-job | vitest: `start()` hace POST y arranca polling; al recibir `done` para el polling |
| 2.2 reenganche | vitest: al montar con GET /active devolviendo job running, el hook reanuda polling sin `start()` |
| 2.3 barra header | vitest: `ExportHeaderProgress` renderiza `%` y paso con job running; estados done/error |
| 2.4 picker obligatorio | vitest: click Exportar sin carpeta → llama pick-folder; si cancela, NO hace POST |

## Fase 3 — Web ZIP app completa

### Scenario
- **Given** un proyecto configurado
- **When** exporto formato web y descomprimo el ZIP
- **Then** contiene `standalone/`, `app/`, `schema.sql`, `README.md`, y `node standalone/server.js` sirve la app con la config del tenant.

### Tests
| Tarea | Test |
|---|---|
| 3.1 next.config output mode | vitest/unit: config exporta `output:'standalone'|'export'` según `NEXT_OUTPUT_MODE`, undefined en dev |
| 3.2 temp-copy + npm ci | node:test: la copia excluye node_modules/.next/out y ejecuta `npm ci` (spawn mockeado) |
| 3.3 builder web-zip | node:test: con spawn mockeado, el spawn de next build recibe `NEXT_OUTPUT_MODE=standalone` y el ZIP contiene las entradas esperadas |
| 3.4 e2e manual | descomprimir + `node standalone/server.js` + abrir navegador (gate humano) |

## Fase 4 — Electron + exe

### Scenario
- **Given** front con scaffolding Electron commiteado y `npm install` hecho
- **When** exporto formato exe
- **Then** el ZIP contiene `desktop-src/`, `<Product>-portable.exe` y `<Product>-setup.exe`, y el portable abre la app con el tenant horneado.

### Tests
| Tarea | Test |
|---|---|
| 4.1 scaffolding | `next dev`/`next build` siguen funcionando con `"main"` y devDeps nuevas (build verde) |
| 4.2 builder exe | node:test: spawn mockeado — usa `NEXT_OUTPUT_MODE=export`, invoca `node_modules\.bin\electron-builder` local vía `cmd /c`, ZIP con entradas esperadas |
| 4.3 spawn-async compartido | node:test: `spawn-async` envuelve `.cmd/.bat` con `cmd /c` en win32 y propaga env/señal |
| 4.4 e2e manual | .exe portable abre la app (gate humano) |

## Fase 5 — Capacitor + apk

### Scenario
- **Given** front con Capacitor y `android/` (gradle wrapper incluido) commiteados
- **When** exporto formato apk
- **Then** el ZIP contiene `mobile-src/` y `app-release.apk` firmado, instalable con `adb install`, sin Gradle global.

### Tests
| Tarea | Test |
|---|---|
| 5.1 scaffolding android | `android/gradlew.bat` y `gradle/wrapper/gradle-wrapper.jar` presentes en git (test de existencia) |
| 5.2 keystore | node:test: `ensureKeystore` genera keystore vía keytool (exec mockeado) y reutiliza el existente |
| 5.3 builder apk | node:test: spawn mockeado — secuencia next build(export)→cap sync→gradlew.bat assembleRelease con `-P` de firma y `local.properties` escrito |
| 5.4 e2e manual | `adb install app-release.apk` (gate humano) |

## Fase 6 — Preflight + autoinstall

### Scenario
- **Given** una máquina sin JDK ni Android SDK
- **When** exporto formato apk
- **Then** el job muestra pasos "Instalando JDK 17…", "Instalando Android SDK…" y el build continúa hasta producir el APK; si winget falla, el job termina en error con instrucciones manuales exactas.

### Tests
| Tarea | Test |
|---|---|
| 6.1 preflight por proyecto | node:test: fs mockeado — detecta electron-builder local, gradlew del proyecto, JDK y SDK; nunca consulta PATH para gradle |
| 6.2 autoinstall secuencia | node:test: exec mockeado — orden winget→descarga→licencias→sdkmanager, emite progreso por paso |
| 6.3 fallback manual | node:test: exec que falla → error con texto de instrucciones que incluye los comandos exactos |
| 6.4 e2e manual | máquina/entorno sin JDK: export apk instala toolchain (gate humano) |

## Definition of done

Una tarea está DONE solo con su test verde. Una fase está DONE con todos sus tests verdes + verificación e2e manual aprobada por el humano. El change se archiva solo tras las 6 fases.
