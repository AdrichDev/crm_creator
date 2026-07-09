/**
 * back/src/lib/export-job-manager.ts
 *
 * Gestor de jobs de exportacion en memoria (sin Prisma).
 *
 * Un build es un proceso hijo del back: si el back se reinicia, el build muere.
 * Persistir jobs en BD solo dejaria huerfanos "running". In-memory + GET /active
 * cubre el requisito real (sobrevivir a la recarga del FRONT).
 *
 * D1 del design: startJob/runJob/getJob/getActiveJob, reutilizando export-lock
 * (acquireLock/releaseLock/startWatchdog) y la firma Emitter de los builders.
 */

import { randomUUID } from 'node:crypto';
import { acquireLock, releaseLock, startWatchdog } from './export-lock.js';
import { buildWebZip } from './export-builders/web-zip.js';
import { buildIpa } from './export-builders/ipa.js';
import { buildExe } from './export-builders/exe.js';
import { buildApk } from './export-builders/apk.js';
import type { Emitter, BuildResult, Deliverable } from './export-builders/web-zip.js';
import type { RuntimeConfig } from './export-builders/runtime-config-env.js';
import type { TenantConfig } from '../../../shared/generate/tenant-types.js';

// ---------------------------------------------------------------------------
// Tipos publicos
// ---------------------------------------------------------------------------

export type BuildFormat = 'web-zip' | 'exe' | 'apk' | 'ipa';

/**
 * crm-export-delivery-profiles: destinatario del ZIP generado.
 * - 'binary': paquete INTERNO de operador (el ZIP nunca llega al cliente).
 * - 'binary+source' (default): paquete cara al cliente, fuente + self-host.
 * Definido en web-zip.ts (tipo compartido entre builders) y re-exportado aqui
 * para que routes/exports.ts y los tests del job manager lo consuman sin
 * depender directamente de los builders.
 */
export type { Deliverable };

export type PerFormatStatus = 'pending' | 'running' | 'done' | 'error';

export interface PerFormatState {
  status: PerFormatStatus;
  pct: number;
  outputPath?: string;
  error?: string;
}

export interface ExportJob {
  id: string; // randomUUID
  projectId: string;
  formats: BuildFormat[];
  status: 'running' | 'done' | 'error';
  currentFormat?: BuildFormat;
  step?: string; // texto del paso actual
  pct: number; // 0-100 global ponderado por formato
  perFormat: Record<string, PerFormatState>;
  error?: string;
  createdAt: number;
  finishedAt?: number;
  /** crm-export-delivery-profiles: trazabilidad del perfil de entrega del job. */
  deliverable: Deliverable;
}

/** Contexto que necesita cada builder para ejecutar. */
export interface JobBuildContext {
  config: TenantConfig;
  outputDir: string;
  frontDir: string;
  /** crm-export-runtime-config: cableado runtime de plataforma (opcional para no romper tests directos). */
  runtimeConfig?: RuntimeConfig;
  /** crm-export-delivery-profiles: destinatario del ZIP para este job. */
  deliverable: Deliverable;
}

/** Firma unificada de un builder inyectable (permite fakes en test). */
export type BuilderFn = (
  ctx: JobBuildContext,
  emit: Emitter,
  signal: AbortSignal,
) => Promise<BuildResult>;

export type BuilderMap = Partial<Record<BuildFormat, BuilderFn>>;

/** API del lock inyectable (permite fakes en test). */
export interface LockApi {
  acquireLock(): boolean;
  releaseLock(): void;
  startWatchdog(controller: AbortController, onTimeout: () => void): void;
}

export interface StartJobParams {
  projectId: string;
  formats: BuildFormat[];
  config: TenantConfig;
  outputDir: string;
  frontDir: string;
  /** crm-export-runtime-config: cableado runtime de plataforma para este job. */
  runtimeConfig?: RuntimeConfig;
  /** crm-export-delivery-profiles: destinatario del ZIP (route valida y aplica el default). */
  deliverable: Deliverable;
}

