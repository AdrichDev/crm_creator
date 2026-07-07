/**
 * back/src/lib/export-builders/apk.ts
 *
 * Android ZIP = app Next.js estatica empaquetada con Capacitor + Gradle.
 *
 * Flujo (D7 del design):
 *   createTempCopy → applyExportCompat (quita app/api y paginas dinamicas de la
 *   copia, incompatibles con output:'export') → personalizar capacitor.config.ts
 *   de la copia (appId derivado del slug, appName = nombre del tenant) → npm ci
 *   → `next build` con NEXT_OUTPUT_MODE=export (genera out/) → `npx cap sync
 *   android` → escribir android/local.properties (sdk.dir) → ensureKeystore →
 *   `gradlew.bat assembleRelease -Prel... --no-daemon` (firma release) →
 *   localizar APK en android/app/build/outputs/apk/release/ → ensamblar
 *   `<slug>-android.zip` con archiver:
 *       mobile-src/          fuente del tmp (incluye android/, sin builds/deps)
 *       app-release.apk      APK firmado
 *       README.md            plantilla readme-android.md
 *
 * Emite progreso granular y limpia la copia temporal en finally.
 *
 * NOTA (Fase 5): se elimina la llamada a `checkToolchain('apk')` heredada; el
 * preflight por proyecto se reintroduce en la Fase 6 (export-preflight reescrito
 * + autoinstall). Igual que hizo exe.ts, este builder ya no consulta el PATH.
 *
 * RNF-02: shell: false en todos los spawn (spawnAsync envuelve `.bat`/`.cmd`).
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
import { ensureKeystore as defaultEnsureKeystore } from '../export-keystore.js';
import { checkToolchain as defaultCheckToolchain } from '../export-preflight.js';
import { ensureAndroidToolchain as defaultEnsureAndroidToolchain } from '../export-autoinstall.js';
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

// Segmentos que NUNCA entran en `mobile-src/` (builds y dependencias, tanto de
// front como del proyecto android/).
const MOBILE_EXCLUDED = new Set(['node_modules', '.next', 'out', 'build', '.gradle']);

function toSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

/** Deriva un applicationId Android valido a partir del slug del tenant. */
function toAppId(slug: string): string {
  const suffix = slug.replace(/[^a-z0-9]/g, '') || 'app';
  return `com.operaos.${suffix}`;
}

/** Lee la plantilla README y sustituye los placeholders del tenant. */
function renderReadme(productName: string): string {
  const templatePath = path.join(__dirname_, '../export-templates/readme-android.md');
  const template = fs.readFileSync(templatePath, 'utf8');
  return template.replace(/\{\{PRODUCT_NAME\}\}/g, productName);
}

/** Escapa un texto para insertarlo como contenido de un elemento XML. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&apos;')
    .replace(/"/g, '&quot;');
}

/**
 * Reescribe `capacitor.config.ts` de la copia con el appId/appName del tenant.
 * Los valores se serializan con JSON.stringify para tolerar comillas/acentos en
 * el nombre del negocio. Ademas alinea `applicationId` y `namespace` en
 * `android/app/build.gradle` (cap sync NO propaga el appId al proyecto android
 * ya generado, solo lo fija en `cap add`) y el nombre visible de la app en
 * `strings.xml` (bug detectado en gate 5.V: ni capacitor.config ni cap sync
 * tocan `app_name`/`title_activity_main`, asi que el APK instalado mostraba
 * "OperaOS" en vez del nombre del negocio).
 */
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

  // Alinear applicationId/namespace del proyecto android/ ya scaffoldeado.
  const gradlePath = path.join(frontDir, 'android', 'app', 'build.gradle');
  if (fs.existsSync(gradlePath)) {
    let gradle = fs.readFileSync(gradlePath, 'utf8');
    gradle = gradle.replace(/namespace\s+"[^"]*"/, `namespace "${appId}"`);
    gradle = gradle.replace(/applicationId\s+"[^"]*"/, `applicationId "${appId}"`);
    fs.writeFileSync(gradlePath, gradle, 'utf8');
  }

  // Nombre visible de la app (label del launcher/activity), leido por Android
  // desde los recursos de strings, NO desde capacitor.config.ts.
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

