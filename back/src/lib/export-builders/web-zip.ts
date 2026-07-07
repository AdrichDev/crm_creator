/**
 * back/src/lib/export-builders/web-zip.ts
 *
 * Web ZIP = aplicacion Next.js completa lista para produccion.
 *
 * Flujo (D5 del design):
 *   createTempCopy → npm ci → `next build` con NEXT_OUTPUT_MODE=standalone
 *   → ensamblar `<slug>-web.zip` con `archiver`:
 *       app/        fuente del tmp (sin node_modules/.next/out, CON .env.local)
 *       standalone/ .next/standalone/* + .next/static (recolocado) + public/
 *       schema.sql · schema.prisma · manifest.json · README.md
 *
 * Emite progreso granular y limpia la copia temporal en finally.
 *
 * Tambien re-exporta ProgressEvent, BuildResult y Emitter (tipos compartidos
 * por todos los builders).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn as nodeSpawn } from 'node:child_process';
import { spawnAsync } from '../spawn-async.js';

// `archiver` publica sus tipos con `export =`; se carga via createRequire para
// obtener la funcion invocable de forma portable con moduleResolution Bundler.
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
  runNpmCi as defaultRunNpmCi,
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
  const templatePath = path.join(__dirname_, '../export-templates/readme-web.md');
  const template = fs.readFileSync(templatePath, 'utf8');
  return template.replace(/\{\{PRODUCT_NAME\}\}/g, productName);
}

// ---------------------------------------------------------------------------
// Dependencias inyectables (para test)
// ---------------------------------------------------------------------------

export interface WebZipDeps {
  spawn?: typeof nodeSpawn;
  createTempCopy?: typeof defaultCreateTempCopy;
  cleanupTempCopy?: typeof defaultCleanupTempCopy;
  runNpmCi?: typeof defaultRunNpmCi;
}

/**
 * Spawn de `next build` con NEXT_OUTPUT_MODE inyectado SOLO en el env del
 * proceso (no se escribe en .env.local, para no contaminar `app/`).
 */
async function runNextBuild(
  spawnFn: typeof nodeSpawn | undefined,
  tmpDir: string,
  signal: AbortSignal | undefined,
): Promise<void> {
  // spawnAsync centraliza el fix Windows (cmd /c) y la gestion del AbortSignal.
  const res = await spawnAsync('npx', ['next', 'build'], {
    cwd: tmpDir,
    signal,
    spawn: spawnFn,
    env: { ...process.env, NEXT_OUTPUT_MODE: 'standalone' },
  });
  if (res.exitCode !== 0) {
    throw new Error('next build fallo: ' + res.stderr.slice(-500));
  }
}

/**
 * Ensambla el ZIP final con archiver (streaming). Devuelve una promesa que se
 * resuelve cuando el fichero esta escrito por completo.
 */
async function assembleZip(
  tmpDir: string,
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

    // standalone/ — app autocontenida segun la doc oficial de Next.
    const standaloneDir = path.join(tmpDir, '.next', 'standalone');
    const staticDir = path.join(tmpDir, '.next', 'static');
    const publicDir = path.join(tmpDir, 'public');

    archive.directory(standaloneDir, 'standalone');
    // `.next/static` debe recolocarse dentro de standalone/.next/static.
    archive.directory(staticDir, 'standalone/.next/static');
    // public/ (si existe) va a standalone/public.
    if (fs.existsSync(publicDir)) {
      archive.directory(publicDir, 'standalone/public');
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
 * Construye `<slug>-web.zip`: app Next.js standalone + fuente + schema + README.
 *
 * @param config    - Configuracion del tenant a hornear en la copia.
 * @param frontDir  - Ruta absoluta al proyecto front/.
 * @param outputDir - Carpeta donde se escribe el .zip.
 * @param emit      - Emisor de progreso.
 * @param signal    - Señal de aborto opcional.
 * @param deps      - Inyeccion de dependencias (para test).
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
  const runNpmCi = deps.runNpmCi ?? defaultRunNpmCi;
  const spawnFn = deps.spawn ?? nodeSpawn;

  let rootDir: string | undefined;

  try {
    emit({ type: 'progress', format: 'web-zip', step: 'Copiando proyecto...', pct: 5 });
    // createTempCopy replica front/ + shared/ bajo la misma raiz del tmp: front/
    // importa `shared/generate/*` via rutas relativas y necesita ese layout
    // para que `next build` resuelva los imports (bug detectado en gate 3.V).
    const copy = await createTempCopy(frontDir, config);
    rootDir = copy.rootDir;
    const tmpFrontDir = copy.frontDir;

    // Instala dependencias (emite su propio progreso, ~25%) — cwd = front/ del tmp.
    await runNpmCi(tmpFrontDir, emit, signal);

    emit({ type: 'progress', format: 'web-zip', step: 'Compilando (next build)...', pct: 45 });
    await runNextBuild(spawnFn, tmpFrontDir, signal);

    emit({ type: 'progress', format: 'web-zip', step: 'Generando esquema y manifest...', pct: 75 });
    const sql = buildSql(config);
    const prisma = buildPrisma(config);
    const manifest = JSON.stringify(buildManifest(config), null, 2);
    const readme = renderReadme(config.business.name);

    emit({ type: 'progress', format: 'web-zip', step: 'Empaquetando ZIP...', pct: 85 });
    fs.mkdirSync(outputDir, { recursive: true });
    const slug = toSlug(config.business.name);
    const outputPath = path.join(outputDir, `${slug}-web.zip`);

    await assembleZip(tmpFrontDir, outputPath, { sql, prisma, manifest, readme });

    emit({ type: 'progress', format: 'web-zip', step: 'Guardando archivo...', pct: 100, outputPath });
    return { success: true, outputPath };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    emit({ type: 'format-error', format: 'web-zip', message: error });
    return { success: false, error };
  } finally {
    // rootDir cubre front/ + shared/ del tmp; el ZIP `app/` sale solo de frontDir.
    if (rootDir) cleanupTempCopy(rootDir);
  }
}
