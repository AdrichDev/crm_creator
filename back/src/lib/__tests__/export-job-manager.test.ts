/**
 * back/src/lib/__tests__/export-job-manager.test.ts
 *
 * Tests del gestor de jobs de exportacion (Fase 1: 1.1-1.5).
 * Runner: node --import tsx --test
 *
 * Estrategia: builders y lock se inyectan como dobles (DI). No se toca el lock
 * real ni los builders reales. El estado en memoria se resetea antes de cada test.
 */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  startJob,
  getJob,
  getActiveJob,
  __resetJobsForTest,
  LockBusyError,
  type BuilderMap,
  type LockApi,
  type StartJobParams,
} from '../export-job-manager.js';
import type { BuildResult, Emitter } from '../export-builders/web-zip.js';

// ── Helpers ────────────────────────────────────────────────────────────────

/** Lock fake con estado propio, sin timers reales. */
function fakeLock(): LockApi & { released: number } {
  let busy = false;
  const api = {
    released: 0,
    acquireLock() {
      if (busy) return false;
      busy = true;
      return true;
    },
    releaseLock() {
      busy = false;
      api.released += 1;
    },
    startWatchdog() {
      // no-op: el watchdog no se ejercita con timers aqui.
    },
  };
  return api;
}

const baseParams = (formats: StartJobParams['formats']): StartJobParams => ({
  projectId: 'proj-1',
  formats,
  config: { business: { name: 'Demo' } } as unknown as StartJobParams['config'],
  outputDir: '/tmp/out',
  frontDir: '/tmp/front',
});

/** Espera a que el job en curso termine (done|error). */
async function waitDone(id: string): Promise<void> {
  for (let i = 0; i < 200; i++) {
    const job = getJob(id);
    if (job && job.status !== 'running') return;
    await new Promise((r) => setImmediate(r));
  }
  throw new Error('job no termino a tiempo');
}

beforeEach(() => __resetJobsForTest());

// ── 1.1 lifecycle ────────────────────────────────────────────────────────────

test('1.1 lifecycle: startJob → running → done y pct llega a 100', async () => {
  const lock = fakeLock();
  const builders: BuilderMap = {
    'web-zip': async (_ctx, emit): Promise<BuildResult> => {
      emit({ type: 'progress', pct: 50, step: 'medio' });
      return { success: true, outputPath: '/tmp/out/demo.zip' };
    },
  };

  const job = startJob(baseParams(['web-zip']), { lock, builders });
  assert.equal(job.status, 'running');

  await waitDone(job.id);
  const done = getJob(job.id)!;
  assert.equal(done.status, 'done');
  assert.equal(done.pct, 100);
  assert.equal(done.perFormat['web-zip'].status, 'done');
  assert.equal(done.perFormat['web-zip'].outputPath, '/tmp/out/demo.zip');
  assert.equal(lock.released, 1);
});

// ── 1.2 pct ponderado ────────────────────────────────────────────────────────

test('1.2 pct ponderado: 2 formatos, primero al 100% → pct global = 50', async () => {
  const lock = fakeLock();
  let captured = -1;
  const builders: BuilderMap = {
    'web-zip': async (_ctx, emit): Promise<BuildResult> => {
      emit({ type: 'progress', pct: 100 });
      captured = getActiveJob()!.pct; // pct global justo tras completar el 1er formato
      return { success: true, outputPath: '/a.zip' };
    },
    exe: async (): Promise<BuildResult> => ({ success: true, outputPath: '/b.zip' }),
  };

  const job = startJob(baseParams(['web-zip', 'exe']), { lock, builders });
  await waitDone(job.id);

  assert.equal(captured, 50, 'con el 1er formato al 100% el pct global debe ser 50');
  assert.equal(getJob(job.id)!.pct, 100);
});

// ── 1.3 lock / 409 ───────────────────────────────────────────────────────────

