/**
 * back/src/lib/export-builders/exe.ts
 *
 * Desktop ZIP (Windows) = app Next.js estatica empaquetada con Electron.
 *
 * Flujo (D6 del design):
 *   createTempCopy → applyExportCompat (quita app/api y paginas dinamicas de la
 *   copia, incompatibles con output:'export') → npm ci → `next build` con
 *   NEXT_OUTPUT_MODE=export (genera out/) → `electron-builder --win portable
 *   nsis` local via cmd /c (productName = nombre del tenant, por -c.productName)
 *   → localizar artefactos en dist-electron/ → ensamblar `<slug>-desktop.zip`
 *   con archiver:
 *       desktop-src/               fuente del tmp (sin node_modules/.next/out/dist-electron)
 *       <Product>-portable.exe     ejecutable portable
 *       <Product>-setup.exe        instalador NSIS
 *       README.md                  plantilla readme-desktop.md
 *
 * Emite progreso granular y limpia la copia temporal en finally.
 *
 * RNF-02: shell: false en todos los spawn (spawnAsync envuelve `.cmd` via cmd /c).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn as nodeSpawn } from 'node:child_process';
import { spawnAsync } from '../spawn-async.js';
import { applyExportCompat as defaultApplyExportCompat } from '../export-compat.js';
import {
  createTempCopy as defaultCreateTempCopy,
  cleanupTempCopy as defaultCleanupTempCopy,
  runNpmCi as defaultRunNpmCi,
} from '../export-temp-copy.js';
import { checkToolchain as defaultCheckToolchain } from '../export-preflight.js';
import type { TenantConfig } from '../../../../shared/generate/tenant-types.js';
import type { Emitter, BuildResult } from './web-zip.js';

export type { Emitter, BuildResult };

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

const __dirname_ = path.dirname(fileURLToPath(import.meta.url));

// Carpetas que NUNCA entran en `desktop-src/` (builds y dependencias).
const DESKTOP_EXCLUDED = new Set(['node_modules', '.next', 'out', 'dist-electron']);

function toSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

/** Lee la plantilla README y sustituye los placeholders del tenant. */
function renderReadme(productName: string): string {
  const templatePath = path.join(__dirname_, '../export-templates/readme-desktop.md');
  const template = fs.readFileSync(templatePath, 'utf8');
  return template.replace(/\{\{PRODUCT_NAME\}\}/g, productName);
}

// ---------------------------------------------------------------------------
// Dependencias inyectables (para test)
// ---------------------------------------------------------------------------

export interface ExeDeps {
  spawn?: typeof nodeSpawn;
  createTempCopy?: typeof defaultCreateTempCopy;
  cleanupTempCopy?: typeof defaultCleanupTempCopy;
  runNpmCi?: typeof defaultRunNpmCi;
  applyExportCompat?: typeof defaultApplyExportCompat;
  checkToolchain?: typeof defaultCheckToolchain;
  platform?: NodeJS.Platform;
}

/**
 * Localiza los dos ejecutables generados por electron-builder en dist-electron/.
 * Los targets `portable` y `nsis` usan artifactName con sufijos deterministas
 * (`-portable.exe` / `-setup.exe`, ver electron-builder.yml).
 */
function locateArtifacts(distDir: string): { portable: string; setup: string } {
  if (!fs.existsSync(distDir)) {
    throw new Error(`No existe el directorio de salida ${distDir}`);
  }
  const exes = fs.readdirSync(distDir).filter((f) => f.toLowerCase().endsWith('.exe'));
  const portable = exes.find((f) => /portable/i.test(f));
  const setup = exes.find((f) => /setup/i.test(f));
  if (!portable) throw new Error(`No se encontro el .exe portable en ${distDir}`);
  if (!setup) throw new Error(`No se encontro el instalador (setup) en ${distDir}`);
  return {
    portable: path.join(distDir, portable),
    setup: path.join(distDir, setup),
  };
}

