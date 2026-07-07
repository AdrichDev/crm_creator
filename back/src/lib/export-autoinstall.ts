/**
 * back/src/lib/export-autoinstall.ts
 *
 * Auto-instalacion de la toolchain Android (D9 del design, Fase 6.2).
 *
 * `ensureAndroidToolchain(missing, emit, signal)` intenta instalar, sin
 * intervencion manual, lo que el preflight reporto como ausente:
 *   - 'jdk' → JDK 17 (Eclipse Temurin) via winget, ambito de usuario.
 *   - 'sdk' → Android command-line tools + platform-tools + platform 35 +
 *             build-tools 35.0.0 (receta verificada manualmente en la maquina
 *             de referencia, gate 5.V).
 *
 * Cada paso emite progreso al job, tiene timeout propio y respeta el AbortSignal.
 * Si CUALQUIER paso falla, devuelve `{ ok:false, instructions }` con los comandos
 * manuales EXACTOS (en espanol) de todo lo que quedo pendiente — el llamante los
 * muestra al usuario via `format-error`.
 *
 * RNF-02: shell:false — spawnAsync no delega en un shell (powershell.exe y los
 * `.bat` de sdkmanager se invocan de forma explicita).
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import { spawn as nodeSpawn } from 'node:child_process';
import { spawnAsync, type SpawnAsyncResult } from './spawn-async.js';
import { androidSdkRoot } from './export-preflight.js';
import type { ToolchainMissing } from './export-preflight.js';
import type { Emitter } from './export-builders/web-zip.js';

// ---------------------------------------------------------------------------
// Constantes de la receta (D9)
// ---------------------------------------------------------------------------

/**
 * ZIP oficial de las Android command-line tools (Windows), version fijada.
 *
 * Para ACTUALIZAR: coger el numero de build mas reciente de
 * https://developer.android.com/studio#command-line-tools-only y sustituir
 * `13114758` (la estructura interna del zip — `cmdline-tools/bin/sdkmanager.bat`
 * — no cambia entre versiones).
 */
export const CMDLINE_TOOLS_URL =
  'https://dl.google.com/android/repository/commandlinetools-win-13114758_latest.zip';

/** Plataforma/build-tools que instala la receta (deben ir en linea con front/android). */
const ANDROID_PLATFORM = 'platforms;android-35';
const ANDROID_BUILD_TOOLS = 'build-tools;35.0.0';

// Timeouts por paso (ms). Amplios: descargas e instalaciones reales tardan.
const TIMEOUT_WINGET = 15 * 60_000;
const TIMEOUT_DOWNLOAD = 15 * 60_000;
const TIMEOUT_LICENSES = 5 * 60_000;
const TIMEOUT_PACKAGES = 20 * 60_000;

// ---------------------------------------------------------------------------
// Tipos publicos
// ---------------------------------------------------------------------------

export interface AutoInstallResult {
  ok: boolean;
  /** Texto con comandos manuales exactos; presente solo cuando ok === false. */
  instructions?: string;
}

/** Dependencias inyectables (para test con spawn/fs mockeados). */
export interface EnsureToolchainDeps {
  spawn?: typeof nodeSpawn;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  exists?: (p: string) => boolean;
  readdir?: (p: string) => string[];
}

// ---------------------------------------------------------------------------
// Instrucciones manuales (fallback)
// ---------------------------------------------------------------------------

/** Bloque de comandos manuales para instalar el JDK 17. */
function jdkInstructions(): string {
  return (
    'JDK 17 (Eclipse Temurin):\n' +
    '  Abre PowerShell y ejecuta:\n' +
    '  Invoke-WebRequest -Uri "https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse" -OutFile "$env:TEMP\\jdk17.zip"\n' +
    '  Expand-Archive -Path "$env:TEMP\\jdk17.zip" -DestinationPath "$env:LOCALAPPDATA\\Programs\\Eclipse Adoptium\\jdk-17"'
  );
}

