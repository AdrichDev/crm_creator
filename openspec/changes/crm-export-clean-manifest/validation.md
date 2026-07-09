# Validación — crm-export-clean-manifest

Historia: como **operador de la plataforma** que exporta la app de un tenant en cualquiera de
los 4 formatos (web/apk/exe/ipa), quiero que el ZIP entregado contenga solo lo que el cliente
necesita para compilar/alojar su app —sin herramientas internas de desarrollo, sin wrappers de
otra plataforma y sin secretos de mi máquina de desarrollo—, para poder entregarlo con confianza
sin revisarlo archivo por archivo antes de cada envío.

## Criterios de aceptación (AC)
- **AC1 (allowlist):** el ZIP de cada formato contiene únicamente las carpetas/archivos de su
  manifiesto (§`design.md`); no aparece `openspec/`, `e2e/`, `tests/`, `test-results/`,
  `vitest.*`, `playwright.config.ts`, `eslint.config.mjs`, `.gitignore`, `.npmrc`,
  `tsconfig.tsbuildinfo`.
- **AC2 (sin fuga de `.env.local`):** el `.env.local` dentro del ZIP nunca contiene contenido del
  `.env.local` de desarrollo del operador, con o sin `config.api.url` configurado.
- **AC3 (sin bloat cruzado):** `web-zip` no lleva `android/` ni `electron/`; `apk` no lleva
  `electron/`; `ipa` no lleva `android/`; `exe` no lleva `android/`.
- **AC4 (icono de escritorio):** con `branding.logoImage` presente, `exe` entrega
  `desktop-src/build/icon.png` en el ZIP.
- **AC5 (no regresión):** `web-zip` sigue con `schema.sql`/`schema.prisma`/`manifest.json`/
  `README.md`; `apk`/`ipa` siguen con `capacitor.config.ts` funcional
  (`customizeCapacitorConfig` aplicado); todos los builders siguen produciendo un ZIP válido
  (`success: true, outputPath`) para un tenant de prueba.
- **AC6 (back verde):** `tsc` limpio en `back/`; suite de tests de `export-builders/*` verde.
- **AC7 (anti-drift entre allowlists):** al ser 4 allowlists literales independientes (sin
  núcleo compartido), existe un test snapshot/assert por formato que fija las entradas de primer
  nivel EXACTAS del ZIP de cada builder; los 4 snapshots pasan.

## Por tarea (Given-When-Then + test)
- **WU1** Módulo allowlist → Given `manifest-allowlist.ts` con las 4 allowlists literales
  independientes (`WEB_ALLOWLIST`/`ANDROID_ALLOWLIST`/`IOS_ALLOWLIST`/`DESKTOP_ALLOWLIST`, cada
  una completa, sin constante compartida) y `allowlistFilter`, When se filtra un `entry.name` de
  fixture (`openspec/changes/x/proposal.md`, `app/page.tsx`, `build/icon.png`), Then solo pasan
  las rutas permitidas. Test: `manifest-allowlist.test.ts` (unit, sin fs real).
- **WU1.3** Anti-drift → Given los 4 builders ejecutados sobre un fixture completo, When se
  listan las entradas de primer nivel de cada ZIP, Then coinciden EXACTAMENTE con el snapshot
  esperado de su formato (un archivo añadido a una allowlist y olvidado en las otras rompe el
  snapshot del formato afectado). Test: `export-manifest-snapshot.test.ts` (por formato).
- **WU2** `.env.local` fresco → Given `frontDir` fixture con `.env.local` con un secreto de
  prueba y `config.api.url` undefined, When se ejecuta `buildWebZip`/`buildApk`/`buildExe`/
  `buildIpa`, Then el `.env.local` dentro del ZIP resultante NO contiene el secreto de prueba.
  Test: `export-env-leak.test.ts` por builder (o parametrizado), lee el contenido del ZIP.
- **WU3** `web-zip` sin bloat cruzado → Given fixture `frontDir` con `android/` y `electron/`
  reales, When `buildWebZip`, Then el ZIP no contiene ninguna entrada `app/android/*` ni
  `app/electron/*`. Test: `web-zip.test.ts` (ampliar suite existente).
- **WU4** `apk` sin `electron/` → Given mismo fixture, When `buildApk`, Then el ZIP no contiene
  `mobile-src/electron/*`. Test: `apk.test.ts`.
- **WU5** `ipa` sin `android/` → Given mismo fixture, When `buildIpa`, Then el ZIP no contiene
  `mobile-src/android/*`. Test: `ipa.test.ts`.
- **WU6** `exe` sin `android/` + icono sobrevive → Given fixture con `branding.logoImage` en
  base64 válido, When `buildExe`, Then el ZIP contiene `desktop-src/build/icon.png` y NO contiene
  `desktop-src/android/*`. Test: `exe.test.ts` (ampliar suite existente, caso icono).
- **WU7** Cruft de desarrollo fuera → Given fixture con `openspec/`, `e2e/`, `tests/`,
  `test-results/`, `vitest.config.ts`, `.gitignore`, `.npmrc`, `tsconfig.tsbuildinfo` en el
  `frontDir`, When se ejecuta cada builder, Then ninguno aparece en el ZIP resultante de ningún
  formato. Test: `export-manifest-cruft.test.ts` (parametrizado por los 4 builders).
- **WU8** No regresión de artefactos actuales → Given tenant de prueba con `config.api.url`
  seteado, When se ejecutan los 4 builders, Then `web-zip` sigue con `schema.sql`/
  `schema.prisma`/`manifest.json`/`README.md`, y `apk`/`ipa` siguen con `capacitor.config.ts`
  personalizado (`appId`/`appName` correctos). Test: ampliar los tests existentes de cada
  builder (no crear nuevos si ya cubren este caso).

> Regla del repo: una tarea está DONE solo cuando su test está verde. Sin spec → no code.

## Estado
PROPUESTA — sin iniciar. Pendiente de aprobación antes de codear (`design.md` da la forma
concreta del allowlist; ver `tasks.md` para el orden de ejecución).
