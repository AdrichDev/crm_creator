# crm-export-clean-manifest

## Intención
Sustituir el criterio de empaquetado de los 4 exportadores (`web-zip`, `apk`, `exe`, `ipa`) de
**denylist** (excluir unas pocas carpetas conocidas) a **allowlist explícita por formato**
(incluir solo lo que el cliente necesita para compilar/alojar su app). Además: dejar de copiar
el `.env.local` de desarrollo del operador al ZIP entregado, eliminar el bloat cruzado de
plataforma (web/apk/exe llevándose `android/`/`electron/` ajenos) y corregir el bug del icono
de escritorio (`build/icon.png` se escribe y luego se excluye del ZIP).

## Problema
Verificado en código (`back/src/lib/export-temp-copy.ts`, `back/src/lib/export-builders/*.ts`):

- **Denylist demasiado corta.** `export-temp-copy.ts` define `EXCLUDED = new Set(['node_modules',
  '.next', '.git', 'out'])`; cada builder añade 2-3 carpetas más en el momento de armar el ZIP
  (`APP_EXCLUDED`, `MOBILE_EXCLUDED`, `DESKTOP_EXCLUDED`). Todo lo demás de `front/` entra. En el
  repo real eso incluye: `openspec/` (con su propio árbol `changes/`+`archive/`, decenas de `.md`),
  `e2e/` (7 specs Playwright), `tests/`, `test-results/` (artefactos de ejecuciones previas,
  confirmado `error-context.md` + `.last-run.json` presentes hoy), `vitest.config.ts`,
  `vitest.setup.ts`, `playwright.config.ts`, `eslint.config.mjs`, `.gitignore`, `.npmrc`,
  `tsconfig.tsbuildinfo`. Ninguno aporta valor al cliente que recibe el ZIP; varios exponen
  historial interno de desarrollo (`openspec/`) o metadatos de tooling.
- **Fuga de `.env.local` de desarrollo (seguridad).** `createTempCopy` (línea ~90) copia
  `frontDir` completo a la copia temporal SIN excluir `.env.local` (no está en `EXCLUDED`).
  Después solo reemplaza `localhost` por la IP LAN y **añade** (`appendFileSync`) la variable
  `NEXT_PUBLIC_TENANT_JSON`. Cada builder solo sobreescribe el archivo completo con una única
  línea `NEXT_PUBLIC_API_URL=...` **si `config.api?.url` existe** (`if (config.api?.url) {
  fs.writeFileSync(...) }`). Si el tenant no tiene `api.url` configurado (plausible en
  onboarding temprano o flujos SaaS-puro sin API propia), el `.env.local` real del operador —
  con el contenido que tenga en su máquina de desarrollo — viaja intacto (más el JSON del
  tenant añadido) dentro del ZIP que descarga el cliente.
- **Bloat cruzado de plataforma.** `web-zip` (`APP_EXCLUDED = node_modules/.next/out`) no excluye
  `android/` ni `electron/`: el ZIP web se lleva ambos wrappers nativos sin usarlos. `apk`/`ipa`
  (`MOBILE_EXCLUDED = node_modules/.next/out/build/.gradle`) no excluyen `electron/`. `exe`
  (`DESKTOP_EXCLUDED = node_modules/.next/out/dist-electron/build`) no excluye `android/`.
- **Bug confirmado: icono de escritorio desaparece.** `exe.ts` escribe el icono personalizado en
  `tmpFrontDir/build/icon.png` (`fs.mkdirSync(buildDir)` + `fs.writeFileSync`) ANTES de armar el
  ZIP, pero `DESKTOP_EXCLUDED` incluye literalmente `'build'` y el filtro de `archive.directory`
  comprueba `segs.some(s => DESKTOP_EXCLUDED.has(s))` — cualquier segmento de ruta llamado
  `build` se descarta, incluido el que acaba de crearse. `electron-builder.yml` no declara
  `icon:` explícito, así que depende de la convención por defecto de electron-builder
  (`build/icon.png`); al faltar en el ZIP, la app de escritorio del cliente sale con el icono
  genérico de Electron pese a que el operador subió un logo.

## Alcance
- Definir manifiestos allowlist por formato (web/android/ios/desktop) en un módulo compartido de
  los builders (no en `export-temp-copy.ts`, que sigue haciendo la copia física; el allowlist se
  aplica en el momento de ensamblar cada ZIP, igual que hoy hacen `APP_EXCLUDED`/`MOBILE_EXCLUDED`/
  `DESKTOP_EXCLUDED`, pero invirtiendo la lógica de filtro).
- `.env.local` de origen NUNCA se copia ni se referencia; cada builder escribe siempre un
  `.env.local` fresco solo con las variables horneadas para ese formato (hoy ya ocurre cuando
  `config.api.url` existe — se generaliza para que ocurra siempre, con o sin `api.url`).
- Excluir el wrapper de plataforma ajena por formato: web sin `android/`/`electron/`/
  `capacitor.config.ts`; apk/ipa sin `electron/`/`electron-builder.yml`; exe sin `android/`/
  `capacitor.config.ts`.
