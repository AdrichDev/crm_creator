/**
 * back/src/lib/export-builders/web-zip.ts
 *
 * Web ZIP = codigo fuente de la aplicacion Next.js lista para alojar (SaaS Puro).
 *
 * Flujo:
 *   createTempCopy -> empaquetar ZIP del codigo fuente junto con schemas y README.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn as nodeSpawn } from 'node:child_process';

const require = createRequire(import.meta.url);
type Archiver = import('archiver').Archiver;
type EntryData = import('archiver').EntryData;
type ArchiverFactory = (
  format: 'zip' | 'tar',
  options?: { zlib?: { level?: number } },
) => Archiver;
const archiver = require('archiver') as ArchiverFactory;

import { buildSql } from '../../../../shared/generate/build-sql.js';
import { buildPrisma } from '../../../../shared/generate/build-prisma.js';
import { buildManifest } from '../../../../shared/generate/build-manifest.js';
import type { TenantConfig } from '../../../../shared/generate/tenant-types.js';
import {
  createTempCopy as defaultCreateTempCopy,
  cleanupTempCopy as defaultCleanupTempCopy,
} from '../export-temp-copy.js';

// ---------------------------------------------------------------------------
// Exported types (shared across all builders)
// ---------------------------------------------------------------------------

export interface ProgressEvent {
  type: string;
  format?: string;
  step?: string;
  pct?: number;
  outputPath?: string;
  message?: string;
  results?: unknown[];
}

export type BuildResult =
  | { success: true; outputPath: string }
  | { success: false; error: string };

export type Emitter = (event: ProgressEvent) => void;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const __dirname_ = path.dirname(fileURLToPath(import.meta.url));

// Carpetas que NUNCA entran en `app/` (builds y dependencias).
const APP_EXCLUDED = new Set(['node_modules', '.next', 'out']);

function toSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

/** Lee la plantilla README y sustituye los placeholders del tenant. */
function renderReadme(productName: string): string {
  return `# ${productName} — Web

## Compilar y ejecutar (CLI)

1. Entrar en la carpeta del codigo e instalar dependencias:
   \`cd app\`
   \`npm install\`

2. Compilar para produccion:
   \`npm run build\`

3. Ejecutar (sirve en http://localhost:3002):
   \`npm start\`

*Nota: tambien puedes alojar el codigo fuente en Vercel conectando un repositorio de Git.*
`;
}

// ---------------------------------------------------------------------------
// Dependencias inyectables (para test)
// ---------------------------------------------------------------------------

export interface WebZipDeps {
  spawn?: typeof nodeSpawn;
  createTempCopy?: typeof defaultCreateTempCopy;
  cleanupTempCopy?: typeof defaultCleanupTempCopy;
  runNpmCi?: any;
}

/**
 * Ensambla el ZIP final con archiver (streaming).
 */
async function assembleZip(
  tmpDir: string,
  sharedDir: string,
  outputPath: string,
  artifacts: { sql: string; prisma: string; manifest: string; readme: string },
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

    // app/ — fuente completa sin node_modules/.next/out, pero CON .env.local.
    archive.directory(tmpDir, 'app', (entry: EntryData) => {
      const top = entry.name.split(/[\\/]/)[0];
      return APP_EXCLUDED.has(top) ? false : entry;
    });

    // shared/ en la raiz del ZIP: front importa `../../../shared/generate/*`
    // (desde app/lib/generate/*), que resuelve a la raiz de extraccion. Sin
    // esta carpeta el `next build` del proyecto exportado falla con
    // "Cannot find module '../../../shared/generate/build-sql'".
    if (fs.existsSync(sharedDir)) {
      archive.directory(sharedDir, 'shared', (entry: EntryData) => {
        const top = entry.name.split(/[\\/]/)[0];
        return APP_EXCLUDED.has(top) ? false : entry;
      });
    }

    // Artefactos generados en la raiz del ZIP.
    archive.append(artifacts.sql, { name: 'schema.sql' });
    archive.append(artifacts.prisma, { name: 'schema.prisma' });
    archive.append(artifacts.manifest, { name: 'manifest.json' });
    archive.append(artifacts.readme, { name: 'README.md' });

    void archive.finalize();
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Construye `<slug>-web-src.zip`: codigo fuente + schema + README.
 */
export async function buildWebZip(
  config: TenantConfig,
  frontDir: string,
  outputDir: string,
  emit: Emitter,
  signal?: AbortSignal,
  deps: WebZipDeps = {},
): Promise<BuildResult> {
  const createTempCopy = deps.createTempCopy ?? defaultCreateTempCopy;
  const cleanupTempCopy = deps.cleanupTempCopy ?? defaultCleanupTempCopy;

  let rootDir: string | undefined;

  try {
    emit({ type: 'progress', format: 'web-zip', step: 'Copiando proyecto fuente...', pct: 15 });
    const copy = await createTempCopy(frontDir, config);
    rootDir = copy.rootDir;
    const tmpFrontDir = copy.frontDir;
    const tmpSharedDir = path.join(copy.rootDir, 'shared');

    if (config.api?.url) {
      fs.writeFileSync(path.join(tmpFrontDir, '.env.local'), `NEXT_PUBLIC_API_URL=${config.api.url}\n`, 'utf8');
    }

    emit({ type: 'progress', format: 'web-zip', step: 'Generando esquema y manifest...', pct: 40 });
    const sql = buildSql(config);
    const prisma = buildPrisma(config);
    const manifest = JSON.stringify(buildManifest(config), null, 2);
    const readme = renderReadme(config.business.name);

    emit({ type: 'progress', format: 'web-zip', step: 'Empaquetando codigo fuente en ZIP...', pct: 70 });
    fs.mkdirSync(outputDir, { recursive: true });
    const slug = toSlug(config.business.name);
    const outputPath = path.join(outputDir, `${slug}-web-src.zip`);

    await assembleZip(tmpFrontDir, tmpSharedDir, outputPath, { sql, prisma, manifest, readme });

    emit({ type: 'progress', format: 'web-zip', step: 'Guardando archivo ZIP...', pct: 100, outputPath });
    return { success: true, outputPath };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    emit({ type: 'format-error', format: 'web-zip', message: error });
    return { success: false, error };
  } finally {
    if (rootDir) cleanupTempCopy(rootDir);
  }
}
