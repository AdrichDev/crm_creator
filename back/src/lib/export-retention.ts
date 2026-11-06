/**
 * back/src/lib/export-retention.ts
 *
 * security-wave-2 / T5 (S3): los artefactos de export caducan. Un ZIP con el
 * codigo fuente de un cliente no puede quedarse para siempre en el disco del
 * servidor (ni el de una version antigua con un `.env.local` ya rotado).
 *
 * - Retencion por defecto: `EXPORT_RETENTION_DAYS` (7 dias).
 * - Pasada al arrancar el servidor y luego cada `EXPORT_RETENTION_INTERVAL_MS`
 *   (24 h), con el mismo estilo de scheduler in-process que
 *   `digestScheduler`/`reminderDrainer` y el mismo kill-switch
 *   (`ENABLE_CRONS=false`, aplicado en `server.ts`).
 * - Contencion de rutas: solo se borran FICHEROS dentro del directorio de
 *   exports; jamás un enlace simbolico, un fichero hermano ni nada alcanzado
 *   con `..`. Un fallo de una entrada no aborta el resto de la pasada.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/** Retencion por defecto, en dias. */
export const DEFAULT_EXPORT_RETENTION_DAYS = 7;

/** Cadencia por defecto de la pasada de limpieza: diaria. */
export const DEFAULT_EXPORT_RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;

function positiveNumber(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Ventana de retencion efectiva (env `EXPORT_RETENTION_DAYS`, default 7). */
export const EXPORT_RETENTION_DAYS = positiveNumber(
  process.env.EXPORT_RETENTION_DAYS,
  DEFAULT_EXPORT_RETENTION_DAYS,
);

/** Cadencia efectiva (env `EXPORT_RETENTION_INTERVAL_MS`, default 24 h). */
export const EXPORT_RETENTION_INTERVAL_MS = positiveNumber(
  process.env.EXPORT_RETENTION_INTERVAL_MS,
  DEFAULT_EXPORT_RETENTION_INTERVAL_MS,
);

/** Directorio de exports por defecto (mismo default que `routes/exports.ts`). */
export function defaultExportsDir(): string {
  return path.join(process.cwd(), 'exports');
}

/**
 * Contencion de rutas: true solo si `candidate` es un DESCENDIENTE ESTRICTO de
 * `rootDir` (resuelve `..` y separadores; rechaza la propia raiz y rutas
 * absolutas de otro arbol).
 */
export function isInsideExportRoot(rootDir: string, candidate: string): boolean {
  const root = path.resolve(rootDir);
  const target = path.resolve(candidate);
  const rel = path.relative(root, target);
  if (!rel) return false; // la propia raiz no es un artefacto borrable
  if (path.isAbsolute(rel)) return false;
  return rel !== '..' && !rel.startsWith(`..${path.sep}`) && rel !== '.';
}

export interface PruneOptions {
  /** Dias de retencion. Default: `EXPORT_RETENTION_DAYS`. */
  retentionDays?: number;
  /** Reloj inyectable (tests). Default: ahora. */
  now?: Date;
}

/**
 * Borra los artefactos de `exportsDir` cuyo `mtime` es anterior al corte de
 * retencion. Devuelve las rutas absolutas borradas (orden de recorrido). Nunca
 * toca nada fuera del directorio, ni sigue enlaces simbolicos, ni borra
 * directorios (solo ficheros).
 */
export function pruneOldExports(
  exportsDir: string,
  options: PruneOptions = {},
): string[] {
  const root = path.resolve(exportsDir);
  if (!fs.existsSync(root)) return [];

  const retentionDays = options.retentionDays ?? EXPORT_RETENTION_DAYS;
  const now = options.now ?? new Date();
  const cutoffMs = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
  const deleted: string[] = [];

  const walk = (absDir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
      return; // sin permisos / desaparecido a mitad de pasada
    }
    for (const entry of entries) {
      const abs = path.join(absDir, entry.name);
      // Defensa en profundidad: nunca se sale del directorio de exports.
      if (!isInsideExportRoot(root, abs)) continue;
      if (entry.isSymbolicLink()) continue; // no se sigue ni se borra el enlace
      if (entry.isDirectory()) {
        walk(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      try {
        if (fs.lstatSync(abs).mtimeMs >= cutoffMs) continue;
        fs.rmSync(abs, { force: true });
        deleted.push(abs);
      } catch {
        // Un fichero bloqueado no aborta la pasada.
      }
    }
  };

  walk(root);
  return deleted;
}

export interface RetentionSchedulerOptions {
  /** Directorio de exports a limpiar. Default: `<cwd>/exports`. */
  exportsDir?: string;
  /** Cadencia. Default: `EXPORT_RETENTION_INTERVAL_MS` (24 h). */
  intervalMs?: number;
  /** Dias de retencion. Default: `EXPORT_RETENTION_DAYS`. */
  retentionDays?: number;
  /** Pruner inyectable (tests). Default: `pruneOldExports`. */
  prune?: (exportsDir: string, options: PruneOptions) => string[];
  /** Reloj inyectable (tests). */
  now?: () => Date;
}

/**
 * Arranca la limpieza de exports: una pasada inmediata (arranque del servidor)
 * y luego una diaria. Nunca lanza. Devuelve una funcion para pararla.
 *
 * Llamar solo desde `server.ts` tras `listen`, y solo si los crons estan
 * habilitados (`ENABLE_CRONS !== 'false'`).
 */
export function startExportRetention(
  options: RetentionSchedulerOptions = {},
): () => void {
  const exportsDir = options.exportsDir ?? defaultExportsDir();
  const intervalMs = options.intervalMs ?? EXPORT_RETENTION_INTERVAL_MS;
  const retentionDays = options.retentionDays ?? EXPORT_RETENTION_DAYS;
  const prune = options.prune ?? pruneOldExports;

  const run = (): void => {
    try {
      const deleted = prune(exportsDir, {
        retentionDays,
        now: options.now ? options.now() : new Date(),
      });
      if (deleted.length > 0) {
        console.log(
          `[export-retention] ${deleted.length} artefacto(s) caducado(s) borrado(s) de ${exportsDir}`,
        );
      }
    } catch (err) {
      console.error(
        '[export-retention] pasada fallida:',
        err instanceof Error ? err.message : err,
      );
    }
  };

  console.log(
    `[export-retention] iniciado (retencion ${retentionDays} dias, cada ${intervalMs} ms)`,
  );
  run(); // pasada de arranque
  const timer = setInterval(run, intervalMs);
  if (timer.unref) timer.unref();
  return () => clearInterval(timer);
}