test('1.3 lock: segundo startJob con job activo lanza LockBusyError', () => {
  const lock = fakeLock();
  const builders: BuilderMap = {
    // Builder que nunca resuelve: mantiene el job "running" y el lock tomado.
    'web-zip': () => new Promise<BuildResult>(() => {}),
  };

  startJob(baseParams(['web-zip']), { lock, builders });
  assert.throws(
    () => startJob(baseParams(['web-zip']), { lock, builders }),
    (err: unknown) => err instanceof LockBusyError && err.code === 'build_in_progress',
  );
});

// ── 1.4 retencion ────────────────────────────────────────────────────────────

test('1.4 retencion: job terminado accesible via getActiveJob() y getJob(id)', async () => {
  const lock = fakeLock();
  const builders: BuilderMap = {
    'web-zip': async (): Promise<BuildResult> => ({ success: true, outputPath: '/x.zip' }),
  };

  const job = startJob(baseParams(['web-zip']), { lock, builders });
  await waitDone(job.id);

  assert.equal(getJob(job.id)!.status, 'done');
  assert.equal(getActiveJob()!.id, job.id, 'el ultimo terminado sigue en retencion');
});

// ── 1.5 error + lock liberado ────────────────────────────────────────────────

test('1.5 builder que rechaza → status error + lock liberado', async () => {
  const lock = fakeLock();
  const builders: BuilderMap = {
    'web-zip': async (): Promise<BuildResult> => {
      throw new Error('boom');
    },
  };

  const job = startJob(baseParams(['web-zip']), { lock, builders });
  await waitDone(job.id);

  const errored = getJob(job.id)!;
  assert.equal(errored.status, 'error');
  assert.equal(errored.error, 'boom');
  assert.equal(errored.perFormat['web-zip'].status, 'error');
  assert.equal(lock.released, 1, 'el lock debe liberarse siempre');
});

// ── crm-generator-versiones-historico (WU3.3): onComplete ───────────────────

test('3.3 onComplete se invoca cuando el job termina done, con el job final', async () => {
  const lock = fakeLock();
  const builders: BuilderMap = {
    'web-zip': async (): Promise<BuildResult> => ({ success: true, outputPath: '/x.zip' }),
  };
  let capturedJob: import('../export-job-manager.js').ExportJob | undefined;
  const onComplete = async (job: import('../export-job-manager.js').ExportJob): Promise<void> => {
    capturedJob = job;
  };

  const job = startJob({ ...baseParams(['web-zip']), onComplete }, { lock, builders });
  await waitDone(job.id);

  assert.equal(capturedJob?.id, job.id);
  assert.equal(capturedJob?.status, 'done');
});

test('3.3 onComplete NO se invoca si el job termina en error', async () => {
  const lock = fakeLock();
  const builders: BuilderMap = {
    'web-zip': async (): Promise<BuildResult> => {
      throw new Error('boom');
    },
  };
  let called = false;
  const onComplete = async (): Promise<void> => {
    called = true;
  };

  const job = startJob({ ...baseParams(['web-zip']), onComplete }, { lock, builders });
  await waitDone(job.id);

  assert.equal(getJob(job.id)!.status, 'error');
  assert.equal(called, false, 'onComplete no debe correr si el job no termino done');
});

test('3.3 fallo en onComplete no revierte el status done ni bloquea el lock', async () => {
  const lock = fakeLock();
  const builders: BuilderMap = {
    'web-zip': async (): Promise<BuildResult> => ({ success: true, outputPath: '/x.zip' }),
  };
  const onComplete = async (): Promise<void> => {
    throw new Error('storage caida');
  };

  const job = startJob({ ...baseParams(['web-zip']), onComplete }, { lock, builders });
  await waitDone(job.id);

  assert.equal(getJob(job.id)!.status, 'done', 'el job sigue done pese al fallo de onComplete');
  assert.equal(lock.released, 1, 'el lock se libera igualmente');
});
