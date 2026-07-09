# Tareas — crm-export-clean-manifest

Alcance: allowlist por formato + fin de la fuga de `.env.local` + fin del bloat cruzado + fix
icono `exe`. Orden = por dependencia (módulo compartido → cada builder → limpieza opcional en
`export-temp-copy.ts` → verificación final). Agentic Runtime gate antes de cualquier push.

## WU1 — Módulo allowlist compartido
- [x] 1.1 Crear `back/src/lib/export-builders/manifest-allowlist.ts`: 4 allowlists literales
  independientes (`WEB_ALLOWLIST`, `ANDROID_ALLOWLIST`, `IOS_ALLOWLIST`, `DESKTOP_ALLOWLIST`,
  cada una escrita completa, SIN constante compartida ni composición), `allowlistFilter()`,
  `buildEnvContent()` + `writeFreshEnvLocal()` (escritor único de `.env.local`, emisor único de
  `.env.example`).
- [x] 1.2 Test `manifest-allowlist.test.ts`: casos de filtrado (raíz permitida, raíz no
  permitida, `extraFiles` puntual tipo `build/icon.png`).
- [x] 1.3 Test anti-drift `export-manifest-snapshot.test.ts`: snapshot/assert por formato con
  las entradas de primer nivel EXACTAS esperadas en el ZIP de cada builder (web/apk/ipa/exe);
  guarda contra un archivo añadido a una allowlist y olvidado en las otras.

## WU2 — `.env.local` siempre fresco (fuga de dev)
- [x] 2.1 Reemplazar en los 4 builders el `if (config.api?.url) { fs.writeFileSync(...) }` por
  `writeFreshEnvLocal(tmpFrontDir, buildEnvContent(config))` incondicional (con o sin `api.url`);
  ningún builder ni otro paso del pipeline escribe/appendea `.env.local` por su cuenta
  (single-writer, `design.md` §3).
- [x] 2.2 (Opcional, segunda barrera) Añadir `.env.local` a `EXCLUDED` en
  `back/src/lib/export-temp-copy.ts`.
- [x] 2.3 Test `export-env-leak.test.ts`: `.env.local` de fixture con secreto de prueba no
  aparece en ningún ZIP generado, con y sin `config.api.url`.

## WU3 — `web-zip.ts` allowlist
- [x] 3.1 `assembleZip`: sustituir `APP_EXCLUDED` por `allowlistFilter(entry, WEB_ALLOWLIST)`.
- [x] 3.2 Test: fixture con `openspec/`, `android/`, `electron/`, `e2e/` → ninguno en el ZIP;
  `schema.sql`/`schema.prisma`/`manifest.json`/`README.md` siguen presentes (no regresión).

## WU4 — `apk.ts` allowlist
- [x] 4.1 `assembleZip`: sustituir `MOBILE_EXCLUDED` por `allowlistFilter(entry,
  ANDROID_ALLOWLIST)`.
- [x] 4.2 Test: fixture con `electron/` → no aparece en el ZIP; `android/` +
  `capacitor.config.ts` personalizado sí (no regresión).

## WU5 — `ipa.ts` allowlist
- [x] 5.1 `assembleZip`: sustituir `MOBILE_EXCLUDED` por `allowlistFilter(entry, IOS_ALLOWLIST)`
  (sin `android`).
- [x] 5.2 Test: fixture con `android/` y `electron/` → ninguno en el ZIP; `capacitor.config.ts`
  personalizado sí presente.

## WU6 — `exe.ts` allowlist + fix icono
- [x] 6.1 `assembleZip`: sustituir `DESKTOP_EXCLUDED` por `allowlistFilter(entry,
  DESKTOP_ALLOWLIST, ['build/icon.png'])`.
- [x] 6.2 Test: con `branding.logoImage`, `desktop-src/build/icon.png` presente en el ZIP;
  `android/` ausente; `electron/` + `electron-builder.yml` presentes (no regresión).

## WU7 — Cruft de desarrollo (transversal)
- [x] 7.1 Test parametrizado `export-manifest-cruft.test.ts`: fixture único con `openspec/`,
  `e2e/`, `tests/`, `test-results/`, `vitest.config.ts`, `vitest.setup.ts`,
  `playwright.config.ts`, `eslint.config.mjs`, `.gitignore`, `.npmrc`, `tsconfig.tsbuildinfo` en
  el `frontDir`; ejecutar los 4 builders; ninguno aparece en ningún ZIP.

## Cierre
- [x] Z.1 `tsc` limpio en `back/`.
- [x] Z.2 Suite completa de `back/` verde (incluye tests nuevos de WU1-WU7).
- [ ] Z.3 Agentic Runtime review antes de cualquier push (foco: que el allowlist no rompa
  `applyExportCompat`/`customizeCapacitorConfig`, que corren ANTES del ensamblado).
- [x] Z.4 Actualizar `ARQUITECTURA.md`/Engram si el catálogo de exportadores documenta el criterio
  denylist actual. (No aplica: `ARQUITECTURA.md` no documenta el criterio de empaquetado de
  exportadores; decisión persistida en Engram vía `mem_save`, ver NOTES.)