/** Bloque de comandos manuales para instalar el Android SDK. */
function sdkInstructions(sdkRoot: string): string {
  const cmdlineDir = path.join(sdkRoot, 'cmdline-tools');
  const sdkmanager = path.join(cmdlineDir, 'latest', 'bin', 'sdkmanager.bat');
  return (
    'Android SDK (command-line tools):\n' +
    `  1. Descarga ${CMDLINE_TOOLS_URL}\n` +
    `  2. Extrae el zip en ${cmdlineDir}\\ y renombra la carpeta ` +
    `"cmdline-tools" resultante a "latest" (queda ${sdkmanager}).\n` +
    `  3. "${sdkmanager}" --licenses   (acepta todas escribiendo "y")\n` +
    `  4. "${sdkmanager}" "platform-tools" "${ANDROID_PLATFORM}" "${ANDROID_BUILD_TOOLS}"`
  );
}

/** Construye el texto de instrucciones para lo que quedo sin instalar. */
function buildInstructions(pending: ToolchainMissing[], sdkRoot: string): string {
  const blocks: string[] = [];
  if (pending.includes('jdk')) blocks.push(jdkInstructions());
  if (pending.includes('sdk')) blocks.push(sdkInstructions(sdkRoot));
  return (
    'No se pudo instalar la toolchain de Android automaticamente. ' +
    'Ejecuta manualmente estos comandos y reintenta la exportacion:\n\n' +
    blocks.join('\n\n')
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------


/** Ejecuta un paso con timeout propio combinado con el AbortSignal del job. */
async function runStep(
  cmd: string,
  args: string[],
  opts: {
    env?: NodeJS.ProcessEnv;
    spawn?: typeof nodeSpawn;
    platform?: NodeJS.Platform;
    stdinData?: string;
  },
  timeoutMs: number,
  parentSignal?: AbortSignal,
): Promise<SpawnAsyncResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onParentAbort = (): void => ctrl.abort();
  if (parentSignal) {
    if (parentSignal.aborted) ctrl.abort();
    else parentSignal.addEventListener('abort', onParentAbort, { once: true });
  }
  try {
    return await spawnAsync(cmd, args, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener('abort', onParentAbort);
  }
}

// ---------------------------------------------------------------------------
// API publica
// ---------------------------------------------------------------------------

/**
 * Instala automaticamente la toolchain de Android ausente.
 *
 * @param missing - Subconjunto de {'jdk','sdk'} reportado por checkToolchain.
 * @param emit    - Emisor de progreso del job.
 * @param signal  - Señal de aborto opcional (watchdog / cancelacion).
 * @param depsInput - Inyeccion de dependencias (para test).
 */
export async function ensureAndroidToolchain(
  missing: ToolchainMissing[],
  emit: Emitter,
  signal?: AbortSignal,
  depsInput: EnsureToolchainDeps = {},
): Promise<AutoInstallResult> {
  const spawn = depsInput.spawn;
  const platform = depsInput.platform ?? process.platform;
  const env = depsInput.env ?? process.env;
  const exists = depsInput.exists ?? fs.existsSync;
  const readdir = depsInput.readdir ?? ((p: string) => fs.readdirSync(p));

  const sdkRoot = androidSdkRoot(env);
  const needJdk = missing.includes('jdk');
  const needSdk = missing.includes('sdk');
  const pending: ToolchainMissing[] = [];
  if (needJdk) pending.push('jdk');
  if (needSdk) pending.push('sdk');

  // Env acumulado para pasos posteriores (JAVA_HOME tras instalar el JDK).
  const stepEnv: NodeJS.ProcessEnv = { ...env };

  // ---- Paso 1: JDK 17 via powershell --------------------------------------
  if (needJdk) {
    emit({ type: 'progress', format: 'apk', step: 'Descargando JDK 17…', pct: 15 });
    const jdkBaseDir = path.join(env.LOCALAPPDATA ?? '', 'Programs', 'Eclipse Adoptium');
    const psScriptJdk = [
      "$ErrorActionPreference='Stop';",
      `$base=${JSON.stringify(jdkBaseDir)};`,
      'New-Item -ItemType Directory -Force -Path $base | Out-Null;',
      "$zip=Join-Path $env:TEMP 'temurin-17.zip';",
      `Invoke-WebRequest -Uri "https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse" -OutFile $zip;`,
      "$tmp=Join-Path $base '_extract';",
      'if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }',
      'Expand-Archive -Path $zip -DestinationPath $tmp -Force;',
      "$jdkDir=(Get-ChildItem -Path $tmp -Directory)[0].FullName;",
      "$target=Join-Path $base 'jdk-17';",
      'if (Test-Path $target) { Remove-Item -Recurse -Force $target }',
      'Move-Item $jdkDir $target;',
      'Remove-Item -Recurse -Force $tmp;',
      'Remove-Item -Force $zip'
    ].join(' ');

    const res = await runStep(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', psScriptJdk],
      { env: stepEnv, spawn, platform },
      TIMEOUT_DOWNLOAD,
      signal,
    );

    if (res.exitCode !== 0) {
      return { ok: false, instructions: buildInstructions(pending, sdkRoot) };
    }
    
    const jdkHome = path.join(jdkBaseDir, 'jdk-17');
    stepEnv.JAVA_HOME = jdkHome;
    stepEnv.PATH = `${path.join(jdkHome, 'bin')}${path.delimiter}${stepEnv.PATH ?? ''}`;
  }

  // ---- Paso 2: Android SDK -------------------------------------------------
  if (needSdk) {
    stepEnv.ANDROID_HOME = sdkRoot;

    // 2a. Descarga + extraccion de cmdline-tools via PowerShell (D9).
    emit({ type: 'progress', format: 'apk', step: 'Descargando Android SDK…', pct: 22 });
    const cmdlineDir = path.join(sdkRoot, 'cmdline-tools');
    const psScript = [
      "$ErrorActionPreference='Stop';",
      `$ct=${JSON.stringify(cmdlineDir)};`,
      'New-Item -ItemType Directory -Force -Path $ct | Out-Null;',
      "$zip=Join-Path $env:TEMP 'operaos-cmdline-tools.zip';",
      `Invoke-WebRequest -Uri ${JSON.stringify(CMDLINE_TOOLS_URL)} -OutFile $zip;`,
      "$tmp=Join-Path $ct '_extract';",
      'if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }',
      'Expand-Archive -Path $zip -DestinationPath $tmp -Force;',
      "$latest=Join-Path $ct 'latest';",
      'if (Test-Path $latest) { Remove-Item -Recurse -Force $latest }',
      "Move-Item (Join-Path $tmp 'cmdline-tools') $latest;",
      'Remove-Item -Recurse -Force $tmp;',
      'Remove-Item -Force $zip',
    ].join(' ');
    const dl = await runStep(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', psScript],
      { env: stepEnv, spawn, platform },
      TIMEOUT_DOWNLOAD,
      signal,
    );
    if (dl.exitCode !== 0) {
      return { ok: false, instructions: buildInstructions(pending, sdkRoot) };
    }

    const sdkmanager = path.join(cmdlineDir, 'latest', 'bin', 'sdkmanager.bat');

    // 2b. Aceptar licencias (pipe de "y", como `yes | sdkmanager --licenses`).
    emit({ type: 'progress', format: 'apk', step: 'Aceptando licencias del SDK…', pct: 28 });
    const lic = await runStep(
      sdkmanager,
      ['--licenses'],
      { env: stepEnv, spawn, platform, stdinData: 'y\n'.repeat(50) },
      TIMEOUT_LICENSES,
      signal,
    );
    if (lic.exitCode !== 0) {
      return { ok: false, instructions: buildInstructions(pending, sdkRoot) };
    }

    // 2c. Instalar platform-tools + platform + build-tools.
    emit({ type: 'progress', format: 'apk', step: 'Instalando paquetes del SDK…', pct: 32 });
    const pkgs = await runStep(
      sdkmanager,
      ['platform-tools', ANDROID_PLATFORM, ANDROID_BUILD_TOOLS],
      { env: stepEnv, spawn, platform },
      TIMEOUT_PACKAGES,
      signal,
    );
    if (pkgs.exitCode !== 0) {
      return { ok: false, instructions: buildInstructions(pending, sdkRoot) };
    }
  }

  return { ok: true };
}
