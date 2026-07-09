# Diseño técnico — crm-export-clean-manifest

## 1. Módulo compartido: manifiestos allowlist

Nuevo archivo `back/src/lib/export-builders/manifest-allowlist.ts` (nombre propuesto), consumido
por los 4 builders (`web-zip.ts`, `apk.ts`, `exe.ts`, `ipa.ts`). Define, por formato, la lista
de entradas de primer nivel de `front/` que SÍ entran al ZIP (allowlist), sustituyendo a
`APP_EXCLUDED` / `MOBILE_EXCLUDED` / `DESKTOP_EXCLUDED` actuales.

**Decisión (product owner): CUATRO allowlists totalmente independientes, explícitas y
literales.** No existe constante compartida (`CORE_ALLOWLIST` queda descartada) ni composición
entre listas: cada formato escribe su lista completa y declara SOLO lo que necesita. La
redundancia textual es deliberada — el precio de repetir ~15 entradas se paga a cambio de que
cada manifiesto sea auditable de un vistazo, sin resolver sumas mentales.

```
WEB_ALLOWLIST = [                                  // sin capacitor/android/electron
  'app', 'components', 'lib', 'public',            // + schema.sql/prisma/manifest generados aparte
  'package.json', 'package-lock.json',
  'next.config.ts', 'next.config.mjs', 'next.config.js',  // cubre next.config.*
  'tsconfig.json', 'next-env.d.ts',
  'tailwind.config.ts', 'postcss.config.mjs',
  '.env.example', 'README.md',
]

ANDROID_ALLOWLIST = [
  'app', 'components', 'lib', 'public',
  'package.json', 'package-lock.json',
  'next.config.ts', 'next.config.mjs', 'next.config.js',
  'tsconfig.json', 'next-env.d.ts',
  'tailwind.config.ts', 'postcss.config.mjs',
  '.env.example', 'README.md',
  'capacitor.config.ts', 'android',
]

IOS_ALLOWLIST = [                                  // SIN 'android'
  'app', 'components', 'lib', 'public',
  'package.json', 'package-lock.json',
  'next.config.ts', 'next.config.mjs', 'next.config.js',
  'tsconfig.json', 'next-env.d.ts',
  'tailwind.config.ts', 'postcss.config.mjs',
  '.env.example', 'README.md',
  'capacitor.config.ts',
]

DESKTOP_ALLOWLIST = [                              // SIN 'android'; 'build/icon.png' vía allowlist de archivo, no de carpeta
  'app', 'components', 'lib', 'public',
  'package.json', 'package-lock.json',
  'next.config.ts', 'next.config.mjs', 'next.config.js',
  'tsconfig.json', 'next-env.d.ts',
  'tailwind.config.ts', 'postcss.config.mjs',
  '.env.example', 'README.md',
  'electron', 'electron-builder.yml',
]
```

Guardia anti-drift: al no compartir constante, un archivo "core" añadido a una lista y olvidado
en las otras tres no lo detecta el compilador. Se mitiga con un test snapshot/assert por formato
(WU1.3) que fija las entradas de primer nivel EXACTAS esperadas en el ZIP de cada builder:
cualquier alta/baja en una lista obliga a actualizar su snapshot de forma consciente, y la
revisión del diff de snapshots hace visible si el mismo archivo falta en los otros formatos.

Función de filtro compartida (usada en el callback de `archive.directory(...)`):
```
function allowlistFilter(entry: EntryData, allowlist: string[], extraFiles: string[] = []): EntryData | false {
  const top = entry.name.split(/[\\/]/)[0];
  if (allowlist.includes(top)) return entry;
  if (extraFiles.includes(entry.name)) return entry;   // p.ej. 'build/icon.png' sin permitir todo 'build/'
  return false;
}
```
`next.config.*` se resuelve enumerando los 3 nombres posibles en vez de un glob (evita depender
de una librería de globs nueva); si en el futuro cambia el nombre real del archivo
(`next.config.ts` hoy, confirmado en `front/next.config.ts`), sigue cubierto por la lista.

## 2. Cambios por builder

### `web-zip.ts`
- `assembleZip`: sustituir el filtro `APP_EXCLUDED` (denylist) por
  `allowlistFilter(entry, WEB_ALLOWLIST)` en el `archive.directory(tmpDir, 'app', ...)`.
  `shared/` sigue empaquetándose aparte sin cambios (ya es su propio árbol, no pasa por el
  allowlist de `front/`).
- `schema.sql`/`schema.prisma`/`manifest.json`/`README.md` (generado por `renderReadme`) se
  siguen añadiendo con `archive.append(...)` sin cambios — son artefactos generados en memoria,
  no copiados de `front/`, así que el allowlist no los afecta. Nota: `README.md` generado por
  `renderReadme` se añade con `archive.append` a la raíz del ZIP; si `README.md` también existiera
  en `front/` real, el allowlist lo dejaría pasar en `app/README.md` sin colisión de nombre con el
  de la raíz (rutas distintas dentro del ZIP).