- Corregir el caso `build/icon.png` de `exe.ts`: el icono debe sobrevivir al filtro de ensamblado
  (allowlist explícita para `build/icon.png` cuando el builder lo genera).
- Fuera de alcance: cambiar el runtime de las apps exportadas (eso es
  `crm-export-runtime-config`), tocar `export-compat.ts` más allá de lo necesario para que el
  allowlist no rompa `applyExportCompat` (que sigue operando sobre la copia temporal antes del
  ensamblado), migraciones de datos (no aplica, no hay modelo de datos afectado).

## Decisiones
- **Allowlist en el momento de ensamblar el ZIP, no en `createTempCopy`.** `createTempCopy` sigue
  copiando con la denylist actual (necesita `node_modules`/`out`/`.next` fuera para que
  `npm ci`/`next build` no arrastren basura de la copia anterior si la hubiera), porque el build
  estático (`next build --output export`, `applyExportCompat`) necesita el árbol de `front/`
  razonablemente completo antes de filtrar. El allowlist se aplica solo al construir cada ZIP
  final (`archive.directory(..., filterFn)`), igual que hoy se aplica `APP_EXCLUDED` etc., pero
  invirtiendo el criterio: en vez de "todo menos X", "solo A, B, C...".
- **`.env.local` fresco siempre, nunca copiado — con escritor único.** Se elimina cualquier
  dependencia del contenido de `.env.local` de origen: `writeFreshEnvLocal`/`buildEnvContent`
  (ver `design.md` §3) es el único escritor de `.env.local` en todo el pipeline; los builders lo
  invocan siempre con las variables que correspondan (hoy `NEXT_PUBLIC_API_URL`; otras changes
  como `crm-export-runtime-config` añaden las suyas extendiendo `buildEnvContent`, nunca
  escribiendo el archivo). Sin `api.url`, se escribe un `.env.local` vacío o con placeholder,
  nunca se deja el del operador. El mismo módulo es el único emisor de `.env.example`.
- **Cuatro manifiestos independientes, explícitos y literales** (detalle en `design.md`): NO hay
  núcleo compartido ni composición — `WEB_ALLOWLIST`, `ANDROID_ALLOWLIST`, `IOS_ALLOWLIST` y
  `DESKTOP_ALLOWLIST` se escriben completas en el módulo, y cada una declara SOLO lo que su
  formato necesita (web sin capacitor/android/electron; apk con `capacitor.config.ts`+`android/`;
  ipa con `capacitor.config.ts` sin `android/`; exe con `electron/`+`electron-builder.yml`+
  `build/icon.png`; `shared/` aparte). El drift entre listas se guarda con un test
  snapshot/assert por formato sobre las entradas de primer nivel exactas de cada ZIP.
- **Web sigue llevando `schema.sql`/`schema.prisma`/`manifest.json`** (son artefactos generados,
  no copiados del repo; no cambian con este change).

## Riesgos
- Un manifiesto demasiado estricto puede romper un import que hoy funciona por accidente (p.ej.
  algún archivo de configuración en la raíz de `front/` no listado en la allowlist del formato).
  Mitigación: `tsc`/`npm run build` sobre el ZIP resultante como parte del test de cada builder
  (WU en `tasks.md`).
- Al ser 4 listas literales sin constante compartida, existe riesgo de drift: un archivo común
  añadido a una allowlist y olvidado en las otras tres. Mitigación: test snapshot/assert por
  formato con las entradas de primer nivel exactas esperadas de cada ZIP (WU1.3 en `tasks.md`).
- Cambiar de denylist a allowlist es un cambio de comportamiento observable (el ZIP entregado
  cambia de tamaño/contenido); no afecta a datos ni migraciones, pero sí a artefactos ya
  descargados por clientes existentes (no retroactivo, no requiere aviso).
- `applyExportCompat` (usado por apk/exe/ipa) opera sobre la copia temporal ANTES del ensamblado
  final; el allowlist debe aplicarse DESPUÉS de que `applyExportCompat` haya borrado `app/api/` y
  las rutas dinámicas, para no re-incluir algo que ya se eliminó por incompatibilidad con
  `output: export`.

## Dependencias
Ninguna otra change de `openspec/changes/`. Depende solo de código ya existente en
`back/src/lib/export-builders/*.ts`, `back/src/lib/export-temp-copy.ts`,
`back/src/lib/export-compat.ts`.

## Nota fuera de alcance (hallazgo colateral)
`export-compat.ts` busca `next.config.mjs` para inyectar `output: "export"`
(`path.join(frontDir, 'next.config.mjs')`), pero el repo actual usa `next.config.ts`
(`front/next.config.ts`, no existe `.mjs`). Si `fs.existsSync` falla, el parche de
`output: 'export'` nunca se aplica y `removed.push(...)` no lo registra. No se toca en este
change (afecta a la compilación estática de apk/exe/ipa, no al contenido del manifiesto); se deja
anotado para que quien lo aborde no lo confunda con el trabajo de allowlist.
