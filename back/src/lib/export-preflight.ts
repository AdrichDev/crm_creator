/**
 * back/src/lib/export-preflight.ts
 *
 * Preflight POR PROYECTO (D8 del design, Fase 6.1).
 *
 * Reescrito: el preflight legacy consultaba el PATH global (`where electron-builder`,
 * `where gradle`, `where java`). Eso es incorrecto para un exportador plug-and-play:
 * las herramientas viven DENTRO del proyecto front/ (electron-builder en devDeps,
 * gradle via wrapper commiteado) y el JDK/SDK son del sistema pero se localizan por
 * ruta conocida, NUNCA por `where gradle`.
 *
 * `checkToolchain(format, frontDir)` devuelve datos crudos `{ ok, missing[] }`; el
 * MENSAJE accionable para el usuario lo genera quien consume (apk.ts / exe.ts /
 * export-autoinstall.ts), no este modulo.
 *
 * Decisiones (ver NOTES del apply):
 *   - exe: se comprueba que `electron-builder` figura en devDependencies del
 *     package.json del front (comprobacion ESTATICA, sin node_modules). El build
 *     corre `npm ci` sobre una COPIA temporal, asi que el node_modules del front
 *     real puede no existir y aun asi el build funcionara. Comprobar el bin fisico
 *     del front real daria falsos negativos. Si package.json no se puede leer →
 *     'node_modules' (repo roto).
 *   - apk: gradlew del proyecto (nunca PATH), JDK >= 17 (JAVA_HOME o `java -version`),
 *     Android SDK (ANDROID_HOME o %LOCALAPPDATA%\Android\Sdk con platforms/ poblado).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { BuildFormat } from './export-job-manager.js';

// ---------------------------------------------------------------------------
// Tipos publicos
// ---------------------------------------------------------------------------

export type ToolchainMissing =
  | 'node_modules'
  | 'electron_builder'
  | 'gradlew'
  | 'jdk'
  | 'sdk';

export interface ToolchainResult {
  ok: boolean;
  missing: ToolchainMissing[];
}

export interface ExecResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** Dependencias inyectables (para test sin tocar el sistema real). */
export interface CheckToolchainDeps {
  platform?: NodeJS.Platform;
  /** fs.existsSync inyectable. */
  exists?: (p: string) => boolean;
  /** Lectura de fichero de texto inyectable (package.json). */
  readFile?: (p: string) => string;
  /** Listado de directorio inyectable (platforms/ del SDK). */
  readdir?: (p: string) => string[];
  /** Ejecutor de comandos inyectable (sustituye a spawnSync en test). */
  exec?: (cmd: string, args: string[]) => ExecResult;
  /** Entorno inyectable (JAVA_HOME, ANDROID_HOME, LOCALAPPDATA). */
  env?: NodeJS.ProcessEnv;
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

function defaultExec(cmd: string, args: string[]): ExecResult {
  const res = spawnSync(cmd, args, { encoding: 'utf8' });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

/**
 * Parsea la version mayor de Java de la cadena entre comillas de `java -version`.
 * Formatos: `"21.0.11"` → 21, `"17"` → 17, `"1.8.0_401"` → 8 (esquema legacy 1.x).
 */
export function parseJavaMajor(versionString: string): number {
  const parts = versionString.split('.');
  let major = parseInt(parts[0] ?? '', 10);
  if (major === 1) major = parseInt(parts[1] ?? '', 10);
  return Number.isFinite(major) ? major : NaN;
}

/**
 * Localiza y consulta la version del JDK.
 * Prefiere `%JAVA_HOME%\bin\java`; si no, invoca `java` del PATH (el shim de
 * Oracle tambien responde a `-version`). Devuelve true si la mayor es >= 17.
 */
function jdkOk(deps: Required<Pick<CheckToolchainDeps, 'exists' | 'exec' | 'env' | 'platform'>>): boolean {
  const { exists, exec, env, platform } = deps;
  const javaExe = platform === 'win32' ? 'java.exe' : 'java';


  let javaCmd = 'java';
  if (env.JAVA_HOME) {
    const candidate = path.join(env.JAVA_HOME, 'bin', javaExe);
    if (exists(candidate)) javaCmd = candidate;
  }

  const res = exec(javaCmd, ['-version']);
  // `java -version` imprime la version por STDERR en todas las JVM conocidas.
  const combined = `${res.stdout}\n${res.stderr}`;
  const match = combined.match(/version "([^"]+)"/);
  if (!match) return false;
  const major = parseJavaMajor(match[1]);
  return Number.isFinite(major) && major >= 17;
}

/** Raiz del Android SDK: ANDROID_HOME o %LOCALAPPDATA%\Android\Sdk. */
export function androidSdkRoot(env: NodeJS.ProcessEnv = process.env): string {
  return (
    env.ANDROID_HOME ||
    path.join(env.LOCALAPPDATA ?? '', 'Android', 'Sdk')
  );
}

/** El SDK es valido si contiene platforms/ con al menos una plataforma instalada. */
function sdkOk(
  deps: Required<Pick<CheckToolchainDeps, 'exists' | 'readdir' | 'env'>>,
): boolean {
  const platformsDir = path.join(androidSdkRoot(deps.env), 'platforms');
  if (!deps.exists(platformsDir)) return false;
  try {
    return deps.readdir(platformsDir).length > 0;
  } catch {
    return false;
  }
}

/** true si `electron-builder` figura en devDependencies/dependencies del front. */
function electronBuilderDeclared(
  frontDir: string,
  deps: Required<Pick<CheckToolchainDeps, 'exists' | 'readFile'>>,
): boolean {
  const pkgPath = path.join(frontDir, 'package.json');
  if (!deps.exists(pkgPath)) return false;
  try {
    const pkg = JSON.parse(deps.readFile(pkgPath)) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return Boolean(
      pkg.devDependencies?.['electron-builder'] ?? pkg.dependencies?.['electron-builder'],
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// API publica
// ---------------------------------------------------------------------------

/**
 * Verifica la toolchain del proyecto para el formato dado.
 *
 * @param format   - 'web-zip' | 'exe' | 'apk' | 'ipa'.
 * @param frontDir - Ruta absoluta al proyecto front/ REAL (no la copia tmp).
 * @param deps     - Inyeccion de dependencias (para test).
 * @returns `{ ok, missing[] }`. `ok === (missing.length === 0)`.
 */
export async function checkToolchain(
  format: BuildFormat,
  frontDir = '',
  depsInput: CheckToolchainDeps = {},
): Promise<ToolchainResult> {
  const deps = {
    platform: depsInput.platform ?? process.platform,
    exists: depsInput.exists ?? fs.existsSync,
    readFile: depsInput.readFile ?? ((p: string) => fs.readFileSync(p, 'utf8')),
    readdir: depsInput.readdir ?? ((p: string) => fs.readdirSync(p)),
    exec: depsInput.exec ?? defaultExec,
    env: depsInput.env ?? process.env,
  };

  const missing: ToolchainMissing[] = [];

  switch (format) {
    // web-zip: solo necesita Node, que ya esta corriendo el propio back.
    // ipa: el guard de plataforma vive en el builder (ipa.ts), no aqui.
    case 'web-zip':
    case 'ipa':
      break;

    case 'exe': {
      const pkgPath = path.join(frontDir, 'package.json');
      if (!deps.exists(pkgPath)) {
        // Sin package.json el proyecto esta roto: no hay como instalar nada.
        missing.push('node_modules');
      } else if (!electronBuilderDeclared(frontDir, deps)) {
        missing.push('electron_builder');
      }
      break;
    }

    case 'apk': {
      const gradlew = path.join(frontDir, 'android', 'gradlew.bat');
      const wrapperJar = path.join(
        frontDir,
        'android',
        'gradle',
        'wrapper',
        'gradle-wrapper.jar',
      );
      if (!deps.exists(gradlew) || !deps.exists(wrapperJar)) {
        missing.push('gradlew');
      }
      if (!jdkOk(deps)) missing.push('jdk');
      if (!sdkOk(deps)) missing.push('sdk');
      break;
    }

    default: {
      const exhaustive: never = format;
      throw new Error(`Formato desconocido: ${String(exhaustive)}`);
    }
  }

  return { ok: missing.length === 0, missing };
}