- `.env.local`: en vez de `if (config.api?.url) { fs.writeFileSync(...) }`, SIEMPRE
  `writeFreshEnvLocal(tmpFrontDir, buildEnvContent(config))` (ver §3 — escritor único; el builder
  no llama a `fs.writeFileSync` directamente), eliminando cualquier rama donde el archivo
  original sobreviva sin tocar.

### `apk.ts` / `ipa.ts`
- `assembleZip`: sustituir `MOBILE_EXCLUDED` por `allowlistFilter(entry, ANDROID_ALLOWLIST)` (apk)
  o `allowlistFilter(entry, IOS_ALLOWLIST)` (ipa) en ambos `archive.directory(...)` (mobile-src y
  shared se mantienen con su propia allowlist — `shared/` no necesita filtro adicional, ya es
  aparte). `ipa.ts` deja de llevar `android/` (hoy lo hace porque `MOBILE_EXCLUDED` es el mismo
  set para ambos; con allowlist cada uno declara la suya).
- `customizeCapacitorConfig` sin cambios (opera sobre la copia temporal antes del ensamblado).
- `.env.local`: mismo criterio que web-zip — siempre fresco, nunca copiado (ver §3).

### `exe.ts`
- `assembleZip`: sustituir `DESKTOP_EXCLUDED` por `allowlistFilter(entry, DESKTOP_ALLOWLIST,
  ['build/icon.png'])`. El segundo argumento (`extraFiles`) permite el archivo puntual
  `build/icon.png` sin abrir toda la carpeta `build/` (que en el repo original de desarrollo
  puede contener artefactos de compilación no deseados si algún día existiera). Esto corrige el
  bug: el icono escrito en `tmpFrontDir/build/icon.png` ahora sí sobrevive al filtro porque
  `entry.name === 'build/icon.png'` matchea `extraFiles`, aunque `'build'` no esté en
  `DESKTOP_ALLOWLIST`.
- `.env.local`: mismo criterio (§3).
- Sin `android/` (ya no estaba permitido bajo `DESKTOP_ALLOWLIST`, coherente con el problema
  descrito en la proposal).

## 3. `.env.local` siempre fresco (fuga de dev)

Nueva función compartida (mismo módulo o `export-temp-copy.ts`):
```
function buildEnvContent(config: TenantConfig, ...extensiones): string[] { ... }  // única fuente de las líneas
function writeFreshEnvLocal(tmpFrontDir: string, lines: string[]): void {
  fs.writeFileSync(path.join(tmpFrontDir, '.env.local'), lines.join('\n') + '\n', 'utf8');
}
```

**Regla de escritor único (single-writer).** `writeFreshEnvLocal`, alimentada por
`buildEnvContent(config)`, es el ÚNICO punto de TODO el pipeline de exportación que escribe
`.env.local`. Ningún builder, ni `createTempCopy`, ni ningún otro paso hace
`writeFileSync`/`appendFileSync` sobre ese archivo por su cuenta (el `appendFileSync` de
`NEXT_PUBLIC_TENANT_JSON` en `export-temp-copy.ts` se traslada a `buildEnvContent`). Las changes
que necesiten aportar variables adicionales (`crm-export-runtime-config`,
`crm-env-contract-tiers`) lo hacen EXTENDIENDO `buildEnvContent` (parámetro/hook documentado que
añade líneas al contenido), nunca escribiendo ni appendeando al archivo por sí mismas.

**Propiedad única de la emisión de `.env.example`.** El mismo módulo es también el único dueño de
`.env.example`: lo escribe fresco en `tmpFrontDir` antes del ensamblado (solo líneas placeholder,
generado en memoria, nunca copiado del `.env.example` real del repo, que podría arrastrar valores
de una sesión de desarrollo anterior), de modo que la entrada `.env.example` de cada allowlist
empaqueta siempre el archivo generado. Otras changes solo declaran QUÉ líneas placeholder deben
existir (vía la misma extensión de `buildEnvContent`/su equivalente de placeholders), no emiten
el archivo.
- Se llama SIEMPRE (no condicionado a `config.api?.url`) en los 4 builders, tras
  `createTempCopy`. Si `config.api.url` no existe, `lines` queda vacío o con un placeholder
  (`# NEXT_PUBLIC_API_URL sin configurar`), nunca se deja pasar el `.env.local` real copiado por
  `createTempCopy`.
- `createTempCopy` (`export-temp-copy.ts`) puede seguir copiando el `.env.local` de origen dentro
  de la copia temporal SIN que eso sea un problema, porque cada builder lo sobreescribe
  incondicionalmente antes de armar el ZIP. Alternativa más defensiva (recomendada): añadir
  `.env.local` a `EXCLUDED` en `export-temp-copy.ts` (línea 32) para que ni siquiera exista en la
  copia temporal antes de que el builder escriba el suyo — doble barrera, más barato que confiar
  solo en la sobreescritura de cada builder. Se decide en tareas (WU2) cuál de las dos capas se
  implementa primero; ambas son compatibles y no se excluyen.
