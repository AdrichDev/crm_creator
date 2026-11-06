/**
 * back/src/lib/__tests__/export-guard.test.ts
 *
 * security-wave-2 / T5 (S3, S4): barrera de secretos y volcados sobre un
 * paquete de export. Un artefacto (arbol de directorios o ZIP ya construido)
 * se RECHAZA si lleva volcados/backups/logs, ficheros de entorno que el
 * pipeline no escribe, material de clave privada, el valor literal de un
 * secreto del operador o una forma generica de secreto (`sk-...`, JWT con
 * `role: service_role`).
 *
 * El error nombra la ruta relativa y el motivo — NUNCA el valor del secreto.
 * El `.env.local` fresco que escribe el pipeline (tenant + anon key + valores
 * FRONTEND_PUBLIC) sigue siendo aceptado: es el contrato legitimo del export.
 */

import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import JSZip from 'jszip';
import {
  ExportGuardError,
  assertCleanExportTree,
  assertCleanExportZip,
  assertCleanArchiveBuffer,
  guardExportArtifact,
  collectOperatorSecrets,
  isAllowedSqlPath,
} from '../export-guard.js';
import { buildWebZip } from '../export-builders/web-zip.js';
import { buildFixtureTmp } from './export-fixture.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const trash: string[] = [];