/** Escribe android/local.properties con la ruta del SDK (backslashes escapados). */
function writeLocalProperties(androidDir: string): void {
  const sdkDir =
    process.env.ANDROID_HOME ||
    path.join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk');
  // Formato .properties: los backslashes de Windows deben ir escapados (\\).
  const escaped = sdkDir.replace(/\\/g, '\\\\');
  fs.writeFileSync(
    path.join(androidDir, 'local.properties'),
    `sdk.dir=${escaped}\n`,
    'utf8',
  );
}

/** Localiza el APK de release generado por Gradle. */
function locateApk(releaseDir: string): string {
  if (!fs.existsSync(releaseDir)) {
    throw new Error(`No existe el directorio de salida ${releaseDir}`);
  }
  const apk = fs.readdirSync(releaseDir).find((f) => f.toLowerCase().endsWith('.apk'));
  if (!apk) throw new Error(`No se encontro el .apk en ${releaseDir}`);
  return path.join(releaseDir, apk);
}

/** Ensambla el ZIP final con archiver (streaming). */
async function assembleZip(
  frontDir: string,
  outputPath: string,
  artifacts: { apk: string; readme: string },
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

    // mobile-src/ — fuente (incluye android/) sin builds ni node_modules.
    archive.directory(frontDir, 'mobile-src', (entry: EntryData) => {
      const segs = entry.name.split(/[\\/]/);
      return segs.some((s) => MOBILE_EXCLUDED.has(s)) ? false : entry;
    });

    // APK firmado + README en la raiz del ZIP.
    archive.file(artifacts.apk, { name: 'app-release.apk' });
    archive.append(artifacts.readme, { name: 'README.md' });

    void archive.finalize();
  });
}

// ---------------------------------------------------------------------------
// Dependencias inyectables (para test)
// ---------------------------------------------------------------------------

export interface ApkDeps {
  spawn?: typeof nodeSpawn;
  createTempCopy?: typeof defaultCreateTempCopy;
  cleanupTempCopy?: typeof defaultCleanupTempCopy;
  runNpmCi?: typeof defaultRunNpmCi;
  applyExportCompat?: typeof defaultApplyExportCompat;
  ensureKeystore?: typeof defaultEnsureKeystore;
  checkToolchain?: typeof defaultCheckToolchain;
  ensureAndroidToolchain?: typeof defaultEnsureAndroidToolchain;
  platform?: NodeJS.Platform;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Construye `<slug>-android.zip`: APK firmado (Capacitor + Gradle) + fuente.
 *
 * @param config    - Configuracion del tenant horneada en la copia.
 * @param frontDir  - Ruta absoluta al proyecto front/.
 * @param outputDir - Carpeta donde se escribe el .zip.
 * @param emit      - Emisor de progreso.
 * @param signal    - Señal de aborto opcional.
 * @param deps      - Inyeccion de dependencias (para test).
 */
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
  const runNpmCi = deps.runNpmCi ?? defaultRunNpmCi;
  const applyExportCompat = deps.applyExportCompat ?? defaultApplyExportCompat;
  const ensureKeystore = deps.ensureKeystore ?? defaultEnsureKeystore;
  const checkToolchain = deps.checkToolchain ?? defaultCheckToolchain;
  const ensureAndroidToolchain = deps.ensureAndroidToolchain ?? defaultEnsureAndroidToolchain;
  const spawnFn = deps.spawn;
  const platform = deps.platform ?? process.platform;

  const productName = config.business.name;
  const slug = toSlug(productName);
  const appId = toAppId(slug);

  let rootDir: string | undefined;

