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

const MOBILE_EXCLUDED = new Set(['node_modules', '.next', 'out', 'build', '.gradle']);

function toSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

function toAppId(slug: string): string {
  const suffix = slug.replace(/[^a-z0-9]/g, '') || 'app';
  return `com.operaos.${suffix}`;
}

function renderReadme(productName: string): string {
  return `# ${productName} — iOS

> **Requisito:** iOS solo se compila en macOS con Xcode (politica de Apple).
> Este ZIP contiene el codigo fuente; el proyecto Xcode (\`ios/\`) se genera en tu Mac.

## Proceso completo de compilacion (macOS)

1. Entrar en la carpeta del codigo e instalar dependencias:
   \`cd mobile-src\`
   \`npm install\`

2. Anadir el plugin de iOS de Capacitor (no viene preinstalado):
   \`npm install @capacitor/ios\`

3. Compilar la web estatica de Next.js (salida en \`out/\`):
   \`npm run build:static\`

4. Crear el proyecto Xcode de iOS (requiere CocoaPods):
   \`npx cap add ios\`

5. Sincronizar la web compilada con el proyecto iOS:
   \`npx cap sync ios\`

6. Compilar el .ipa:

   **Opcion A — Xcode (recomendada):**
   \`npx cap open ios\` y luego Product > Archive > Distribute App

   **Opcion B — CLI (con firma ya configurada):**
   \`cd ios/App\`
   \`xcodebuild -workspace App.xcworkspace -scheme App -configuration Release -archivePath build/App.xcarchive archive\`
   \`xcodebuild -exportArchive -archivePath build/App.xcarchive -exportPath build -exportOptionsPlist ExportOptions.plist\`
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

    archive.directory(frontDir, 'mobile-src', (entry: EntryData) => {
      const segs = entry.name.split(/[\\/]/);
      return segs.some((s) => MOBILE_EXCLUDED.has(s)) ? false : entry;
    });

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

    const removed = applyExportCompat(tmpFrontDir);
    emit({
      type: 'progress',
      format: 'ipa',
      step: `Aplicando reglas estaticas (${removed.length} rutas excluidas)...`,
      pct: 30,
    });

    customizeCapacitorConfig(tmpFrontDir, appId, productName);

    if (config.api?.url) {
      fs.writeFileSync(path.join(tmpFrontDir, '.env.local'), `NEXT_PUBLIC_API_URL=${config.api.url}\n`, 'utf8');
    }

    emit({ type: 'progress', format: 'ipa', step: 'Empaquetando codigo fuente en ZIP...', pct: 60 });
    fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `${slug}-ios-src.zip`);
    const readme = renderReadme(productName);

    await assembleZip(tmpFrontDir, outputPath, { readme });

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