/** Ensambla el ZIP final con archiver (streaming). */
async function assembleZip(
  frontDir: string,
  outputPath: string,
  artifacts: { portable: string; setup: string; readme: string },
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

    // desktop-src/ — fuente (incluye electron/) sin builds ni node_modules.
    archive.directory(frontDir, 'desktop-src', (entry: EntryData) => {
      const top = entry.name.split(/[\\/]/)[0];
      return DESKTOP_EXCLUDED.has(top) ? false : entry;
    });

    // Ejecutables en la raiz del ZIP.
    archive.file(artifacts.portable, { name: path.basename(artifacts.portable) });
    archive.file(artifacts.setup, { name: path.basename(artifacts.setup) });
    archive.append(artifacts.readme, { name: 'README.md' });

    void archive.finalize();
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Construye `<slug>-desktop.zip`: app Electron (portable + instalador) + fuente.
 *
 * @param config    - Configuracion del tenant horneada en la copia.
 * @param frontDir  - Ruta absoluta al proyecto front/.
 * @param outputDir - Carpeta donde se escribe el .zip.
 * @param emit      - Emisor de progreso.
 * @param signal    - Señal de aborto opcional.
 * @param deps      - Inyeccion de dependencias (para test).
 */
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
  const runNpmCi = deps.runNpmCi ?? defaultRunNpmCi;
  const applyExportCompat = deps.applyExportCompat ?? defaultApplyExportCompat;
  const checkToolchain = deps.checkToolchain ?? defaultCheckToolchain;
  const spawnFn = deps.spawn;
  const platform = deps.platform ?? process.platform;

  const productName = config.business.name;

  let rootDir: string | undefined;

  try {
    // Preflight ligero (Fase 6.3): electron-builder debe estar declarado en las
    // devDependencies del front (comprobacion estatica; `npm ci` sobre la copia
    // temporal lo instalara). No auto-instalable: si falta, el repo esta roto.
    emit({ type: 'progress', format: 'exe', step: 'Verificando toolchain...', pct: 1 });
    const pf = await checkToolchain('exe', frontDir, { platform });
    if (!pf.ok) {
      throw new Error(
        'electron-builder no esta declarado en las devDependencies de front/. ' +
          'Ejecuta `npm install --save-dev electron-builder` en front/ y vuelve a intentarlo.',
      );
    }

    emit({ type: 'progress', format: 'exe', step: 'Copiando proyecto...', pct: 5 });
    const copy = await createTempCopy(frontDir, config);
    rootDir = copy.rootDir;
    const tmpFrontDir = copy.frontDir;

    // Compat output:'export' — quita app/api y paginas dinamicas de la copia.
    const removed = applyExportCompat(tmpFrontDir);
    emit({
      type: 'progress',
      format: 'exe',
      step: `Preparando salida estatica (${removed.length} rutas excluidas)...`,
      pct: 10,
    });

    // Instala dependencias — cwd = front/ del tmp (necesita electron-builder local).
    await runNpmCi(tmpFrontDir, emit, signal);

    emit({ type: 'progress', format: 'exe', step: 'Compilando (next build export)...', pct: 40 });
    const nextRes = await spawnAsync('npx', ['next', 'build'], {
      cwd: tmpFrontDir,
      signal,
      spawn: spawnFn,
      env: { ...process.env, NEXT_OUTPUT_MODE: 'export' },
    });
    if (nextRes.exitCode !== 0) {
      throw new Error('next build (export) fallo: ' + nextRes.stderr.slice(-500));
    }

    emit({ type: 'progress', format: 'exe', step: 'Empaquetando .exe (electron-builder)...', pct: 65 });
    // electron-builder LOCAL (node_modules/.bin). El productName del tenant se
    // pasa por CLI con `-c.productName=` (sobreescribe el de electron-builder.yml);
    // se prefiere el override CLI a una variable de entorno por ser explicito y
    // no depender de la interpolacion de la config YAML.
    const ebBin = path.join(tmpFrontDir, 'node_modules', '.bin', 'electron-builder');
    const ebRes = await spawnAsync(
      ebBin,
      ['--win', 'portable', 'nsis', `-c.productName=${productName}`],
      { cwd: tmpFrontDir, signal, spawn: spawnFn, env: process.env },
    );
    if (ebRes.exitCode !== 0) {
      throw new Error('electron-builder fallo: ' + ebRes.stderr.slice(-500));
    }

    emit({ type: 'progress', format: 'exe', step: 'Localizando artefactos...', pct: 88 });
    const distDir = path.join(tmpFrontDir, 'dist-electron');
    const { portable, setup } = locateArtifacts(distDir);

    emit({ type: 'progress', format: 'exe', step: 'Empaquetando ZIP...', pct: 92 });
    fs.mkdirSync(outputDir, { recursive: true });
    const slug = toSlug(productName);
    const outputPath = path.join(outputDir, `${slug}-desktop.zip`);
    const readme = renderReadme(productName);

    await assembleZip(tmpFrontDir, outputPath, { portable, setup, readme });

    emit({ type: 'progress', format: 'exe', step: 'Guardando archivo...', pct: 100, outputPath });
    return { success: true, outputPath };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    emit({ type: 'format-error', format: 'exe', message: error });
    return { success: false, error };
  } finally {
    if (rootDir) cleanupTempCopy(rootDir);
  }
}