  try {
    // Preflight POR PROYECTO (Fase 6.3): herramientas del proyecto, no PATH.
    // Se ejecuta sobre el frontDir REAL antes de crear la copia temporal.
    emit({ type: 'progress', format: 'apk', step: 'Verificando toolchain...', pct: 1 });
    let pf = await checkToolchain('apk', frontDir, { platform });

    if (pf.missing.includes('gradlew')) {
      // El wrapper de Gradle deberia estar commiteado (Fase 5.1). Si falta, el
      // repositorio esta incompleto: NO es auto-instalable.
      throw new Error(
        'El proyecto no incluye el wrapper de Gradle ' +
          '(android/gradlew.bat + gradle/wrapper/gradle-wrapper.jar). ' +
          'El repositorio esta incompleto y no puede auto-repararse.',
      );
    }

    const autoMissing = pf.missing.filter((m) => m === 'jdk' || m === 'sdk');
    if (autoMissing.length > 0) {
      const install = await ensureAndroidToolchain(autoMissing, emit, signal, { platform });
      if (!install.ok) {
        throw new Error(install.instructions ?? 'No se pudo instalar la toolchain de Android.');
      }
      // Re-preflight: confirmar que la instalacion resolvio lo ausente.
      pf = await checkToolchain('apk', frontDir, { platform });
      const stillMissing = pf.missing.filter((m) => m === 'jdk' || m === 'sdk');
      if (stillMissing.length > 0) {
        throw new Error(
          'Tras la instalacion automatica sigue faltando: ' +
            stillMissing.join(', ') +
            '. Instala manualmente los requisitos y reintenta la exportacion.',
        );
      }
    }

    emit({ type: 'progress', format: 'apk', step: 'Copiando proyecto...', pct: 5 });
    const copy = await createTempCopy(frontDir, config);
    rootDir = copy.rootDir;
    const tmpFrontDir = copy.frontDir;

    // Compat output:'export' — quita app/api y paginas dinamicas de la copia.
    const removed = applyExportCompat(tmpFrontDir);
    emit({
      type: 'progress',
      format: 'apk',
      step: `Preparando salida estatica (${removed.length} rutas excluidas)...`,
      pct: 10,
    });

    // Personaliza el appId/appName de Capacitor para este tenant.
    customizeCapacitorConfig(tmpFrontDir, appId, productName);

    // Instala dependencias — cwd = front/ del tmp (necesita @capacitor/cli local).
    await runNpmCi(tmpFrontDir, emit, signal);

    emit({ type: 'progress', format: 'apk', step: 'Compilando (next build export)...', pct: 35 });
    const nextRes = await spawnAsync('npx', ['next', 'build'], {
      cwd: tmpFrontDir,
      signal,
      spawn: spawnFn,
      platform,
      env: { ...process.env, NEXT_OUTPUT_MODE: 'export' },
    });
    if (nextRes.exitCode !== 0) {
      throw new Error('next build (export) fallo: ' + nextRes.stderr.slice(-500));
    }

    emit({ type: 'progress', format: 'apk', step: 'Sincronizando Capacitor...', pct: 50 });
    const capRes = await spawnAsync('npx', ['cap', 'sync', 'android'], {
      cwd: tmpFrontDir,
      signal,
      spawn: spawnFn,
      platform,
      env: process.env,
    });
    if (capRes.exitCode !== 0) {
      throw new Error('cap sync android fallo: ' + capRes.stderr.slice(-500));
    }

    const androidDir = path.join(tmpFrontDir, 'android');
    writeLocalProperties(androidDir);

    // Keystore de release (genera si falta, reutiliza si existe).
    const keystore = await ensureKeystore(emit, { spawn: spawnFn, platform });

    emit({ type: 'progress', format: 'apk', step: 'Compilando APK (Gradle)...', pct: 55 });
    const gradlew = path.join(androidDir, platform === 'win32' ? 'gradlew.bat' : 'gradlew');
    const gradlewCmd = platform === 'win32' ? gradlew : './gradlew';
    const gradleRes = await spawnAsync(
      gradlewCmd,
      [
        'assembleRelease',
        `-PrelKeystore=${keystore.keystorePath}`,
        `-PrelAlias=${keystore.alias}`,
        `-PrelStorePass=${keystore.storePassword}`,
        `-PrelKeyPass=${keystore.keyPassword}`,
        '--no-daemon',
      ],
      { cwd: androidDir, signal, spawn: spawnFn, platform, env: process.env },
    );
    if (gradleRes.exitCode !== 0) {
      throw new Error('gradlew assembleRelease fallo: ' + gradleRes.stderr.slice(-500));
    }

    emit({ type: 'progress', format: 'apk', step: 'Localizando APK...', pct: 88 });
    const releaseDir = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'release');
    const apkPath = locateApk(releaseDir);

    emit({ type: 'progress', format: 'apk', step: 'Empaquetando ZIP...', pct: 92 });
    fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `${slug}-android.zip`);
    const readme = renderReadme(productName);

    await assembleZip(tmpFrontDir, outputPath, { apk: apkPath, readme });

    emit({ type: 'progress', format: 'apk', step: 'Guardando archivo...', pct: 100, outputPath });
    return { success: true, outputPath };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    emit({ type: 'format-error', format: 'apk', message: error });
    return { success: false, error };
  } finally {
    if (rootDir) cleanupTempCopy(rootDir);
  }
}
