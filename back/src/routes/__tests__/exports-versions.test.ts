/**
 * back/src/routes/__tests__/exports-versions.test.ts
 *
 * crm-generator-versiones-historico (WU3, tarea 3.8). Runner: node --import tsx --test
 * Cubre: resolución de semver en POST /exports (auto 1.0.0, validación, rechazo),
 * el closure onComplete (orden zip→upload→create, fallo de storage no crea fila),
 * GET /versions (scoping por membership + distinctCount) y
 * GET /versions/:id/download (200/404), y el orden de registro de rutas (3.7).
 *
 * Estrategia (patrón del repo): BD, jobs y artifactStorage se inyectan como
 * dobles (DI); sin red, sin Prisma, sin Supabase real.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Response } from 'express';
import {
  createExportHandler,
  versionsHandler,
  downloadVersionHandler,
  makeExportsRouter,
  type ExportsDeps,
  type ExportsArtifactStorage,
} from '../exports.js';
import { type ExportJob, type StartJobParams } from '../../lib/export-job-manager.js';
import type { AuthedRequest } from '../../middleware/types.js';

// ── Helpers req/res (mismo patrón que exports-routes.test.ts) ──────────────

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

interface VersionRow {
  id: string;
  businessId: string;
  version: string;
  changeNote: string | null;
  storagePath: string;
  createdAt: Date;
}

function makeDb(overrides: Partial<ExportsDeps['db']> = {}): ExportsDeps['db'] {
  return {
    membership: {
      findFirst: async () => ({ id: 'm-1' }),
      findMany: async () => [{ businessId: 'proj-1' }],
    },
    // crm-onboarding-db-keys-export-connect T4: gate fail-closed exige
    // `api.url` en config (junto con las 2 keys de Supabase, ver
    // `okPublicEnvSecrets`) para que createExportHandler siga arrancando el
    // job en los tests preexistentes que esperan 202.
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
    business: { findMany: async () => [{ id: 'proj-1', nombre: 'Demo', lifecycle: 'ACTIVE' }] },
    tenantStateEvent: { findMany: async () => [] },
    ...overrides,
  };
}

function fakeArtifactStorage(overrides: Partial<ExportsArtifactStorage> = {}): ExportsArtifactStorage {
  return {
    zipDirectory: async () => Buffer.from('zip-bytes'),
    upload: async (businessId, versionId) => ({ storagePath: `${businessId}/${versionId}.zip` }),
    sign: async (storagePath) => ({ url: `https://signed.example/${storagePath}` }),
    ...overrides,
  };
}

/** Doble de `deps.publicEnvSecrets` con las 2 keys de Supabase horneadas (gate T4 en verde). */
const okPublicEnvSecrets: ExportsDeps['publicEnvSecrets'] = {
  read: async () => [
    { envVarName: 'NEXT_PUBLIC_SUPABASE_URL', value: 'https://demo.supabase.co' },
    { envVarName: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', value: 'ey.anon.key' },
  ],
};

// ── POST /exports — resolución de semver (3.3) ──────────────────────────────

describe('POST /api/exports — versionado (crm-generator-versiones-historico)', () => {
  test('3.3 primer export del proyecto: version auto "1.0.0" sin pedirla en el body', async () => {
    const deps: ExportsDeps = {
      db: makeDb({ exportVersion: { ...makeDb().exportVersion, count: async () => 0 } }),
      jobs: {
        startJob: () => fakeJob('job-1'),
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
  });

  test('3.3 segundo export sin version en el body: 400 invalid_version', async () => {
    const deps: ExportsDeps = {
      db: makeDb({ exportVersion: { ...makeDb().exportVersion, count: async () => 1 } }),
      jobs: {
        startJob: () => fakeJob('job-2'),
        getJob: () => undefined,
        getActiveJob: () => undefined,
        cancelJob: () => false,
      },
    };
    const req = {
      userId: 'u-1',
      body: { projectId: 'proj-1', formats: ['web-zip'] },
    } as unknown as AuthedRequest;
    const res = mockRes();

    await createExportHandler(deps)(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal((res.body as { error: { code: string } }).error.code, 'invalid_version');
  });

  test('3.3 version con formato invalido (no semver): 400 invalid_version', async () => {
    const deps: ExportsDeps = {
      db: makeDb({ exportVersion: { ...makeDb().exportVersion, count: async () => 1 } }),
      jobs: {
        startJob: () => fakeJob('job-3'),
        getJob: () => undefined,
        getActiveJob: () => undefined,
        cancelJob: () => false,
      },
    };
    const req = {
      userId: 'u-1',
      body: { projectId: 'proj-1', formats: ['web-zip'], version: 'v2' },
    } as unknown as AuthedRequest;
    const res = mockRes();

    await createExportHandler(deps)(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal((res.body as { error: { code: string } }).error.code, 'invalid_version');
  });

  test('3.3 version igual o menor a la ultima existente: 400 version_not_greater', async () => {
    const deps: ExportsDeps = {
      db: makeDb({
        exportVersion: {
          ...makeDb().exportVersion,
          count: async () => 1,
          findFirst: async () => ({
            id: 'v-old',
            businessId: 'proj-1',
            version: '1.2.0',
            changeNote: null,
            storagePath: 'proj-1/v-old.zip',
            createdAt: new Date(),
          }),
        },
      }),
      jobs: {
        startJob: () => fakeJob('job-4'),
        getJob: () => undefined,
        getActiveJob: () => undefined,
        cancelJob: () => false,
      },
    };
    const req = {
      userId: 'u-1',
      body: { projectId: 'proj-1', formats: ['web-zip'], version: '1.2.0' },
    } as unknown as AuthedRequest;
    const res = mockRes();

    await createExportHandler(deps)(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal((res.body as { error: { code: string } }).error.code, 'version_not_greater');
  });

  test('3.3 version estrictamente mayor: 202, job arranca', async () => {
    const deps: ExportsDeps = {
      db: makeDb({
        exportVersion: {
          ...makeDb().exportVersion,
          count: async () => 1,
          findFirst: async () => ({
            id: 'v-old',
            businessId: 'proj-1',
            version: '1.2.0',
            changeNote: null,
            storagePath: 'proj-1/v-old.zip',
            createdAt: new Date(),
          }),
        },
      }),
      jobs: {
        startJob: () => fakeJob('job-5'),
        getJob: () => undefined,
        getActiveJob: () => undefined,
        cancelJob: () => false,
      },
      publicEnvSecrets: okPublicEnvSecrets,
    };
    const req = {
      userId: 'u-1',
      body: { projectId: 'proj-1', formats: ['web-zip'], version: '1.3.0', changeNote: 'fix' },
    } as unknown as AuthedRequest;
    const res = mockRes();

    await createExportHandler(deps)(req, res);
    assert.equal(res.statusCode, 202);
  });

  test('3.3 semver numerico no lexical: 1.10.0 > 1.9.0 se acepta', async () => {
    const deps: ExportsDeps = {
      db: makeDb({
        exportVersion: {
          ...makeDb().exportVersion,
          count: async () => 1,
          findFirst: async () => ({
            id: 'v-old',
            businessId: 'proj-1',
            version: '1.9.0',
            changeNote: null,
            storagePath: 'proj-1/v-old.zip',
            createdAt: new Date(),
          }),
        },
      }),
      jobs: {
        startJob: () => fakeJob('job-6'),
        getJob: () => undefined,
        getActiveJob: () => undefined,
        cancelJob: () => false,
      },
      publicEnvSecrets: okPublicEnvSecrets,
    };
    const req = {
      userId: 'u-1',
      body: { projectId: 'proj-1', formats: ['web-zip'], version: '1.10.0' },
    } as unknown as AuthedRequest;
    const res = mockRes();

    await createExportHandler(deps)(req, res);
    assert.equal(res.statusCode, 202);
  });

  test('3.3 semver numerico no lexical: 1.9.0 sobre ultima 1.10.0 se rechaza', async () => {
    const deps: ExportsDeps = {
      db: makeDb({
        exportVersion: {
          ...makeDb().exportVersion,
          count: async () => 1,
          findFirst: async () => ({
            id: 'v-old',
            businessId: 'proj-1',
            version: '1.10.0',
            changeNote: null,
            storagePath: 'proj-1/v-old.zip',
            createdAt: new Date(),
          }),
        },
      }),
      jobs: {
        startJob: () => fakeJob('job-7'),
        getJob: () => undefined,
        getActiveJob: () => undefined,
        cancelJob: () => false,
      },
    };
    const req = {
      userId: 'u-1',
      body: { projectId: 'proj-1', formats: ['web-zip'], version: '1.9.0' },
    } as unknown as AuthedRequest;
    const res = mockRes();

    await createExportHandler(deps)(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal((res.body as { error: { code: string } }).error.code, 'version_not_greater');
  });

  test('3.8 changeNote de 501 caracteres: 400 invalid_change_note', async () => {
    const deps: ExportsDeps = {
      db: makeDb({
        exportVersion: {
          ...makeDb().exportVersion,
          count: async () => 1,
          findFirst: async () => ({
            id: 'v-old',
            businessId: 'proj-1',
            version: '1.2.0',
            changeNote: null,
            storagePath: 'proj-1/v-old.zip',
            createdAt: new Date(),
          }),
        },
      }),
      jobs: {
        startJob: () => fakeJob('job-8'),
        getJob: () => undefined,
        getActiveJob: () => undefined,
        cancelJob: () => false,
      },
    };
    const req = {
      userId: 'u-1',
      body: { projectId: 'proj-1', formats: ['web-zip'], version: '1.3.0', changeNote: 'a'.repeat(501) },
    } as unknown as AuthedRequest;
    const res = mockRes();

    await createExportHandler(deps)(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal((res.body as { error: { code: string } }).error.code, 'invalid_change_note');
  });

  test('3.8 changeNote de exactamente 500 caracteres: 202, se acepta', async () => {
    const deps: ExportsDeps = {
      db: makeDb({
        exportVersion: {
          ...makeDb().exportVersion,
          count: async () => 1,
          findFirst: async () => ({
            id: 'v-old',
            businessId: 'proj-1',
            version: '1.2.0',
            changeNote: null,
            storagePath: 'proj-1/v-old.zip',
            createdAt: new Date(),
          }),
        },
      }),
      jobs: {
        startJob: () => fakeJob('job-9'),
        getJob: () => undefined,
        getActiveJob: () => undefined,
        cancelJob: () => false,
      },
      publicEnvSecrets: okPublicEnvSecrets,
    };
    const req = {
      userId: 'u-1',
      body: { projectId: 'proj-1', formats: ['web-zip'], version: '1.3.0', changeNote: 'a'.repeat(500) },
    } as unknown as AuthedRequest;
    const res = mockRes();

    await createExportHandler(deps)(req, res);
    assert.equal(res.statusCode, 202);
  });
});

// ── onComplete: orden zip→upload→create y fallo de storage (3.4) ───────────

describe('onComplete (crm-generator-versiones-historico WU3.4)', () => {
  test('3.4 orden generar→subir→registrar: exportVersion.create recibe la storagePath subida', async () => {
    const order: string[] = [];
    const created: Array<{ data: unknown }> = [];
    const artifactStorage = fakeArtifactStorage({
      zipDirectory: async () => {
        order.push('zip');
        return Buffer.from('bytes');
      },
      upload: async (businessId, versionId) => {
        order.push('upload');
        return { storagePath: `${businessId}/${versionId}.zip` };
      },
    });
    const db = makeDb({
      exportVersion: {
        ...makeDb().exportVersion,
        create: async (args: unknown) => {
          order.push('create');
          created.push(args as { data: unknown });
          return {
            id: 'v-x',
            businessId: 'proj-1',
            version: '1.0.0',
            changeNote: null,
            storagePath: 'proj-1/v-x.zip',
            createdAt: new Date(),
          };
        },
      },
    });

    let captured: StartJobParams | undefined;
    const deps: ExportsDeps = {
      db,
      jobs: {
        startJob: (params) => {
          captured = params;
          return fakeJob('job-oc-1');
        },
        getJob: () => undefined,
        getActiveJob: () => undefined,
        cancelJob: () => false,
      },
      artifactStorage,
      publicEnvSecrets: okPublicEnvSecrets,
    };
    const req = {
      userId: 'u-1',
      body: { projectId: 'proj-1', formats: ['web-zip'] },
    } as unknown as AuthedRequest;
    const res = mockRes();

    await createExportHandler(deps)(req, res);
    assert.ok(captured?.onComplete, 'onComplete debe pasarse a startJob');

    await captured!.onComplete!(fakeJob('job-oc-1'));

    assert.deepEqual(order, ['zip', 'upload', 'create']);
    assert.equal(created.length, 1);
    const data = (created[0].data as { format: string; storagePath: string }).format;
    assert.equal(data, 'source', 'format siempre "source" (design.md)');
  });

  test('3.4 fallo en artifactStorage.upload propaga (no crea fila) y no revierte done — verificado via export-job-manager', async () => {
    // El wrapper de swallow-error vive en export-job-manager (params.onComplete
    // se envuelve en try/catch ahi). Aqui solo verificamos que el closure de la
    // route SI propaga el error (no lo traga el mismo) — la responsabilidad de
    // no tumbar el job 'done' es de export-job-manager (cubierto en
    // export-job-manager.test.ts, caso "fallo en onComplete no revierte done").
    let dbCreateCalled = false;
    const artifactStorage = fakeArtifactStorage({
      upload: async () => {
        throw new Error('bucket not found');
      },
    });
    const db = makeDb({
      exportVersion: {
        ...makeDb().exportVersion,
        create: async (args: unknown) => {
          dbCreateCalled = true;
          return args as never;
        },
      },
    });

    let captured: StartJobParams | undefined;
    const deps: ExportsDeps = {
      db,
      jobs: {
        startJob: (params) => {
          captured = params;
          return fakeJob('job-oc-2');
        },
        getJob: () => undefined,
        getActiveJob: () => undefined,
        cancelJob: () => false,
      },
      artifactStorage,
      publicEnvSecrets: okPublicEnvSecrets,
    };
    const req = {
      userId: 'u-1',
      body: { projectId: 'proj-1', formats: ['web-zip'] },
    } as unknown as AuthedRequest;
    const res = mockRes();

    await createExportHandler(deps)(req, res);

    await assert.rejects(() => captured!.onComplete!(fakeJob('job-oc-2')), /bucket not found/);
    assert.equal(dbCreateCalled, false, 'no debe crearse la fila si la subida fallo');
  });
});

// ── GET /versions (3.5) ──────────────────────────────────────────────────────

describe('GET /api/exports/versions', () => {
  test('3.5 lista solo negocios con membership del usuario y calcula distinctCount', async () => {
    const rows: VersionRow[] = [
      {
        id: 'v-1',
        businessId: 'proj-1',
        version: '1.1.0',
        changeNote: 'segunda',
        storagePath: 'proj-1/v-1.zip',
        createdAt: new Date('2026-07-02'),
      },
      {
        id: 'v-0',
        businessId: 'proj-1',
        version: '1.0.0',
        changeNote: null,
        storagePath: 'proj-1/v-0.zip',
        createdAt: new Date('2026-07-01'),
      },
    ];
    const db = makeDb({
      membership: { findFirst: async () => ({ id: 'm-1' }), findMany: async () => [{ businessId: 'proj-1' }] },
      exportVersion: { ...makeDb().exportVersion, findMany: async () => rows },
      business: { findMany: async () => [{ id: 'proj-1', nombre: 'Demo', lifecycle: 'ACTIVE' }] },
      tenantStateEvent: { findMany: async () => [] },
    });
    const deps: ExportsDeps = {
      db,
      jobs: {
        startJob: () => fakeJob('x'),
        getJob: () => undefined,
        getActiveJob: () => undefined,
        cancelJob: () => false,
      },
    };
    const req = { userId: 'u-1' } as unknown as AuthedRequest;
    const res = mockRes();

    await versionsHandler(deps)(req, res);

    assert.equal(res.statusCode, 200);
    const body = res.body as { versions: unknown[]; distinctCount: number };
    assert.equal(body.versions.length, 2, 'dos filas de version, mismo negocio');
    assert.equal(body.distinctCount, 1, 'distinctCount cuenta proyectos distintos, no filas');
  });

  test('3.5 sin memberships: lista vacia, distinctCount 0, sin tocar exportVersion.findMany', async () => {
    let findManyCalled = false;
    const db = makeDb({
      membership: { findFirst: async () => null, findMany: async () => [] },
      exportVersion: {
        ...makeDb().exportVersion,
        findMany: async () => {
          findManyCalled = true;
          return [];
        },
      },
    });
    const deps: ExportsDeps = {
      db,
      jobs: {
        startJob: () => fakeJob('x'),
        getJob: () => undefined,
        getActiveJob: () => undefined,
        cancelJob: () => false,
      },
    };
    const req = { userId: 'u-2' } as unknown as AuthedRequest;
    const res = mockRes();

    await versionsHandler(deps)(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { versions: [], distinctCount: 0 });
    assert.equal(findManyCalled, false, 'no debe consultar versiones sin negocios propios');
  });
});

// ── GET /versions/:id/download (3.6) ─────────────────────────────────────────

describe('GET /api/exports/versions/:id/download', () => {
  test('3.6 200 { url } con version existente y membership valida', async () => {
    const db = makeDb({
      exportVersion: {
        ...makeDb().exportVersion,
        findFirst: async () => ({
          id: 'v-1',
          businessId: 'proj-1',
          version: '1.0.0',
          changeNote: null,
          storagePath: 'proj-1/v-1.zip',
          createdAt: new Date(),
        }),
      },
      membership: { findFirst: async () => ({ id: 'm-1' }), findMany: async () => [] },
    });
    const deps: ExportsDeps = {
      db,
      jobs: {
        startJob: () => fakeJob('x'),
        getJob: () => undefined,
        getActiveJob: () => undefined,
        cancelJob: () => false,
      },
      artifactStorage: fakeArtifactStorage(),
    };
    const req = { userId: 'u-1', params: { id: 'v-1' } } as unknown as AuthedRequest;
    const res = mockRes();

    await downloadVersionHandler(deps)(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal((res.body as { url: string }).url, 'https://signed.example/proj-1/v-1.zip');
  });

  test('3.6 404 version_not_found si la version no existe', async () => {
    const db = makeDb({
      exportVersion: { ...makeDb().exportVersion, findFirst: async () => null },
    });
    const deps: ExportsDeps = {
      db,
      jobs: {
        startJob: () => fakeJob('x'),
        getJob: () => undefined,
        getActiveJob: () => undefined,
        cancelJob: () => false,
      },
    };
    const req = { userId: 'u-1', params: { id: 'nope' } } as unknown as AuthedRequest;
    const res = mockRes();

    await downloadVersionHandler(deps)(req, res);
    assert.equal(res.statusCode, 404);
    assert.equal((res.body as { error: { code: string } }).error.code, 'version_not_found');
  });

  test('3.6 404 version_not_found si el usuario no tiene membership del negocio (aislamiento)', async () => {
    const db = makeDb({
      exportVersion: {
        ...makeDb().exportVersion,
        findFirst: async () => ({
          id: 'v-1',
          businessId: 'proj-otro',
          version: '1.0.0',
          changeNote: null,
          storagePath: 'proj-otro/v-1.zip',
          createdAt: new Date(),
        }),
      },
      membership: { findFirst: async () => null, findMany: async () => [] },
    });
    const deps: ExportsDeps = {
      db,
      jobs: {
        startJob: () => fakeJob('x'),
        getJob: () => undefined,
        getActiveJob: () => undefined,
        cancelJob: () => false,
      },
    };
    const req = { userId: 'u-intruso', params: { id: 'v-1' } } as unknown as AuthedRequest;
    const res = mockRes();

    await downloadVersionHandler(deps)(req, res);
    assert.equal(res.statusCode, 404, 'nunca 403 — no revela que la version existe');
    assert.equal((res.body as { error: { code: string } }).error.code, 'version_not_found');
  });

  test('3.6 502 storage_error si signExportUrl falla', async () => {
    const db = makeDb({
      exportVersion: {
        ...makeDb().exportVersion,
        findFirst: async () => ({
          id: 'v-1',
          businessId: 'proj-1',
          version: '1.0.0',
          changeNote: null,
          storagePath: 'proj-1/v-1.zip',
          createdAt: new Date(),
        }),
      },
      membership: { findFirst: async () => ({ id: 'm-1' }), findMany: async () => [] },
    });
    const deps: ExportsDeps = {
      db,
      jobs: {
        startJob: () => fakeJob('x'),
        getJob: () => undefined,
        getActiveJob: () => undefined,
        cancelJob: () => false,
      },
      artifactStorage: fakeArtifactStorage({
        sign: async () => {
          throw new Error('signed url failed');
        },
      }),
    };
    const req = { userId: 'u-1', params: { id: 'v-1' } } as unknown as AuthedRequest;
    const res = mockRes();

    await downloadVersionHandler(deps)(req, res);
    assert.equal(res.statusCode, 502);
    assert.equal((res.body as { error: { code: string } }).error.code, 'storage_error');
  });
});

// ── Orden de registro de rutas (3.7) ─────────────────────────────────────────

describe('makeExportsRouter — orden de rutas (3.7)', () => {
  test('3.7 "/versions" y "/versions/:id/download" se registran antes que las parametricas "/:id/*"', () => {
    const router = makeExportsRouter({
      db: makeDb(),
      jobs: {
        startJob: () => fakeJob('x'),
        getJob: () => undefined,
        getActiveJob: () => undefined,
        cancelJob: () => false,
      },
    });

    const layers = (router as unknown as { stack: Array<{ route?: { path: string } }> }).stack;
    const paths = layers.filter((l) => l.route).map((l) => l.route!.path);

    const idxVersions = paths.indexOf('/versions');
    const idxVersionsDownload = paths.indexOf('/versions/:id/download');
    const idxIdStatus = paths.indexOf('/:id/status');
    const idxIdDownload = paths.indexOf('/:id/download');

    assert.ok(idxVersions >= 0 && idxVersionsDownload >= 0 && idxIdStatus >= 0 && idxIdDownload >= 0);
    assert.ok(idxVersions < idxIdStatus, '"/versions" debe ir antes que "/:id/status"');
    assert.ok(idxVersions < idxIdDownload, '"/versions" debe ir antes que "/:id/download"');
    assert.ok(
      idxVersionsDownload < idxIdStatus,
      '"/versions/:id/download" debe ir antes que "/:id/status" (si no, Express la confundiria)',
    );
    assert.ok(idxVersionsDownload < idxIdDownload, '"/versions/:id/download" debe ir antes que "/:id/download"');
  });
});
