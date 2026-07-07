/**
 * back/src/lib/export-temp-copy.ts
 *
 * Temporary working copy of the repo layout needed to build front/ standalone.
 *
 * RF-04 / RF-05: Copy front/ → tmp/build-<uuid>/front/ Y shared/ (raiz del repo)
 * → tmp/build-<uuid>/shared/ (front importa `shared/generate/*` via rutas
 * relativas `../../../shared/...` — ver front/lib/generate/build.ts). Sin
 * replicar `shared/` al lado de `front/`, esos imports no resuelven y
 * `next build` falla dentro del tmp (bug detectado en gate 3.V).
 *
 * Inyecta NEXT_PUBLIC_TENANT_JSON en front/.env.local, luego limpia en finally.
 * Nunca toca los originales (frontDir ni el repo raiz).
 *
 * RNF-04: The copy function NEVER writes to the source frontDir or front/.next.
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn as nodeSpawn } from 'node:child_process';
import { spawnAsync } from './spawn-async.js';
import { randomUUID } from 'crypto';
import type { TenantConfig } from '../../../shared/generate/tenant-types';
import type { Emitter } from './export-builders/web-zip.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Carpetas excluidas al copiar (builds, deps, VCS, salida estatica previa). */
const EXCLUDED = new Set(['node_modules', '.next', '.git', 'out']);

function copyFiltered(src: string, dest: string): void {
  fs.cpSync(src, dest, {
    recursive: true,
    filter: (entry: string) => !EXCLUDED.has(path.basename(entry)),
  });
}

export interface TempCopyResult {
  /** Carpeta raiz del tmp (contiene front/ y shared/); a borrar en cleanup. */
  rootDir: string;
  /** Carpeta front/ dentro del tmp — cwd de npm ci/next build y raiz del ZIP `app/`. */
  frontDir: string;
}

/**
 * Crea una copia temporal replicando el layout del repo necesario para que
 * `front/` resuelva sus imports relativos a `shared/`.
 *
 * @param frontDir - Ruta absoluta a front/ (fuente).
 * @param tenantConfig - Configuracion del tenant a hornear en front/.env.local.
 * @returns `{ rootDir, frontDir }` — rutas absolutas dentro del tmp.
 */
export async function createTempCopy(
  frontDir: string,
  tenantConfig: TenantConfig,
): Promise<TempCopyResult> {
  const rootDir = path.join(process.cwd(), 'tmp', `build-${randomUUID()}`);
  const tmpFrontDir = path.join(rootDir, 'front');
  const tmpSharedDir = path.join(rootDir, 'shared');

  // El repo raiz es el padre de front/ (creador_CRM/front → creador_CRM/shared).
  const repoRoot = path.dirname(path.resolve(frontDir));
  const sharedSrcDir = path.join(repoRoot, 'shared');

  fs.mkdirSync(rootDir, { recursive: true });

  copyFiltered(frontDir, tmpFrontDir);

  // shared/ es dependencia de tipo/generacion pura (sin deps del back/front);
  // se replica entera con las mismas exclusiones por consistencia.
  if (fs.existsSync(sharedSrcDir)) {
    copyFiltered(sharedSrcDir, tmpSharedDir);
  }

  // Write .env.local with the baked tenant config (dentro de front/, nunca en shared/).
  //
  // El JSON se codifica en base64 (NO en crudo) porque dotenv trata `#` como
  // inicio de comentario y recorta el valor a partir de ahí — la config del
  // tenant SIEMPRE trae colores hex en branding.primary/secondary (p.ej.
  // "#1E90FF"), lo que truncaba el JSON y hacía fallar el JSON.parse en
  // BAKED_TENANT_CONFIG (catch → null, app exportada sin tenant horneado).
  // Base64 no contiene `#`, comillas ni saltos de línea, así que dotenv lo
  // deja intacto. tenant-config.ts decodifica con atob+TextDecoder (soporta
  // UTF-8) antes de JSON.parse.
  const json = JSON.stringify(tenantConfig);
  const b64 = Buffer.from(json, 'utf8').toString('base64');
  const envContent = `\nNEXT_PUBLIC_TENANT_JSON=${b64}\n`;
  fs.appendFileSync(path.join(tmpFrontDir, '.env.local'), envContent, 'utf8');

  return { rootDir, frontDir: tmpFrontDir };
}

/**
 * Remove the temporary root directory (front/ + shared/ copies).
 * Must be called in a finally block to guarantee cleanup.
 *
 * Safe to call even if rootDir does not exist.
 * NEVER touches the original frontDir or repo root.
 *
 * @param rootDir - Absolute path returned by createTempCopy() as `rootDir`.
 */
export function cleanupTempCopy(rootDir: string): void {
  try {
    fs.rmSync(rootDir, { recursive: true, force: true });
  } catch {
    // Best-effort: log but do not throw so the finally block never crashes.
    console.warn(`[export-temp-copy] Could not remove ${rootDir}`);
  }
}

// ---------------------------------------------------------------------------
// npm ci dentro de la copia temporal
// ---------------------------------------------------------------------------

/** Dependencias inyectables para test (spawn y plataforma). */
export interface NpmCiDeps {
  spawn?: typeof nodeSpawn;
  platform?: NodeJS.Platform;
}

/**
 * Ejecuta `npm ci` dentro de la copia temporal para instalar las dependencias
 * necesarias antes de compilar (`next build`).
 *
 * En Windows `npm` es un `.cmd`, por lo que se invoca via `cmd /c npm ci`
 * (shell: false). Emite progreso via Emitter y respeta el AbortSignal.
 *
 * @param tmpDir - Copia temporal creada por createTempCopy().
 * @param emit   - Emisor de eventos de progreso.
 * @param signal - Señal de aborto opcional para cancelar la instalacion.
 * @param deps   - Inyeccion de spawn/plataforma (para test).
 */
export async function runNpmCi(
  tmpDir: string,
  emit: Emitter,
  signal?: AbortSignal,
  deps: NpmCiDeps = {},
): Promise<void> {
  const spawnFn = deps.spawn;
  const platform = deps.platform;

  emit({
    type: 'progress',
    format: 'web-zip',
    step: 'Instalando dependencias (npm ci)...',
    pct: 25,
  });

  // spawnAsync centraliza el fix Windows (cmd /c npm ci) y el AbortSignal.
  const res = await spawnAsync('npm', ['ci'], {
    cwd: tmpDir,
    signal,
    spawn: spawnFn,
    platform,
  });
  if (res.exitCode !== 0) {
    throw new Error('npm ci fallo: ' + res.stderr.slice(-500));
  }
}
