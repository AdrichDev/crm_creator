/**
 * back/src/routes/__tests__/exports-routes.test.ts
 *
 * Tests del contrato HTTP del exportador (Fase 1, tarea 1.6).
 * Runner: node --import tsx --test
 *
 * Estrategia (patron del repo, ver service-operator.test.ts): BD y job manager se
 * inyectan como dobles (DI); se ejercita la logica REAL de los handlers sin BD ni
 * lock. req/res se simulan.
 */

import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { Response } from 'express';
import {
  createExportHandler,
  statusHandler,
  activeHandler,
  downloadHandler,
  type ExportsDeps,
} from '../exports.js';
import { LockBusyError, type ExportJob, type StartJobParams } from '../../lib/export-job-manager.js';
import type { AuthedRequest } from '../../middleware/types.js';

// ── Helpers req/res ──────────────────────────────────────────────────────────

function mockRes() {
  const res = { statusCode: 200, ended: false } as unknown as Response & {
    statusCode: number;
    ended: boolean;
    body?: unknown;
    status(code: number): typeof res;
    json(body: unknown): typeof res;
    end(): typeof res;
  };
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body: unknown) => {
    res.body = body;
    return res;
  };
  res.end = () => {
    res.ended = true;
    return res;
  };
  return res;
}

function fakeJob(id: string): ExportJob {
  return {
    id,
    projectId: 'proj-1',
    formats: ['web-zip'],
    status: 'running',
    pct: 10,
    perFormat: { 'web-zip': { status: 'running', pct: 10 } },
    createdAt: Date.now(),
  };
}

// crm-onboarding-db-keys-export-connect: el gate fail-closed de T4 exige
// `api.url` en la config del negocio + las 2 keys de Supabase horneadas
// (`deps.publicEnvSecrets`). `okDb`/`okPublicEnvSecrets` ya las incluyen para
// que los tests preexistentes (que esperan 202/409, no 422) sigan verdes.
const okDb: ExportsDeps['db'] = {
  membership: {
    findFirst: async () => ({ id: 'm-1' }),
    findMany: async () => [],
  },
  businessSetting: {
    findFirst: async () => ({
      datos: { business: { name: 'Demo' }, api: { url: 'https://api.example.com' } },
    }),
  },
  exportVersion: {
    count: async () => 0,
    create: async () => ({
      id: 'v-1',
      businessId: 'proj-1',
      version: '1.0.0',
      changeNote: null,
      storagePath: 'proj-1/v-1.zip',
      createdAt: new Date(),
    }),
    findFirst: async () => null,
    findMany: async () => [],
  },
  business: { findMany: async () => [] },
  tenantStateEvent: { findMany: async () => [] },
};

/** Doble de `deps.publicEnvSecrets` con las 2 keys de Supabase horneadas (gate T4 en verde). */
const okPublicEnvSecrets: ExportsDeps['publicEnvSecrets'] = {
  read: async () => [
    { envVarName: 'NEXT_PUBLIC_SUPABASE_URL', value: 'https://demo.supabase.co' },
    { envVarName: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', value: 'ey.anon.key' },
  ],
};

// ── GET /:id/download — guardas (404/400) ───────────────────────────────────

describe('GET /api/exports/:id/download', () => {
  function depsWithJob(job: ExportJob | undefined): ExportsDeps {
    return {
      db: okDb,
      jobs: {
        startJob: () => fakeJob('x'),
        getJob: () => job,
        getActiveJob: () => undefined,
        cancelJob: () => false,
      },
    };
  }

  test('404 job_not_found si el job no existe', () => {
    const req = { params: { id: 'nope' } } as unknown as AuthedRequest;
    const res = mockRes();
    downloadHandler(depsWithJob(undefined))(req, res);
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { error: { code: 'job_not_found', message: 'Job no encontrado' } });
  });

  test('400 job_not_done si el job aun corre', () => {
    const req = { params: { id: 'job-1' } } as unknown as AuthedRequest;
    const res = mockRes();
    downloadHandler(depsWithJob(fakeJob('job-1')))(req, res); // fakeJob → status 'running'
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error: { code: 'job_not_done', message: 'La exportación aún no ha terminado' } });
  });

  test('404 file_not_found si el ZIP no esta en disco', () => {
    const done: ExportJob = {
      ...fakeJob('job-2'),
      status: 'done',
      pct: 100,
      perFormat: { 'web-zip': { status: 'done', pct: 100, outputPath: '/ruta/inexistente/x.zip' } },
    };
    const req = { params: { id: 'job-2' } } as unknown as AuthedRequest;
    const res = mockRes();
    downloadHandler(depsWithJob(done))(req, res);
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { error: { code: 'file_not_found', message: 'Archivo de exportación no encontrado' } });
  });
});

