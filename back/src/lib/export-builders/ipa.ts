/**
 * back/src/lib/export-builders/ipa.ts
 *
 * iOS ZIP = app Next.js estatica preparada como codigo fuente para Capacitor.
 *
 * Flujo:
 *   createTempCopy -> applyExportCompat -> personalizar capacitor.config.ts
 *   -> empaquetar ZIP del codigo fuente.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn as nodeSpawn } from 'node:child_process';
import { applyExportCompat as defaultApplyExportCompat } from '../export-compat.js';
import {
  createTempCopy as defaultCreateTempCopy,
  cleanupTempCopy as defaultCleanupTempCopy,
} from '../export-temp-copy.js';
import {
  IOS_ALLOWLIST,
  allowlistFilter,
  buildEnvContent,
  writeFreshEnvLocal,
  buildEnvExampleContent,
  writeFreshEnvExample,
} from './manifest-allowlist.js';
import {
  buildRuntimeConfigEnvLines,
  RUNTIME_CONFIG_ENV_EXAMPLE_LINES,
  type RuntimeConfig,
} from './runtime-config-env.js';
import type { TenantConfig } from '../../../../shared/generate/tenant-types.js';
import type { Emitter, BuildResult } from './web-zip.js';

export type { Emitter, BuildResult };

const require = createRequire(import.meta.url);
type Archiver = import('archiver').Archiver;
type EntryData = import('archiver').EntryData;
type ArchiverFactory = (
  format: 'zip' | 'tar',
  options?: { zlib?: { level?: number } },
) => Archiver;
const archiver = require('archiver') as ArchiverFactory;

const __dirname_ = path.dirname(fileURLToPath(import.meta.url));

// shared/ no pasa por el allowlist de front/ (design.md §2, "sin cambios");
// createTempCopy ya la copia sin node_modules/.next/out, segunda barrera.
const SHARED_EXCLUDED = new Set(['node_modules', '.next', 'out', 'build', '.gradle']);

function toSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

function toAppId(slug: string): string {
  const suffix = slug.replace(/[^a-z0-9]/g, '') || 'app';
  return `com.operaos.${suffix}`;
}

function renderReadme(productName: string): string {
  return `# ${productName} — iOS (.ipa)

> **Requisito imprescindible:** iOS **solo** se puede compilar en **macOS con
> Xcode**. Es una politica de Apple: no existe forma soportada de generar un
> \`.ipa\` en Windows o Linux. Este ZIP contiene el codigo fuente; el proyecto
> Xcode (\`ios/\`) se genera en tu Mac durante los pasos de abajo.

## Que es esto

Este ZIP contiene el codigo fuente para generar la **app de iOS**. Por dentro es
tu misma aplicacion web, empaquetada con Capacitor dentro de un proyecto nativo
de iOS que se compila y firma con Xcode.

## Requisitos previos

- **macOS** con **Xcode** instalado (desde la Mac App Store).
- **CocoaPods** (gestor de dependencias nativas). Se instala con
  \`sudo gem install cocoapods\`.
- **Node.js 22** (comprueba con \`node --version\`).
- Una **cuenta de Apple Developer**, necesaria para firmar y distribuir la app
  (tanto para pruebas en dispositivo real como para la App Store).

## Proceso completo de compilacion (en tu Mac)

1. **Entrar en la carpeta del codigo:**
   \`\`\`
   cd mobile-src
   \`\`\`

2. **Instalar las dependencias** del proyecto (solo la primera vez):
   \`\`\`
   npm install
   \`\`\`

3. **Anadir el plugin de iOS de Capacitor.** No viene preinstalado para no
   arrastrar dependencias de Apple en entornos que no son Mac:
   \`\`\`
   npm install @capacitor/ios
   \`\`\`

4. **Compilar la web estatica.** Genera la carpeta \`out/\` que Capacitor
   empaqueta dentro de la app:
   \`\`\`
   npm run build:static
   \`\`\`

5. **Crear el proyecto Xcode de iOS.** Genera la carpeta \`ios/\` con el proyecto
   nativo (aqui se ejecutan tambien las tareas de CocoaPods):
   \`\`\`
   npx cap add ios
   \`\`\`

6. **Sincronizar la web compilada con el proyecto iOS.** Copia el contenido de
   \`out/\` al proyecto nativo:
   \`\`\`
   npx cap sync ios
   \`\`\`

7. **Compilar y firmar el \`.ipa\`.** Tienes dos opciones:

   **Opcion A — Xcode (recomendada).** Abre el proyecto en Xcode:
   \`\`\`
   npx cap open ios
   \`\`\`
   Dentro de Xcode:
   - En **Signing & Capabilities**, selecciona tu **equipo de firma** (tu
     cuenta de Apple Developer).
   - Menu **Product > Archive** para compilar el archivo de distribucion.
   - Pulsa **Distribute App** y sigue el asistente para exportar el \`.ipa\`
     (o subirlo directamente a la App Store / TestFlight).

   **Opcion B — Linea de comandos** (solo si ya tienes la firma configurada y un
   archivo \`ExportOptions.plist\` preparado):
   \`\`\`
   cd ios/App
   xcodebuild -workspace App.xcworkspace -scheme App -configuration Release -archivePath build/App.xcarchive archive
   xcodebuild -exportArchive -archivePath build/App.xcarchive -exportPath build -exportOptionsPlist ExportOptions.plist
   \`\`\`

## Nota sobre la firma en iOS

A diferencia de Android (que usa un *keystore*), iOS firma con tu **certificado
de desarrollador** mas un **provisioning profile**, ambos gestionados desde tu
cuenta de Apple Developer. Xcode puede gestionarlos automaticamente si activas
"Automatically manage signing" en Signing & Capabilities.
`;
}

function customizeCapacitorConfig(
  frontDir: string,
  appId: string,
  appName: string,
): void {
  const configPath = path.join(frontDir, 'capacitor.config.ts');
  const content =
    `import type { CapacitorConfig } from '@capacitor/cli';\n\n` +
    `// Config horneada por el exportador para este tenant.\n` +
    `const config: CapacitorConfig = {\n` +
    `  appId: ${JSON.stringify(appId)},\n` +
    `  appName: ${JSON.stringify(appName)},\n` +
    `  webDir: 'out',\n` +
    `};\n\n` +
    `export default config;\n`;
  fs.writeFileSync(configPath, content, 'utf8');
}

async function assembleZip(
  frontDir: string,
  sharedDir: string,
  outputPath: string,
  artifacts: { readme: string },
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const outStream = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    outStream.on('close', () => resolve());
    outStream.on('error', reject);
    archive.on('error', reject);
    archive.on('warning', (err: NodeJS.ErrnoException) => {
      if (err.code !== 'ENOENT') reject(err);
    });

    archive.pipe(outStream);

    archive.directory(frontDir, 'mobile-src', (entry: EntryData) =>
      allowlistFilter(entry, IOS_ALLOWLIST),
    );

    // shared/ en la raiz del ZIP: front importa `../../../shared/generate/*`
    // (desde mobile-src/lib/generate/*), que resuelve a la raiz de extraccion.
    // Sin esta carpeta el `next build` del proyecto exportado falla con
    // "Cannot find module '../../../shared/generate/build-sql'".
    if (fs.existsSync(sharedDir)) {
      archive.directory(sharedDir, 'shared', (entry: EntryData) => {
        const segs = entry.name.split(/[\\/]/);
        return segs.some((s) => SHARED_EXCLUDED.has(s)) ? false : entry;
      });
    }

    archive.append(artifacts.readme, { name: 'README.md' });

    void archive.finalize();
  });
}

export interface IpaDeps {
  spawn?: typeof nodeSpawn;
  createTempCopy?: typeof defaultCreateTempCopy;
  cleanupTempCopy?: typeof defaultCleanupTempCopy;
  applyExportCompat?: typeof defaultApplyExportCompat;
  platform?: NodeJS.Platform;
  /** crm-export-runtime-config: cableado runtime de plataforma para este ZIP. */
  runtimeConfig?: RuntimeConfig;
}