export interface JobDeps {
  builders?: BuilderMap;
  lock?: LockApi;
  /** Retencion del ultimo job terminado (ms). Por defecto 30 min. */
  retentionMs?: number;
}

/** Error identificable para que la ruta responda 409. */
export class LockBusyError extends Error {
  readonly code = 'build_in_progress';
  constructor(message = 'Ya hay un build en curso. Espera a que termine.') {
    super(message);
    this.name = 'LockBusyError';
  }
}

const RETENTION_MS = 30 * 60 * 1000; // 30 minutos

// ---------------------------------------------------------------------------
// Builders y lock por defecto (adaptan las firmas reales a BuilderFn/LockApi)
// ---------------------------------------------------------------------------

const defaultBuilders: BuilderMap = {
  'web-zip': (ctx, emit, signal) =>
    buildWebZip(ctx.config, ctx.frontDir, ctx.outputDir, emit, signal, {
      runtimeConfig: ctx.runtimeConfig,
      deliverable: ctx.deliverable,
    }),
  ipa: (ctx, emit, signal) =>
    buildIpa(ctx.config, ctx.frontDir, ctx.outputDir, emit, signal, {
      runtimeConfig: ctx.runtimeConfig,
      deliverable: ctx.deliverable,
    }),
  exe: (ctx, emit, signal) =>
    buildExe(ctx.config, ctx.frontDir, ctx.outputDir, emit, signal, {
      runtimeConfig: ctx.runtimeConfig,
      deliverable: ctx.deliverable,
    }),
  apk: (ctx, emit, signal) =>
    buildApk(ctx.config, ctx.frontDir, ctx.outputDir, emit, signal, {
      runtimeConfig: ctx.runtimeConfig,
      deliverable: ctx.deliverable,
    }),
};

const defaultLock: LockApi = { acquireLock, releaseLock, startWatchdog };

// ---------------------------------------------------------------------------
// Estado en memoria
// ---------------------------------------------------------------------------

// Job en curso o ultimo job terminado dentro de la ventana de retencion.
let currentJob: ExportJob | undefined;
// Todos los jobs accesibles por id (respetando la retencion).
const jobsById = new Map<string, ExportJob>();
// Controladores de aborto para poder cancelar jobs en curso.
const controllersById = new Map<string, AbortController>();

/** Programa la limpieza del job terminado tras la ventana de retencion. */
function scheduleRetention(job: ExportJob, retentionMs: number): void {
  const timer = setTimeout(() => {
    jobsById.delete(job.id);
    controllersById.delete(job.id);
    if (currentJob?.id === job.id) currentJob = undefined;
  }, retentionMs);
  // No debe mantener vivo el event loop del proceso.
  if (typeof timer.unref === 'function') timer.unref();
}

// ---------------------------------------------------------------------------
// API publica
// ---------------------------------------------------------------------------

/**
 * Arranca un job de exportacion: adquiere el lock, monta el watchdog y lanza
 * runJob() en background. Devuelve el job inmediatamente (para el 202).
 * Si el lock esta ocupado lanza LockBusyError (la ruta lo mapea a 409).
 */
export function startJob(params: StartJobParams, deps: JobDeps = {}): ExportJob {
  const lock = deps.lock ?? defaultLock;
  const builders = { ...defaultBuilders, ...deps.builders };
  const retentionMs = deps.retentionMs ?? RETENTION_MS;

  if (!lock.acquireLock()) {
    throw new LockBusyError();
  }

  const perFormat: Record<string, PerFormatState> = {};
  for (const format of params.formats) {
    perFormat[format] = { status: 'pending', pct: 0 };
  }

  const job: ExportJob = {
    id: randomUUID(),
    projectId: params.projectId,
    formats: params.formats,
    status: 'running',
    pct: 0,
    perFormat,
    createdAt: Date.now(),
    deliverable: params.deliverable,
  };

  currentJob = job;
  jobsById.set(job.id, job);

  const controller = new AbortController();
  controllersById.set(job.id, controller);

  // Watchdog (20 min, existente): al disparar libera el lock y marca error.
  lock.startWatchdog(controller, () => {
    if (job.status === 'running') {
      job.status = 'error';
      job.error = 'Timeout 20min — build abortado por el servidor';
      job.finishedAt = Date.now();
      controller.abort();
      scheduleRetention(job, retentionMs);
    }
  });

  // Lanza el trabajo en background; nunca se hace await aqui.
  void runJob(job, params, builders as BuilderMap, lock, controller, retentionMs);

  return job;
}