// ── POST / → 202 ─────────────────────────────────────────────────────────────

describe('POST /api/exports', () => {
  test('202 { jobId } con proyecto valido', async () => {
    const deps: ExportsDeps = {
      db: okDb,
      jobs: {
        startJob: () => fakeJob('job-abc'),
        getJob: () => undefined,
        getActiveJob: () => undefined,
        cancelJob: () => false,
      },
      publicEnvSecrets: okPublicEnvSecrets,
    };
    const req = {
      userId: 'u-1',
      body: { projectId: 'proj-1', formats: ['web-zip'] },
    } as unknown as AuthedRequest;
    const res = mockRes();

    await createExportHandler(deps)(req, res);
    assert.equal(res.statusCode, 202);
    assert.deepEqual(res.body, { jobId: 'job-abc' });
  });

  test('409 si el lock esta ocupado (LockBusyError)', async () => {
    const deps: ExportsDeps = {
      db: okDb,
      jobs: {
        startJob: () => {
          throw new LockBusyError();
        },
        getJob: () => undefined,
        getActiveJob: () => undefined,
        cancelJob: () => false,
      },
      publicEnvSecrets: okPublicEnvSecrets,
    };
    const req = {
      userId: 'u-1',
      body: { projectId: 'proj-1', formats: ['web-zip'] },
    } as unknown as AuthedRequest;
    const res = mockRes();

    await createExportHandler(deps)(req, res);
    assert.equal(res.statusCode, 409);
    assert.equal((res.body as { error: { code: string } }).error.code, 'build_in_progress');
  });

  test('202 con los cuatro formatos nativos (apk, exe, ipa)', async () => {
    const deps: ExportsDeps = {
      db: okDb,
      jobs: {
        startJob: () => fakeJob('job-multi'),
        getJob: () => undefined,
        getActiveJob: () => undefined,
        cancelJob: () => false,
      },
      publicEnvSecrets: okPublicEnvSecrets,
    };
    const req = {
      userId: 'u-1',
      body: { projectId: 'proj-1', formats: ['apk', 'exe', 'ipa'] },
    } as unknown as AuthedRequest;
    const res = mockRes();

    await createExportHandler(deps)(req, res);
    assert.equal(res.statusCode, 202);
    assert.deepEqual(res.body, { jobId: 'job-multi' });
  });

  test('400 invalid_format si el formato es desconocido', async () => {
    const deps: ExportsDeps = {
      db: okDb,
      jobs: {
        startJob: () => fakeJob('x'),
        getJob: () => undefined,
        getActiveJob: () => undefined,
        cancelJob: () => false,
      },
    };
    const req = {
      userId: 'u-1',
      body: { projectId: 'proj-1', formats: ['foo'] },
    } as unknown as AuthedRequest;
    const res = mockRes();

    await createExportHandler(deps)(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal((res.body as { error: { code: string } }).error.code, 'invalid_format');
  });
});

// ── crm-export-runtime-config WU1: resolución de runtimeConfig ──────────────

describe('POST /api/exports — runtimeConfig (crm-export-runtime-config)', () => {
  test('1.3 runtimeConfig presente y correcto en el job arrancado', async () => {
    let captured: StartJobParams | undefined;
    const deps: ExportsDeps = {
      db: okDb,
      jobs: {
        startJob: (params) => {
          captured = params;
          return fakeJob('job-runtime');
        },
        getJob: () => undefined,
        getActiveJob: () => undefined,
        cancelJob: () => false,
      },
      tenantKeys: { issueKey: async () => ({ token: 'tk_test_plaintext' }) },
      publicEnvSecrets: okPublicEnvSecrets,
    };
    const req = {
      userId: 'u-1',
      body: { projectId: 'proj-1', formats: ['web-zip'] },
    } as unknown as AuthedRequest;
    const res = mockRes();

    await createExportHandler(deps)(req, res);

    assert.equal(res.statusCode, 202);
    assert.ok(captured?.runtimeConfig, 'runtimeConfig debe propagarse a startJob');
    assert.equal(captured?.runtimeConfig?.tenantId, 'proj-1', 'tenantId = businessId del negocio');
    assert.equal(captured?.runtimeConfig?.tenantApiKey, 'tk_test_plaintext');
    assert.equal(typeof captured?.runtimeConfig?.platformApiUrl, 'string');
  });

  test('1.3 sin deps.tenantKeys: runtimeConfig igual presente, tenantApiKey vacío (sin tocar BD real)', async () => {
    let captured: StartJobParams | undefined;
    const deps: ExportsDeps = {
      db: okDb,
      jobs: {
        startJob: (params) => {
          captured = params;
          return fakeJob('job-runtime-2');
        },
        getJob: () => undefined,
        getActiveJob: () => undefined,
        cancelJob: () => false,
      },
      publicEnvSecrets: okPublicEnvSecrets,
    };
    const req = {
      userId: 'u-1',
      body: { projectId: 'proj-1', formats: ['web-zip'] },
    } as unknown as AuthedRequest;
    const res = mockRes();

    await createExportHandler(deps)(req, res);

    assert.equal(res.statusCode, 202);
    assert.ok(captured?.runtimeConfig);
    assert.equal(captured?.runtimeConfig?.tenantId, 'proj-1');
    assert.equal(captured?.runtimeConfig?.tenantApiKey, '');
  });

  test('1.3 fallo al emitir la clave no bloquea el export (fail-open)', async () => {
    let captured: StartJobParams | undefined;
    const deps: ExportsDeps = {
      db: okDb,
      jobs: {
        startJob: (params) => {
          captured = params;
          return fakeJob('job-runtime-3');
        },
        getJob: () => undefined,
        getActiveJob: () => undefined,
        cancelJob: () => false,
      },
      tenantKeys: {
        issueKey: async () => {
          throw new Error('db down');
        },
      },
      publicEnvSecrets: okPublicEnvSecrets,
    };
    const req = {
      userId: 'u-1',
      body: { projectId: 'proj-1', formats: ['web-zip'] },
    } as unknown as AuthedRequest;
    const res = mockRes();

    await createExportHandler(deps)(req, res);

    assert.equal(res.statusCode, 202);
    assert.equal(captured?.runtimeConfig?.tenantApiKey, '');
  });
});

// ── crm-onboarding-db-keys-export-connect: el export NO bloquea por config de BD ──
// Decisión 12/07/2026: la BD/APIs se configuran en el onboarding ("BD, API y Keys");
// el export hornea lo que el negocio haya guardado y arranca SIEMPRE (fail-open).
// No hay gate 422/503: exportar nunca se corta por vars de conexión faltantes.

describe('POST /api/exports — fail-open de config BD/keys', () => {
  test('arranca (202) aunque falten las keys de Supabase (publicEnvSecrets vacío)', async () => {
    const deps: ExportsDeps = {
      db: okDb,
      jobs: { startJob: () => fakeJob('job-fo-1'), getJob: () => undefined, getActiveJob: () => undefined, cancelJob: () => false },
      publicEnvSecrets: { read: async () => [] },
    };
    const req = { userId: 'u-1', body: { projectId: 'proj-1', formats: ['web-zip'] } } as unknown as AuthedRequest;
    const res = mockRes();
    await createExportHandler(deps)(req, res);
    assert.equal(res.statusCode, 202);
    assert.deepEqual(res.body, { jobId: 'job-fo-1' });
  });

  test('arranca (202) aunque falte api.url', async () => {
    const dbSinApiUrl: ExportsDeps['db'] = {
      ...okDb,
      businessSetting: { findFirst: async () => ({ datos: { business: { name: 'Demo' } } }) },
    };
    const deps: ExportsDeps = {
      db: dbSinApiUrl,
      jobs: { startJob: () => fakeJob('job-fo-2'), getJob: () => undefined, getActiveJob: () => undefined, cancelJob: () => false },
      publicEnvSecrets: okPublicEnvSecrets,
    };
    const req = { userId: 'u-1', body: { projectId: 'proj-1', formats: ['web-zip'] } } as unknown as AuthedRequest;
    const res = mockRes();
    await createExportHandler(deps)(req, res);
    assert.equal(res.statusCode, 202);
  });

  test('arranca (202) con las 3 vars presentes', async () => {
    const deps: ExportsDeps = {
      db: okDb,
      jobs: { startJob: () => fakeJob('job-fo-3'), getJob: () => undefined, getActiveJob: () => undefined, cancelJob: () => false },
      publicEnvSecrets: okPublicEnvSecrets,
    };
    const req = { userId: 'u-1', body: { projectId: 'proj-1', formats: ['web-zip'] } } as unknown as AuthedRequest;
    const res = mockRes();
    await createExportHandler(deps)(req, res);
    assert.equal(res.statusCode, 202);
    assert.deepEqual(res.body, { jobId: 'job-fo-3' });
  });

  test('un fallo al leer publicEnvSecrets NO bloquea: arranca 202 (fail-open)', async () => {
    const deps: ExportsDeps = {
      db: okDb,
      jobs: { startJob: () => fakeJob('job-fo-4'), getJob: () => undefined, getActiveJob: () => undefined, cancelJob: () => false },
      publicEnvSecrets: { read: async () => { throw new Error('kms down'); } },
    };
    const req = { userId: 'u-1', body: { projectId: 'proj-1', formats: ['web-zip'] } } as unknown as AuthedRequest;
    const res = mockRes();
    await createExportHandler(deps)(req, res);
    assert.equal(res.statusCode, 202);
  });
});

// ── GET /:id/status ──────────────────────────────────────────────────────────

describe('GET /api/exports/:id/status', () => {
  test('200 con job existente', () => {
    const deps: ExportsDeps = {
      db: okDb,
      jobs: {
        startJob: () => fakeJob('x'),
        getJob: (id) => (id === 'job-1' ? fakeJob('job-1') : undefined),
        getActiveJob: () => undefined,
        cancelJob: () => false,
      },
    };
    const req = { params: { id: 'job-1' } } as unknown as AuthedRequest;
    const res = mockRes();

    statusHandler(deps)(req as never, res);
    assert.equal(res.statusCode, 200);
    assert.equal((res.body as ExportJob).id, 'job-1');
  });

  test('404 con id inexistente', () => {
    const deps: ExportsDeps = {
      db: okDb,
      jobs: {
        startJob: () => fakeJob('x'),
        getJob: () => undefined,
        getActiveJob: () => undefined,
        cancelJob: () => false,
      },
    };
    const req = { params: { id: 'nope' } } as unknown as AuthedRequest;
    const res = mockRes();

    statusHandler(deps)(req as never, res);
    assert.equal(res.statusCode, 404);
  });
});

// ── GET /active ──────────────────────────────────────────────────────────────

describe('GET /api/exports/active', () => {
  test('204 sin job activo', () => {
    const deps: ExportsDeps = {
      db: okDb,
      jobs: {
        startJob: () => fakeJob('x'),
        getJob: () => undefined,
        getActiveJob: () => undefined,
        cancelJob: () => false,
      },
    };
    const res = mockRes();
    activeHandler(deps)({} as never, res);
    assert.equal(res.statusCode, 204);
    assert.equal(res.ended, true);
  });

  test('200 con job activo', () => {
    const deps: ExportsDeps = {
      db: okDb,
      jobs: {
        startJob: () => fakeJob('x'),
        getJob: () => undefined,
        getActiveJob: () => fakeJob('job-live'),
        cancelJob: () => false,
      },
    };
    const res = mockRes();
    activeHandler(deps)({} as never, res);
    assert.equal(res.statusCode, 200);
    assert.equal((res.body as ExportJob).id, 'job-live');
  });
});