afterEach(() => {
  for (const d of trash.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function tmpRoot(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  trash.push(dir);
  return dir;
}

function writeFile(root: string, rel: string, content: string | Buffer): string {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  return full;
}

/** JWT sintetico (firma falsa): solo importa el payload para la regla. */
function makeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.${crypto.randomBytes(16).toString('base64url')}`;
}

const ANON_JWT = makeJwt({ role: 'anon', iss: 'supabase' });
const SERVICE_ROLE_JWT = makeJwt({ role: 'service_role', iss: 'supabase' });

/** Secreto del operador que NO tiene forma generica (prueba la regla (d)). */
const OPERATOR_TOKEN = 'aa-service-token-value-1234';
const OPERATOR_ENV = { AA_SERVICE_TOKEN: OPERATOR_TOKEN };

async function makeZipBuffer(entries: Record<string, string | Buffer>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(entries)) zip.file(name, content);
  return zip.generateAsync({ type: 'nodebuffer' });
}

/**
 * Marcador PEM ensamblado en runtime: el fichero de test NO contiene el
 * literal completo, para que el paquete generado (que copia back/src) no se
 * auto-rechace por llevar su propio fixture de prueba.
 */
const PEM_MARKER = ['-----BEGIN', 'RSA PRIVATE', 'KEY-----'].join(' ');
const PEM_END = ['-----END', 'RSA PRIVATE', 'KEY-----'].join(' ');

/** Ejecuta `fn` esperando un ExportGuardError con el codigo y la ruta dados. */
function expectViolation(fn: () => void, violation: string, relPath: string): ExportGuardError {
  let caught: unknown;
  try {
    fn();
  } catch (err) {
    caught = err;
  }
  assert.ok(caught instanceof ExportGuardError, `debe lanzar ExportGuardError (recibido: ${String(caught)})`);
  const err = caught;
  assert.equal(err.name, 'ExportGuardError');
  assert.equal(err.code, 'export_guard_violation');
  assert.equal(err.violation, violation);
  assert.equal(err.relativePath, relPath);
  assert.ok(err.message.includes(relPath), 'el mensaje debe nombrar la ruta relativa ofensora');
  // El valor del secreto NUNCA viaja en el error.
  assert.ok(!err.message.includes(OPERATOR_TOKEN), 'el mensaje no debe incluir el valor del secreto');
  return err;
}

async function expectZipViolation(
  zipPath: string,
  violation: string,
  relPath: string,
  options?: Parameters<typeof assertCleanExportZip>[1],
): Promise<ExportGuardError> {
  let caught: unknown;
  try {
    await assertCleanExportZip(zipPath, options);
  } catch (err) {
    caught = err;
  }
  assert.ok(caught instanceof ExportGuardError, `debe lanzar ExportGuardError (recibido: ${String(caught)})`);
  const err = caught;
  assert.equal(err.violation, violation);
  assert.equal(err.relativePath, relPath);
  assert.ok(!err.message.includes(OPERATOR_TOKEN), 'el mensaje no debe incluir el valor del secreto');
  return err;
}

// ---------------------------------------------------------------------------
// (d) derivacion de los secretos del operador desde el entorno
// ---------------------------------------------------------------------------

describe('collectOperatorSecrets (S3/S4)', () => {
  test('extrae los valores de los secretos del operador, incluida la contrasena de DATABASE_URL', () => {
    const values = collectOperatorSecrets({
      OPENAI_API_KEY: 'sk-live-operator-openai-0001',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-value-long-enough',
      DATABASE_URL: 'postgresql://user:super-secret-password-123@db.example.com:5432/crm?schema=public',
      SECRETS_MASTER_KEY: 'ab'.repeat(32),
      SMTP_PASS: 'smtp-app-password-1234',
    });
    const byName = new Map(values.map((v) => [v.name, v.value]));

    assert.equal(byName.get('OPENAI_API_KEY'), 'sk-live-operator-openai-0001');
    assert.equal(byName.get('SUPABASE_SERVICE_ROLE_KEY'), 'service-role-value-long-enough');
    assert.equal(byName.get('SECRETS_MASTER_KEY'), 'ab'.repeat(32));
    assert.equal(byName.get('SMTP_PASS'), 'smtp-app-password-1234');
    // DATABASE_URL completo + su parte password (dos entradas distintas).
    assert.ok(byName.get('DATABASE_URL')?.startsWith('postgresql://user:'));
    assert.equal(byName.get('DATABASE_URL (password)'), 'super-secret-password-123');
  });

  test('ignora valores cortos (<12) y los valores publicos por contrato', () => {
    const values = collectOperatorSecrets({
      AA_SERVICE_TOKEN: 'short',
      OPENAI_API_KEY: 'sk-tiny',
      SUPABASE_ANON_KEY: ANON_JWT,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_JWT,
      SUPABASE_URL: 'https://demo.supabase.co',
      NEXT_PUBLIC_TENANT_API_URL: 'https://api.example.com',
    });
    assert.deepEqual(values, []);
  });
});

// ---------------------------------------------------------------------------
// (a) volcados / backups / logs
// ---------------------------------------------------------------------------

describe('arbol: volcados y backups (S3)', () => {
  test('rechaza un *.sql suelto (volcado) nombrando la ruta', () => {
    const root = tmpRoot('guard-sql-');
    writeFile(root, 'back/dump.sql', 'SELECT 1;');
    const err = expectViolation(
      () => assertCleanExportTree(root, { env: OPERATOR_ENV }),
      'dump_file',
      'back/dump.sql',
    );
    assert.ok(/\.sql/i.test(err.message));
  });

  test('rechaza cualquier fichero bajo un directorio backups/', () => {
    const root = tmpRoot('guard-backup-');
    writeFile(root, 'back/backups/notas.txt', 'nada sensible');
    const err = expectViolation(
      () => assertCleanExportTree(root, { env: OPERATOR_ENV }),
      'backup_dir',
      'back/backups',
    );
    assert.ok(err.message.includes('backups/'), 'el motivo debe nombrar el directorio backups/');
  });

  test('rechaza *.dump, *.sql.gz y *.log', () => {
    for (const [rel, violation] of [
      ['back/prod.dump', 'dump_file'],
      ['back/prod.sql.gz', 'dump_file'],
      ['back/app.log', 'dump_file'],
    ] as const) {
      const root = tmpRoot('guard-dump-');
      writeFile(root, rel, 'x');
      expectViolation(() => assertCleanExportTree(root, { env: OPERATOR_ENV }), violation, rel);
    }
  });

  test('acepta el schema.sql del export y las migration.sql de prisma', () => {
    const root = tmpRoot('guard-sql-ok-');
    writeFile(root, 'schema.sql', 'CREATE TABLE crm.cliente (id text);');
    writeFile(root, 'prisma/migrations/20260616000000_init/migration.sql', 'CREATE TABLE crm.x (id text);');
    writeFile(root, 'app/page.tsx', 'export default function Page(){return null;}');
    assert.doesNotThrow(() => assertCleanExportTree(root, { env: OPERATOR_ENV }));
    assert.equal(isAllowedSqlPath('schema.sql'), true);
    assert.equal(isAllowedSqlPath('prisma/migrations/20260616000000_init/migration.sql'), true);
    assert.equal(isAllowedSqlPath('prisma/migrate-negocio-generado.sql'), false);
    assert.equal(isAllowedSqlPath('back/schema.sql'), false);
  });
});

// ---------------------------------------------------------------------------
// (b) ficheros de entorno
// ---------------------------------------------------------------------------

describe('arbol: ficheros de entorno (S3)', () => {
  test('rechaza un .env ajeno al pipeline', () => {
    const root = tmpRoot('guard-env-');
    writeFile(root, 'back/.env', 'DATABASE_URL=postgresql://x');
    expectViolation(() => assertCleanExportTree(root, { env: OPERATOR_ENV }), 'env_file', 'back/.env');
  });

  test('rechaza .env.production y production.env pero acepta .env.local/.env.example', () => {
    for (const rel of ['app/.env.production', 'app/production.env', 'app/.env.local.bak']) {
      const root = tmpRoot('guard-env-stray-');
      writeFile(root, rel, 'X=1');
      expectViolation(() => assertCleanExportTree(root, { env: OPERATOR_ENV }), 'env_file', rel);
    }

    const ok = tmpRoot('guard-env-ok-');
    writeFile(ok, 'app/.env.local', `NEXT_PUBLIC_SUPABASE_ANON_KEY=${ANON_JWT}\n`);
    writeFile(ok, 'app/.env.example', '# NEXT_PUBLIC_API_URL=https://tu-api.example.com\n');
    writeFile(ok, 'app/.env.local.example', '# NEXT_PUBLIC_API_URL=\n');
    assert.doesNotThrow(() => assertCleanExportTree(ok, { env: OPERATOR_ENV }));
  });
});

// ---------------------------------------------------------------------------
// (c) material de clave privada
// ---------------------------------------------------------------------------

describe('arbol: material de clave (S3)', () => {
  test('rechaza *.pem y *.key por nombre', () => {
    for (const rel of ['certs/server.pem', 'certs/client.key']) {
      const root = tmpRoot('guard-key-');
      writeFile(root, rel, 'irrelevante');
      expectViolation(() => assertCleanExportTree(root, { env: OPERATOR_ENV }), 'key_material', rel);
    }
  });

  test('rechaza un bloque PRIVATE KEY dentro de un fichero de texto', () => {
    const root = tmpRoot('guard-key-body-');
    const body = `${PEM_MARKER}\nMIIEogIBAAKCAQEA...\n${PEM_END}\n`;
    writeFile(root, 'app/notes.txt', body);
    expectViolation(() => assertCleanExportTree(root, { env: OPERATOR_ENV }), 'key_material', 'app/notes.txt');
  });
});

// ---------------------------------------------------------------------------
// (d) valor literal de un secreto del operador
// ---------------------------------------------------------------------------

describe('arbol: valor de un secreto del operador (S3/S4)', () => {
  test('rechaza un fichero que contiene el valor y nombra la variable, no el valor', () => {
    const root = tmpRoot('guard-secret-');
    writeFile(root, 'app/lib/config.ts', `export const TOKEN = '${OPERATOR_TOKEN}';\n`);
    const err = expectViolation(
      () => assertCleanExportTree(root, { env: OPERATOR_ENV }),
      'operator_secret',
      'app/lib/config.ts',
    );
    assert.ok(err.message.includes('AA_SERVICE_TOKEN'), 'el motivo debe nombrar la variable de entorno');
  });

  test('no marca valores de secreto de menos de 12 caracteres (evita falsos positivos)', () => {
    const root = tmpRoot('guard-secret-short-');
    writeFile(root, 'app/lib/config.ts', "export const NOTE = 'short';\n");
    assert.doesNotThrow(() => assertCleanExportTree(root, { env: { AA_SERVICE_TOKEN: 'short' } }));
  });

  test('nunca marca el anon key ni los valores FRONTEND_PUBLIC del tenant', () => {
    const root = tmpRoot('guard-public-');
    const tenantPublic = 'AIzaSyTenantPublicMapsValue';
    writeFile(
      root,
      'app/.env.local',
      [
        `NEXT_PUBLIC_SUPABASE_ANON_KEY=${ANON_JWT}`,
        'NEXT_PUBLIC_SUPABASE_URL=https://demo.supabase.co',
        `NEXT_PUBLIC_GOOGLE_MAPS_KEY=${tenantPublic}`,
        'NEXT_PUBLIC_TENANT_JSON=eyJidXNpbmVzcyI6eyJuYW1lIjoiRGVtbyJ9fQ==',
      ].join('\n') + '\n',
    );
    assert.doesNotThrow(() =>
      assertCleanExportTree(root, {
        env: { SUPABASE_ANON_KEY: ANON_JWT, SUPABASE_URL: 'https://demo.supabase.co' },
        publicValues: [tenantPublic],
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// (e) formas genericas de secreto
// ---------------------------------------------------------------------------

describe('arbol: formas genericas de secreto (S3/S4)', () => {
  test('rechaza una clave con forma sk-...', () => {
    const root = tmpRoot('guard-sk-');
    // Clave ensamblada en runtime: el fixture no deja el literal `sk-...` en el
    // codigo fuente (el paquete generado copia back/src y se auto-rechazaria).
    const key = ['sk-proj', 'AbCdEf0123456789AbCdEf01'].join('-');
    writeFile(root, 'app/lib/openai.ts', `const k = '${key}';\n`);
    expectViolation(() => assertCleanExportTree(root, { env: OPERATOR_ENV }), 'secret_shape', 'app/lib/openai.ts');
  });

  test('rechaza un JWT con role service_role y acepta el de role anon', () => {
    const bad = tmpRoot('guard-jwt-bad-');
    writeFile(bad, 'app/lib/supabase.ts', `const k = '${SERVICE_ROLE_JWT}';\n`);
    const err = expectViolation(
      () => assertCleanExportTree(bad, { env: OPERATOR_ENV }),
      'secret_shape',
      'app/lib/supabase.ts',
    );
    assert.ok(err.message.includes('service_role'));

    const ok = tmpRoot('guard-jwt-ok-');
    writeFile(ok, 'app/lib/supabase.ts', `const k = '${ANON_JWT}';\n`);
    assert.doesNotThrow(() => assertCleanExportTree(ok, { env: OPERATOR_ENV }));
  });

  test('no inspecciona el contenido de ficheros binarios, pero si su nombre', () => {
    const binary = tmpRoot('guard-bin-');
    writeFile(binary, 'app/public/logo.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0xff, 0xfe]));
    assert.doesNotThrow(() => assertCleanExportTree(binary, { env: OPERATOR_ENV }));

    const named = tmpRoot('guard-bin-name-');
    writeFile(named, 'app/public/server.pem', Buffer.from([0, 1, 2, 3]));
    expectViolation(
      () => assertCleanExportTree(named, { env: OPERATOR_ENV }),
      'key_material',
      'app/public/server.pem',
    );
  });
});

// ---------------------------------------------------------------------------
// ZIP ya construido
// ---------------------------------------------------------------------------

describe('ZIP: barrera sobre el artefacto construido (S3/S4)', () => {
  test('rechaza un ZIP con un .env ajeno', async () => {
    const root = tmpRoot('guard-zip-env-');
    const zipPath = path.join(root, 'art.zip');
    fs.writeFileSync(zipPath, await makeZipBuffer({ 'app/index.ts': 'export {};', 'app/.env.production': 'X=1' }));
    await expectZipViolation(zipPath, 'env_file', 'app/.env.production');
  });

  test('rechaza un ZIP con un volcado de base de datos', async () => {
    const root = tmpRoot('guard-zip-dump-');
    const zipPath = path.join(root, 'art.zip');
    fs.writeFileSync(zipPath, await makeZipBuffer({ 'dump.sql': 'SELECT 1;' }));
    await expectZipViolation(zipPath, 'dump_file', 'dump.sql');
  });

  test('rechaza un ZIP que contiene el valor de un secreto del operador', async () => {
    const root = tmpRoot('guard-zip-secret-');
    const zipPath = path.join(root, 'art.zip');
    fs.writeFileSync(
      zipPath,
      await makeZipBuffer({ 'app/lib/config.ts': `export const T = '${OPERATOR_TOKEN}';` }),
    );
    const err = await expectZipViolation(zipPath, 'operator_secret', 'app/lib/config.ts', {
      env: OPERATOR_ENV,
    });
    assert.ok(err.message.includes('AA_SERVICE_TOKEN'));
  });

  test('acepta el ZIP legitimo con el .env.local fresco (anon key + valores del tenant)', async () => {
    const root = tmpRoot('guard-zip-ok-');
    const zipPath = path.join(root, 'art.zip');
    const tenantPublic = 'AIzaSyTenantPublicMapsValue';
    fs.writeFileSync(
      zipPath,
      await makeZipBuffer({
        'app/page.tsx': 'export default function Page(){return null;}',
        'app/.env.local': [
          `NEXT_PUBLIC_SUPABASE_ANON_KEY=${ANON_JWT}`,
          'NEXT_PUBLIC_SUPABASE_URL=https://demo.supabase.co',
          `NEXT_PUBLIC_GOOGLE_MAPS_KEY=${tenantPublic}`,
        ].join('\n') + '\n',
        'app/.env.example': '# NEXT_PUBLIC_API_URL=https://tu-api.example.com\n',
        'schema.sql': 'CREATE TABLE crm.cliente (id text);',
        'prisma/migrations/20260616000000_init/migration.sql': 'CREATE TABLE crm.x (id text);',
      }),
    );
    await assertCleanExportZip(zipPath, {
      env: { SUPABASE_ANON_KEY: ANON_JWT, SUPABASE_URL: 'https://demo.supabase.co' },
      publicValues: [tenantPublic],
    });
  });

  test('assertCleanArchiveBuffer detecta el secreto en un buffer en memoria', async () => {
    const buffer = await makeZipBuffer({ 'app/lib/config.ts': `export const T = '${OPERATOR_TOKEN}';` });
    await assert.rejects(
      () => assertCleanArchiveBuffer(buffer, { env: OPERATOR_ENV }),
      (err: unknown) =>
        err instanceof ExportGuardError &&
        err.violation === 'operator_secret' &&
        err.relativePath === 'app/lib/config.ts' &&
        !err.message.includes(OPERATOR_TOKEN),
    );
  });

  test('guardExportArtifact borra el artefacto rechazado (no queda nada en disco)', async () => {
    const root = tmpRoot('guard-zip-unlink-');
    const zipPath = path.join(root, 'art.zip');
    fs.writeFileSync(zipPath, await makeZipBuffer({ 'dump.sql': 'SELECT 1;' }));
    await assert.rejects(() => guardExportArtifact(zipPath, { env: OPERATOR_ENV }), ExportGuardError);
    assert.equal(fs.existsSync(zipPath), false, 'el artefacto rechazado debe borrarse');
  });
});

// ---------------------------------------------------------------------------
// Cableado del builder: un artefacto rechazado no se entrega
// ---------------------------------------------------------------------------

test('buildWebZip rechaza el ZIP si arrastra material sensible y no deja artefacto', async () => {
  const fixture = buildFixtureTmp();
  trash.push(fixture.rootDir);
  // `shared/` se empaqueta sin allowlist: un PEM ahi llega al ZIP y el guard
  // debe tumbarlo justo antes de entregar el artefacto.
  writeFile(fixture.rootDir, 'shared/server.pem', `${PEM_MARKER}\nMIIB\n`);

  const outputDir = path.join(os.tmpdir(), `guard-builder-${crypto.randomUUID()}`);
  trash.push(outputDir);

  const result = await buildWebZip(
    {
      business: { name: 'Guard Co', vertical: 'custom' },
      modules: {},
      workerChips: {},
      terminology: {},
      branding: { primary: '#333333', secondary: '#444444', logoText: 'GC' },
    } as never,
    '/fake/front',
    outputDir,
    () => {},
    undefined,
    { createTempCopy: async () => fixture, cleanupTempCopy: () => {} } as never,
  );

  assert.equal(result.success, false, 'el builder debe fallar cuando el guard rechaza el artefacto');
  const error = (result as { success: false; error: string }).error;
  assert.ok(error.includes('server.pem'), `el error debe nombrar la ruta: ${error}`);
  const left = fs.existsSync(outputDir) ? fs.readdirSync(outputDir) : [];
  assert.deepEqual(left, [], 'no debe quedar ningun artefacto en disco');
});

// ---------------------------------------------------------------------------
// Cableado del ZIP de FUENTE (historial de versiones): el artefacto se valida
// antes de subirse; un rechazo no sube nada ni crea fila de version.
// ---------------------------------------------------------------------------

test('onComplete del historial de versiones rechaza un ZIP de fuente con secreto y no lo sube', async () => {
  const { createExportHandler } = await import('../../routes/exports.js');
  type ExportsDeps = import('../../routes/exports.js').ExportsDeps;
  type AuthedRequest = import('../../middleware/types.js').AuthedRequest;

  const zipWithSecret = await makeZipBuffer({
    'app/lib/config.ts': `export const T = '${OPERATOR_TOKEN}';`,
  });

  let uploads = 0;
  let createdRows = 0;
  let captured: { onComplete?: () => Promise<void> } | undefined;

  const deps = {
    db: {
      membership: { findFirst: async () => ({ id: 'm-1' }), findMany: async () => [] },
      businessSetting: {
        findFirst: async () => ({
          datos: { business: { name: 'Demo' }, api: { url: 'https://api.example.com' } },
        }),
      },
      exportVersion: {
        count: async () => 0,
        create: async () => {
          createdRows += 1;
          return {
            id: 'v-1',
            businessId: 'proj-1',
            version: '1.0.0',
            changeNote: null,
            storagePath: 'proj-1/v-1.zip',
            createdAt: new Date(),
          };
        },
        findFirst: async () => null,
        findMany: async () => [],
      },
      business: { findMany: async () => [] },
      tenantStateEvent: { findMany: async () => [] },
    },
    jobs: {
      startJob: (params: { onComplete?: () => Promise<void> }) => {
        captured = params;
        return {
          id: 'job-1',
          projectId: 'proj-1',
          formats: ['web-zip'],
          status: 'running',
          pct: 0,
          perFormat: { 'web-zip': { status: 'running', pct: 0 } },
          createdAt: Date.now(),
        };
      },
      getJob: () => undefined,
      getActiveJob: () => undefined,
      cancelJob: () => false,
    },
    artifactStorage: {
      zipDirectory: async () => zipWithSecret,
      upload: async () => {
        uploads += 1;
        return { storagePath: 'proj-1/v-1.zip' };
      },
      sign: async () => ({ url: 'https://signed.example/x.zip' }),
    },
  } as unknown as ExportsDeps;

  const req = {
    userId: 'u-1',
    body: { projectId: 'proj-1', formats: ['web-zip'] },
  } as unknown as AuthedRequest;
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };

  // El guard de la ruta usa el entorno del SERVIDOR: se siembra el secreto para
  // la duracion de este test y se restaura despues.
  const previous = process.env.AA_SERVICE_TOKEN;
  process.env.AA_SERVICE_TOKEN = OPERATOR_TOKEN;
  try {
    await createExportHandler(deps)(req, res as never);
    assert.equal(res.statusCode, 202, 'el job arranca');
    assert.ok(captured?.onComplete, 'onComplete debe pasarse a startJob');

    await assert.rejects(
      () => captured!.onComplete!(),
      (err: unknown) =>
        err instanceof ExportGuardError && err.relativePath === 'app/lib/config.ts',
    );
    assert.equal(uploads, 0, 'un artefacto rechazado no se sube a Storage');
    assert.equal(createdRows, 0, 'un artefacto rechazado no crea fila de version');
  } finally {
    if (previous === undefined) delete process.env.AA_SERVICE_TOKEN;
    else process.env.AA_SERVICE_TOKEN = previous;
  }
});