/**
 * Ejecuta los builders en serie volcando los eventos Emitter al job en memoria.
 * El lock se libera SIEMPRE (finally), incluso ante fallo o watchdog.
 */
async function runJob(
  job: ExportJob,
  params: StartJobParams,
  builders: BuilderMap,
  lock: LockApi,
  controller: AbortController,
  retentionMs: number,
): Promise<void> {
  const ctx: JobBuildContext = {
    config: params.config,
    outputDir: params.outputDir,
    frontDir: params.frontDir,
    runtimeConfig: params.runtimeConfig,
    deliverable: params.deliverable,
  };
  const total = params.formats.length;

  try {
    for (let idx = 0; idx < total; idx++) {
      // Si el watchdog ya marco error, no seguimos con mas formatos.
      if (job.status === 'error') break;

      const format = params.formats[idx];
      job.currentFormat = format;
      job.perFormat[format].status = 'running';

      // Emitter: traduce los eventos de progreso a estado del job.
      const emit: Emitter = (event) => {
        if (typeof event.pct === 'number') {
          job.perFormat[format].pct = event.pct;
          // pct global = suma ponderada equitativa por formato.
          job.pct = Math.round(((idx + event.pct / 100) / total) * 100);
        }
        if (event.step) job.step = event.step;
        if (event.outputPath) job.perFormat[format].outputPath = event.outputPath;
      };

      let result: BuildResult;
      try {
        const builder = builders[format];
        if (!builder) {
          result = { success: false, error: `Builder no disponible: ${format}` };
        } else {
          result = await builder(ctx, emit, controller.signal);
        }
      } catch (err) {
        result = { success: false, error: err instanceof Error ? err.message : String(err) };
      }

      if (result.success) {
        job.perFormat[format].status = 'done';
        job.perFormat[format].pct = 100;
        job.perFormat[format].outputPath = result.outputPath;
        job.pct = Math.round(((idx + 1) / total) * 100);
      } else {
        job.perFormat[format].status = 'error';
        job.perFormat[format].error = result.error;
        job.status = 'error';
        job.error = result.error;
        break;
      }
    }

    if (job.status !== 'error') {
      job.status = 'done';
      job.pct = 100;
    }
  } catch (err) {
    job.status = 'error';
    job.error = err instanceof Error ? err.message : String(err);
  } finally {
    job.finishedAt ??= Date.now();
    job.currentFormat = undefined;
    // Aborta el controller para cancelar el timer del watchdog (evita fugas).
    if (!controller.signal.aborted) controller.abort();
    // El lock se libera SIEMPRE.
    lock.releaseLock();
    scheduleRetention(job, retentionMs);
  }
}

/** Devuelve un job por id (si sigue en retencion). */
export function getJob(id: string): ExportJob | undefined {
  return jobsById.get(id);
}

/** Devuelve el job en curso o el ultimo terminado dentro de la retencion. */
export function getActiveJob(): ExportJob | undefined {
  return currentJob;
}

/**
 * Cancela un job en curso invocando el AbortController asociado.
 * La tarea de fondo (runJob) capturara la señal y limpiara el lock.
 */
export function cancelJob(id: string): boolean {
  const job = jobsById.get(id);
  const controller = controllersById.get(id);
  
  if (job && job.status === 'running' && controller) {
    job.status = 'error';
    job.error = 'Exportación cancelada por el usuario';
    job.finishedAt = Date.now();
    controller.abort();
    // La limpieza de retention se dispara en runJob (finally)
    return true;
  }
  return false;
}

/** Solo para tests: resetea el estado en memoria del gestor. */
export function __resetJobsForTest(): void {
  currentJob = undefined;
  jobsById.clear();
  controllersById.clear();
}