- La lógica de reemplazo `localhost → IP LAN` (líneas 113-122 de `export-temp-copy.ts`) deja de
  tener sentido si `.env.local` de origen ya no llega a la copia (o se sobreescribe siempre):
  se traslada a `writeFreshEnvLocal` si `NEXT_PUBLIC_API_URL` apunta a `localhost` (mismo
  propósito, sin depender del contenido del `.env.local` de origen).

## 4. `export-compat.ts`

`applyExportCompat(frontDir)` sigue operando sobre la copia temporal ANTES del ensamblado (borra
`app/api/`, rutas dinámicas, parchea `next.config.*`). El orden de operaciones no cambia:
1. `createTempCopy` (copia + `.env.local` fresco, §3)
2. `applyExportCompat` (solo apk/exe/ipa)
3. Personalización (`customizeCapacitorConfig`, icono)
4. `assembleZip` con el allowlist correspondiente (§2)

El allowlist se aplica DESPUÉS de `applyExportCompat`: si `applyExportCompat` ya borró
`app/api/`, el allowlist simplemente no encuentra esa ruta (ya no existe en la copia), sin
conflicto. No se requiere cambio en `export-compat.ts` para este change (fuera de alcance el
hallazgo `next.config.mjs` vs `next.config.ts`, ver nota en `proposal.md`).

## 5. Archivos afectados

| Archivo | Cambio |
|---|---|
| `back/src/lib/export-builders/manifest-allowlist.ts` | Nuevo: 4 allowlists literales independientes (sin constante compartida) + `allowlistFilter` + `buildEnvContent`/`writeFreshEnvLocal` (escritor único de `.env.local`, emisor único de `.env.example`). |
| `back/src/lib/export-builders/web-zip.ts` | `assembleZip` usa `WEB_ALLOWLIST`; `.env.local` siempre fresco. |
| `back/src/lib/export-builders/apk.ts` | `assembleZip` usa `ANDROID_ALLOWLIST`; `.env.local` siempre fresco. |
| `back/src/lib/export-builders/ipa.ts` | `assembleZip` usa `IOS_ALLOWLIST` (sin `android`); `.env.local` siempre fresco. |
| `back/src/lib/export-builders/exe.ts` | `assembleZip` usa `DESKTOP_ALLOWLIST` + `extraFiles=['build/icon.png']`; `.env.local` siempre fresco. |
| `back/src/lib/export-temp-copy.ts` | (opcional, WU2) añadir `.env.local` a `EXCLUDED` como segunda barrera. |

## 6. Data flow (sin cambios de alto nivel)
`POST /api/exports` → `export-job-manager` → `createTempCopy` (copia + `.env.local` fresco) →
[`applyExportCompat` si apk/exe/ipa] → personalización por builder → `assembleZip` con
allowlist → ZIP en `outputDir` → `GET /:id/download`. No cambia el contrato HTTP de
`back/src/routes/exports.ts`.

## 7. Estrategia de test
- Test unitario por builder: dado un `frontDir` de fixture con carpetas "prohibidas"
  (`openspec/`, `e2e/`, `tests/`, `.git`-like, `android/`+`electron/` cruzados, `.env.local` con
  un secreto de prueba), tras `build*(...)`, inspeccionar las entradas del ZIP resultante
  (`yauzl`/`unzipper` o re-leer con `archiver`'s output vía librería de lectura de zip ya presente
  en devDependencies si existe, o listar con `unzip -l` en el test de Node) y afirmar:
  - No aparece ninguna entrada bajo `openspec/`, `e2e/`, `tests/`, `test-results/`,
    `vitest.*`, `playwright.config.ts`, `eslint.config.mjs`, `.gitignore`, `.npmrc`,
    `tsconfig.tsbuildinfo`.
  - `web-zip` no contiene `android/` ni `electron/`; `apk` no contiene `electron/`; `ipa` no
    contiene `android/`; `exe` no contiene `android/`.
  - El `.env.local` empaquetado NUNCA contiene el secreto de prueba inyectado en el fixture
    (asserts sobre el contenido leído del ZIP).
  - `exe`: con `branding.logoImage` presente, `build/icon.png` SÍ aparece en el ZIP
    (`desktop-src/build/icon.png`).
- Anti-drift (WU1.3): test snapshot/assert por formato que fija las entradas de primer nivel
  EXACTAS esperadas en el ZIP de cada builder (web/apk/ipa/exe). Al no existir constante
  compartida entre las 4 allowlists, este test es la barrera contra el drift: un archivo "core"
  añadido a una lista y olvidado en las otras tres deja los snapshots de esos formatos sin el
  archivo esperado, y el diff de snapshots lo hace visible en revisión.
- Regresión: `web-zip` sigue conteniendo `schema.sql`, `schema.prisma`, `manifest.json`,
  `README.md` en la raíz; `apk`/`ipa` siguen conteniendo `capacitor.config.ts` y
  `mobile-src/android` (solo apk) tras `customizeCapacitorConfig`.
- `tsc` limpio en `back/` tras el cambio (los builders exportan las mismas firmas públicas
  `buildWebZip`/`buildApk`/`buildExe`/`buildIpa`, sin romper `export-job-manager.ts` que los
  invoca).