export async function buildIpa(
  config: TenantConfig,
  frontDir: string,
  outputDir: string,
  emit: Emitter,
  signal?: AbortSignal,
  deps: IpaDeps = {},
): Promise<BuildResult> {
  const createTempCopy = deps.createTempCopy ?? defaultCreateTempCopy;
  const cleanupTempCopy = deps.cleanupTempCopy ?? defaultCleanupTempCopy;
  const applyExportCompat = deps.applyExportCompat ?? defaultApplyExportCompat;

  const productName = config.business.name;
  const slug = toSlug(productName);
  const appId = toAppId(slug);

  let rootDir: string | undefined;

  try {
    emit({ type: 'progress', format: 'ipa', step: 'Copiando proyecto fuente...', pct: 10 });
    const copy = await createTempCopy(frontDir, config);
    rootDir = copy.rootDir;
    const tmpFrontDir = copy.frontDir;
    const tmpSharedDir = path.join(copy.rootDir, 'shared');

    // .env.local/.env.example siempre frescos (nunca copiados del operador,
    // design.md §3 — writeFreshEnvLocal es el unico escritor del pipeline).
    // crm-export-runtime-config aporta PLATFORM_API_URL/TENANT_ID/TENANT_API_KEY
    // via el punto de extension `extraLines` (sin escritura directa aqui).
    writeFreshEnvLocal(
      tmpFrontDir,
      buildEnvContent(config, { extraLines: buildRuntimeConfigEnvLines(deps.runtimeConfig) }),
    );
    writeFreshEnvExample(
      tmpFrontDir,
      buildEnvExampleContent({ extraLines: [...RUNTIME_CONFIG_ENV_EXAMPLE_LINES] }),
    );

    const removed = applyExportCompat(tmpFrontDir);
    emit({
      type: 'progress',
      format: 'ipa',
      step: `Aplicando reglas estaticas (${removed.length} rutas excluidas)...`,
      pct: 30,
    });

    customizeCapacitorConfig(tmpFrontDir, appId, productName);

    emit({ type: 'progress', format: 'ipa', step: 'Empaquetando codigo fuente en ZIP...', pct: 60 });
    fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `${slug}-ios-src.zip`);
    const readme = renderReadme(productName);

    await assembleZip(tmpFrontDir, tmpSharedDir, outputPath, { readme });

    emit({ type: 'progress', format: 'ipa', step: 'Guardando archivo ZIP...', pct: 100, outputPath });
    return { success: true, outputPath };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    emit({ type: 'format-error', format: 'ipa', message: error });
    return { success: false, error };
  } finally {
    if (rootDir) cleanupTempCopy(rootDir);
  }
}
