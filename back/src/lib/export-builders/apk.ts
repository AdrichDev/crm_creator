/**
 * back/src/lib/export-builders/apk.ts
 *
 * Android ZIP = app Next.js estatica preparada como codigo fuente para Capacitor.
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
  return `# Proyecto Android para ${productName}

## Instrucciones de Compilacion Local

1. Instalar dependencias:
   \`npm install\`

2. Compilar la aplicacion web de Next.js:
   \`npm run build\`

3. Sincronizar con Capacitor (copia la web compilada al proyecto de Android):
   \`npx cap sync android\`

4. Abrir en Android Studio para compilar y firmar tu APK/AAB:
   \`npx cap open android\`
   (O puedes compilar via CLI usando ./android/gradlew assembleRelease)
`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&apos;')
    .replace(/"/g, '&quot;');
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

  const gradlePath = path.join(frontDir, 'android', 'app', 'build.gradle');
  if (fs.existsSync(gradlePath)) {
    let gradle = fs.readFileSync(gradlePath, 'utf8');
    gradle = gradle.replace(/applicationId\s+"[^"]*"/, `applicationId "${appId}"`);
    fs.writeFileSync(gradlePath, gradle, 'utf8');
  }

  const stringsPath = path.join(
    frontDir,
    'android',
    'app',
    'src',
    'main',
    'res',
    'values',
    'strings.xml',
  );
  if (fs.existsSync(stringsPath)) {
    let strings = fs.readFileSync(stringsPath, 'utf8');
    const escapedName = escapeXml(appName);
    strings = strings.replace(
      /(<string name="app_name">)[^<]*(<\/string>)/,
      `$1${escapedName}$2`,
    );
    strings = strings.replace(
      /(<string name="title_activity_main">)[^<]*(<\/string>)/,
      `$1${escapedName}$2`,
    );
    fs.writeFileSync(stringsPath, strings, 'utf8');
  }
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

export interface ApkDeps {
  spawn?: typeof nodeSpawn;
  createTempCopy?: typeof defaultCreateTempCopy;
  cleanupTempCopy?: typeof defaultCleanupTempCopy;
  applyExportCompat?: typeof defaultApplyExportCompat;
  platform?: NodeJS.Platform;
}

export async function buildApk(
  config: TenantConfig,
  frontDir: string,
  outputDir: string,
  emit: Emitter,
  signal?: AbortSignal,
  deps: ApkDeps = {},
): Promise<BuildResult> {
  const createTempCopy = deps.createTempCopy ?? defaultCreateTempCopy;
  const cleanupTempCopy = deps.cleanupTempCopy ?? defaultCleanupTempCopy;
  const applyExportCompat = deps.applyExportCompat ?? defaultApplyExportCompat;

  const productName = config.business.name;
  const slug = toSlug(productName);
  const appId = toAppId(slug);

  let rootDir: string | undefined;

  try {
    emit({ type: 'progress', format: 'apk', step: 'Copiando proyecto fuente...', pct: 10 });
    const copy = await createTempCopy(frontDir, config);
    rootDir = copy.rootDir;
    const tmpFrontDir = copy.frontDir;

    const removed = applyExportCompat(tmpFrontDir);
    emit({
      type: 'progress',
      format: 'apk',
      step: `Aplicando reglas estaticas (${removed.length} rutas excluidas)...`,
      pct: 30,
    });

    customizeCapacitorConfig(tmpFrontDir, appId, productName);

    if (config.branding?.logoImage) {
      try {
        const base64Data = config.branding.logoImage.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        const mipmapDirs = ['mipmap-mdpi', 'mipmap-hdpi', 'mipmap-xhdpi', 'mipmap-xxhdpi', 'mipmap-xxxhdpi'];
        for (const dir of mipmapDirs) {
          const resDir = path.join(tmpFrontDir, 'android', 'app', 'src', 'main', 'res', dir);
          if (fs.existsSync(resDir)) {
            fs.writeFileSync(path.join(resDir, 'ic_launcher.png'), buffer);
            fs.writeFileSync(path.join(resDir, 'ic_launcher_round.png'), buffer);
            fs.writeFileSync(path.join(resDir, 'ic_launcher_foreground.png'), buffer);
          }
        }
        emit({ type: 'progress', format: 'apk', step: 'Icono personalizado inyectado...', pct: 40 });
      } catch (e) {
        console.warn('No se pudo inyectar el icono:', e);
      }
    }

    if (config.api?.url) {
      fs.writeFileSync(path.join(tmpFrontDir, '.env.local'), `NEXT_PUBLIC_API_URL=${config.api.url}\n`, 'utf8');
    }

    emit({ type: 'progress', format: 'apk', step: 'Empaquetando codigo fuente en ZIP...', pct: 60 });
    fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `${slug}-android-src.zip`);
    const readme = renderReadme(productName);

    await assembleZip(tmpFrontDir, outputPath, { readme });

    emit({ type: 'progress', format: 'apk', step: 'Guardando archivo ZIP...', pct: 100, outputPath });
    return { success: true, outputPath };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    emit({ type: 'format-error', format: 'apk', message: error });
    return { success: false, error };
  } finally {
    if (rootDir) cleanupTempCopy(rootDir);
  }
}
