# Proposal: Exportador multiformato plug-and-play con jobs en segundo plano

## Problem

El exportador de proyectos (spec archivada `2026-06-30-crm-exportador-multiformato`) está roto o incompleto en producción:

1. **Web ZIP no es una app**: solo empaqueta `schema.sql`, `schema.prisma` y `manifest.json`. No contiene la aplicación, no se puede desplegar ni levantar en local.
2. **`.exe` falla siempre**: preflight busca `electron-builder` en PATH global ("electron-builder no encontrado, instálelo con npm install electron-builder"). Además `front/` no tiene scaffolding Electron (sin `electron/`, sin deps `electron`/`electron-builder`): aunque el preflight pasara, el build fallaría.
3. **`.apk` falla siempre**: preflight busca `gradle`/`gradlew` en PATH global ("Gradle no encontrado…"). `front/` no tiene Capacitor ni carpeta `android/` con gradle wrapper: build imposible hoy.
4. **Export bloquea la UX**: corre síncrono dentro del request HTTP (NDJSON stream + modal). Si el usuario recarga o navega, pierde el seguimiento y puede abortar el build.
5. **Bug latente Windows**: los builders usan `spawn('npx', …, shell:false)` — falla en Windows porque `npx` es un `.cmd`.

## Intent

Los tres formatos generan aplicaciones completas y operativas, "plug and play", sin dependencias globales sorpresa:

- **Web ZIP**: app Next.js standalone (Node) lista para producción + código fuente + README de despliegue (local y con dominio).
- **`.exe`**: ZIP con el código fuente de la app de escritorio (Electron) + ejecutable portable + instalador NSIS.
- **`.apk`**: ZIP con el código fuente móvil (Capacitor/Android con gradle wrapper embebido) + APK firmado instalable.
- **Segundo plano**: la exportación es un job persistente en el servidor; el progreso (% + paso) se muestra en un progress bar en el header del dashboard, sobrevive a navegación y recarga de página.
- **Carpeta destino**: la UI exige elegir carpeta destino antes de exportar (picker nativo ya existente).
- **Toolchain Android**: si faltan JDK 17 o Android SDK, el back los auto-instala (winget + descarga oficial cmdline-tools) con progreso visible; fallback a instrucciones manuales.

## Scope

- `back/src/routes/exports.ts`, `back/src/lib/export-*` (job manager nuevo, preflight reescrito, autoinstall nuevo, builders reescritos, spawn compartido).
- `front/next.config.ts` (output mode conmutable por env), `front/package.json` (deps Electron + Capacitor), scaffolding nuevo `front/electron/`, `front/capacitor.config.ts`, `front/android/` (commiteado con gradle wrapper).
- `front/lib/export/*` (hook polling + contexto global), `front/components/dashboard/*` (barra en header, picker obligatorio).

Fuera de scope: formato `.ipa` (sigue stub macOS), sistema de colas persistente en BD, multi-build concurrente (se mantiene lock de 1 build).

## Risks

- `output:'export'` estático puede chocar con route handlers/páginas dinámicas del front → auditoría obligatoria en Fase 3.
- winget puede requerir elevación → `--scope user` + fallback a instrucciones manuales.
- URL de cmdline-tools de Google versionada → constante fija documentada.
- Copia temporal + `npm ci` por build tarda minutos → aceptable al correr en background con progreso.
- `gradle-wrapper.jar` commiteado → excepciones explícitas en `.gitignore`.

## Dependencies

- Windows como plataforma objetivo del back (spawn vía `cmd /c`).
- Node 22 LTS en la máquina host.
- Internet para `npm ci`, winget y descarga de cmdline-tools durante builds/autoinstall.

## Phased delivery

Se implementa y verifica FASE A FASE (gate humano entre fases):

| Fase | Entrega | Verificación |
|---|---|---|
| 1 | Job manager back + endpoints 202/status/active | node:test + curl manual |
| 2 | Front: polling, barra en header, picker obligatorio | vitest + prueba visual (recarga) |
| 3 | Web ZIP = app standalone completa | descomprimir y `node server.js` |
| 4 | Scaffolding Electron + builder exe | .exe portable abre la app |
| 5 | Scaffolding Capacitor + builder apk | `adb install` del APK |
| 6 | Preflight por proyecto + auto-instalación toolchain | máquina sin JDK instala sola |
