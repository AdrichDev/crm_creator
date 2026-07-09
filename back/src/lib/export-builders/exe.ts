/**
 * back/src/lib/export-builders/exe.ts
 *
 * Escritorio ZIP = app Next.js estatica preparada como codigo fuente para Electron.
 *
 * Flujo:
 *   createTempCopy -> applyExportCompat -> empaquetar ZIP del codigo fuente.
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

const DESKTOP_EXCLUDED = new Set(['node_modules', '.next', 'out', 'dist-electron', 'build']);

function toSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

function renderReadme(productName: string): string {
  return `# ${productName} — Windows

## Compilar .exe (CLI)

1. Entrar en la carpeta del codigo e instalar dependencias:
   \`cd desktop-src\`
   \`npm install\`

2. Compilar la web estatica de Next.js (salida en \`out/\`):
   \`npm run build:static\`

3. Generar el ejecutable con electron-builder:
   \`npx electron-builder --win -c.productName="${productName}"\`

Los ejecutables (.exe portable e instalador) quedan en \`dist-electron/\`.
`;
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

    archive.directory(frontDir, 'desktop-src', (entry: EntryData) => {
      const segs = entry.name.split(/[\\/]/);
      return segs.some((s) => DESKTOP_EXCLUDED.has(s)) ? false : entry;
    });

    // shared/ en la raiz del ZIP: front importa `../../../shared/generate/*`
    // (desde desktop-src/lib/generate/*), que resuelve a la raiz de extraccion.
    // Sin esta carpeta el `next build` del proyecto exportado falla con
    // "Cannot find module '../../../shared/generate/build-sql'".
    if (fs.existsSync(sharedDir)) {
      archive.directory(sharedDir, 'shared', (entry: EntryData) => {
        const segs = entry.name.split(/[\\/]/);
        return segs.some((s) => DESKTOP_EXCLUDED.has(s)) ? false : entry;
      });
    }

    archive.append(artifacts.readme, { name: 'README.md' });

    void archive.finalize();
  });
}

export interface ExeDeps {
  spawn?: typeof nodeSpawn;
  createTempCopy?: typeof defaultCreateTempCopy;
  cleanupTempCopy?: typeof defaultCleanupTempCopy;
  applyExportCompat?: typeof defaultApplyExportCompat;
  platform?: NodeJS.Platform;
}

export async function buildExe(
  config: TenantConfig,
  frontDir: string,
  outputDir: string,
  emit: Emitter,
  signal?: AbortSignal,
  deps: ExeDeps = {},
): Promise<BuildResult> {
  const createTempCopy = deps.createTempCopy ?? defaultCreateTempCopy;
  const cleanupTempCopy = deps.cleanupTempCopy ?? defaultCleanupTempCopy;
  const applyExportCompat = deps.applyExportCompat ?? defaultApplyExportCompat;

  const productName = config.business.name;
  const slug = toSlug(productName);

  let rootDir: string | undefined;

  try {
    emit({ type: 'progress', format: 'exe', step: 'Copiando proyecto fuente...', pct: 10 });
    const copy = await createTempCopy(frontDir, config);
    rootDir = copy.rootDir;
    const tmpFrontDir = copy.frontDir;
    const tmpSharedDir = path.join(copy.rootDir, 'shared');

    const removed = applyExportCompat(tmpFrontDir);
    emit({
      type: 'progress',
      format: 'exe',
      step: `Aplicando reglas estaticas (${removed.length} rutas excluidas)...`,
      pct: 30,
    });

    if (config.branding?.logoImage) {
      try {
        const base64Data = config.branding.logoImage.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        const buildDir = path.join(tmpFrontDir, 'build');
        fs.mkdirSync(buildDir, { recursive: true });
        fs.writeFileSync(path.join(buildDir, 'icon.png'), buffer);
        emit({ type: 'progress', format: 'exe', step: 'Icono personalizado inyectado...', pct: 40 });
      } catch (e) {
        console.warn('No se pudo inyectar el icono:', e);
      }
    }

    if (config.api?.url) {
      fs.writeFileSync(path.join(tmpFrontDir, '.env.local'), `NEXT_PUBLIC_API_URL=${config.api.url}\n`, 'utf8');
    }

    emit({ type: 'progress', format: 'exe', step: 'Empaquetando codigo fuente en ZIP...', pct: 60 });
    fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `${slug}-desktop-src.zip`);
    const readme = renderReadme(productName);

    await assembleZip(tmpFrontDir, tmpSharedDir, outputPath, { readme });

    emit({ type: 'progress', format: 'exe', step: 'Guardando archivo ZIP...', pct: 100, outputPath });
    return { success: true, outputPath };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    emit({ type: 'format-error', format: 'exe', message: error });
    return { success: false, error };
  } finally {
    if (rootDir) cleanupTempCopy(rootDir);
  }
}
