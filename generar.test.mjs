/**
 * Tests del generador (generar.mjs): filtro de copia shouldCopy + integración
 * de copyDir sobre un origen sintético.
 *
 * Ejecutar desde creador_CRM/:
 *   node --test generar.test.mjs
 *
 * No usa vitest (front) ni la suite del back: el generador vive en la raíz de
 * creador_CRM sin package.json propio, así que node:test puro es lo que menos
 * fricción genera.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { shouldCopy, copyDir, guardGeneratedTree } from './generar.mjs';

// ── T1: unit del predicado ───────────────────────────────────────────────────

test('shouldCopy: directorios excluidos', () => {
  for (const dir of ['node_modules', '.next', 'dist', '.git', '.turbo', 'generated', 'backups', 'coverage', 'tmp']) {
    assert.equal(shouldCopy(dir, true), false, `dir "${dir}" debe excluirse`);
  }
});

test('shouldCopy: directorios normales se copian', () => {
  for (const dir of ['src', 'app', 'prisma', 'lib']) {
    assert.equal(shouldCopy(dir, true), true, `dir "${dir}" debe copiarse`);
  }
});

test('shouldCopy: ficheros sensibles por patrón excluidos', () => {
  const banned = [
    'crm_production_20260617.sql', 'prod.sql', 'crm_fresh.dump', 'app.log',
    'dump_err.log', 'server.pem', 'private.key', 'PROD.SQL',
  ];
  for (const f of banned) {
    assert.equal(shouldCopy(f, false), false, `fichero "${f}" debe excluirse`);
  }
});

test('shouldCopy: .env* excluido salvo *.example', () => {
  for (const f of ['.env', '.env.local', '.env.docker', '.env.production']) {
    assert.equal(shouldCopy(f, false), false, `"${f}" debe excluirse`);
  }
  for (const f of ['.env.example', '.env.local.example']) {
    assert.equal(shouldCopy(f, false), true, `"${f}" debe copiarse`);
  }
});

test('shouldCopy: codigo y config normales se copian', () => {
  for (const f of ['index.ts', 'package.json', 'schema.prisma', 'README.md', 'page.tsx']) {
    assert.equal(shouldCopy(f, false), true, `"${f}" debe copiarse`);
  }
});

// ── T1b: huecos reintroducidos del filtro (regresión) ───────────────────────

test('shouldCopy: .env sin punto inicial (nombre.env) tambien excluido', () => {
  for (const f of ['production.env', 'secrets.env']) {
    assert.equal(shouldCopy(f, false), false, `"${f}" debe excluirse`);
  }
});

test('shouldCopy: .env.example sigue incluido (no romper la excepción)', () => {
  assert.equal(shouldCopy('.env.example', false), true);
});

test('shouldCopy: extensiones compuestas (rotadas/comprimidas) excluidas', () => {
  for (const f of ['backup.sql.gz', 'dump.sql.bak', 'error.log.1']) {
    assert.equal(shouldCopy(f, false), false, `"${f}" debe excluirse`);
  }
});

test('shouldCopy: sin falsos positivos en nombres parecidos', () => {
  for (const f of ['environment.config.ts', 'myenvfile.txt', 'backlog.md']) {
    assert.equal(shouldCopy(f, false), true, `"${f}" NO debe excluirse (falso positivo)`);
  }
});

// ── T1c: excepción migration.sql bajo prisma/migrations/** ──────────────────

test('shouldCopy: migration.sql bajo prisma/migrations/** SÍ se copia', () => {
  assert.equal(
    shouldCopy('migration.sql', false, 'prisma/migrations/20260616_x'),
    true,
    'migration.sql dentro de prisma/migrations/<ts> debe copiarse',
  );
});

test('shouldCopy: .sql suelto en prisma/ (fuera de migrations/) sigue excluido', () => {
  assert.equal(
    shouldCopy('migrate-negocio-generado.sql', false, 'prisma'),
    false,
    'script ad-hoc fuera de migrations/ debe excluirse',
  );
});

test('shouldCopy: .sql en back/backups sigue excluido (la excepción no lo cuela)', () => {
  assert.equal(
    shouldCopy('dump.sql', false, 'back/backups'),
    false,
    '.sql en backups/ debe excluirse aunque relDir se pase',
  );
});

test('shouldCopy: backup.sql.gz sigue excluido (regresión, no rompe con relDir)', () => {
  assert.equal(
    shouldCopy('backup.sql.gz', false, 'prisma/migrations/20260616_x'),
    false,
    'extensión compuesta .sql.gz no matchea la excepción (solo .sql puro)',
  );
});

test('shouldCopy: .sql sin relDir (llamada legacy) sigue excluido', () => {
  assert.equal(shouldCopy('migration.sql', false), false, 'sin relDir no hay excepción posible');
});

// ── T2: integración copyDir sobre origen sintético ──────────────────────────

test('copyDir: origen sintético — copia lo permitido, filtra lo sensible', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'generar-test-'));
  try {
    const src = path.join(base, 'origen', 'back');
    fs.mkdirSync(path.join(src, 'backups'), { recursive: true });
    fs.mkdirSync(path.join(src, 'src'), { recursive: true });
    fs.mkdirSync(path.join(src, 'prisma', 'migrations', '20260616_x'), { recursive: true });
    fs.writeFileSync(path.join(src, 'backups', 'prod.sql'), 'SELECT 1;');
    fs.writeFileSync(path.join(src, '.env.docker'), 'SECRET=x');
    fs.writeFileSync(path.join(src, '.env.example'), 'SECRET=');
    fs.writeFileSync(path.join(src, 'src', 'index.ts'), 'export {};');
    fs.writeFileSync(path.join(src, 'app.log'), 'log line');
    fs.writeFileSync(path.join(src, 'prisma', 'migrate-negocio-generado.sql'), 'ALTER TABLE x;');
    fs.writeFileSync(path.join(src, 'prisma', 'migrations', '20260616_x', 'migration.sql'), 'CREATE TABLE x();');

    const dest = path.join(base, 'out', 'back');
    copyDir(src, dest);

    // Presentes (AC2)
    assert.ok(fs.existsSync(path.join(dest, '.env.example')), '.env.example debe copiarse');
    assert.ok(fs.existsSync(path.join(dest, 'src', 'index.ts')), 'src/index.ts debe copiarse');
    assert.ok(
      fs.existsSync(path.join(dest, 'prisma', 'migrations', '20260616_x', 'migration.sql')),
      'prisma/migrations/**/migration.sql debe copiarse (excepción)',
    );
    // Ausentes (AC1)
    assert.ok(!fs.existsSync(path.join(dest, 'backups')), 'backups/ no debe copiarse');
    assert.ok(!fs.existsSync(path.join(dest, 'backups', 'prod.sql')), 'prod.sql no debe copiarse');
    assert.ok(!fs.existsSync(path.join(dest, '.env.docker')), '.env.docker no debe copiarse');
    assert.ok(!fs.existsSync(path.join(dest, 'app.log')), 'app.log no debe copiarse');
    assert.ok(
      !fs.existsSync(path.join(dest, 'prisma', 'migrate-negocio-generado.sql')),
      'script suelto migrate-negocio-generado.sql sigue excluido',
    );
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

// ── T3 (security-wave-2 S3/S4): barrera post-copia del paquete generado ─────

const OPERATOR_TOKEN = 'aa-service-token-value-1234';
const OPERATOR_ENV = { AA_SERVICE_TOKEN: OPERATOR_TOKEN };

function makeJwt(payload) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.${'x'.repeat(24)}`;
}

function writeTree(root, entries) {
  for (const [rel, content] of Object.entries(entries)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
}

function makeTree(entries) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'generar-guard-'));
  const out = path.join(base, 'generated', 'demo');
  fs.mkdirSync(out, { recursive: true });
  writeTree(out, entries);
  return { base, out };
}

test('guardGeneratedTree: rechaza volcados, backups, logs, .env y claves', () => {
  // [ruta sembrada, ruta ofensora reportada] — un fichero dentro de backups/
  // se rechaza reportando el DIRECTORIO backups/, que es el entry ofensor.
  const cases = [
    ['back/dump.sql', 'back/dump.sql'],
    ['back/backups/notas.txt', 'back/backups'],
    ['back/app.log', 'back/app.log'],
    ['back/.env', 'back/.env'],
    ['back/certs/server.pem', 'back/certs/server.pem'],
    ['back/client.key', 'back/client.key'],
  ];
  for (const [rel, offending] of cases) {
    const { base, out } = makeTree({ [rel]: 'x' });
    try {
      assert.throws(
        () => guardGeneratedTree(out, OPERATOR_ENV),
        (err) => err.message.includes(offending),
        `"${rel}" debe ser rechazado nombrando la ruta`,
      );
      assert.equal(fs.existsSync(out), false, `el paquete con "${rel}" no debe quedar en disco`);
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  }
});

test('guardGeneratedTree: rechaza el valor de un secreto del operador sin filtrarlo', () => {
  const { base, out } = makeTree({ 'back/src/config.ts': `export const T = '${OPERATOR_TOKEN}';` });
  try {
    assert.throws(
      () => guardGeneratedTree(out, OPERATOR_ENV),
      (err) => err.message.includes('back/src/config.ts') && !err.message.includes(OPERATOR_TOKEN),
    );
    assert.equal(fs.existsSync(out), false);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('guardGeneratedTree: rechaza formas genericas de secreto (sk- y JWT service_role)', () => {
  // sk-... y JWT con role service_role.
  for (const content of [
    "const k = 'sk-proj-AbCdEf0123456789AbCdEf01';",
    `const k = '${makeJwt({ role: 'service_role' })}';`,
  ]) {
    const { base, out } = makeTree({ 'back/src/ai.ts': content });
    try {
      assert.throws(
        () => guardGeneratedTree(out, OPERATOR_ENV),
        (err) => err.message.includes('back/src/ai.ts'),
        `debe rechazar: ${content.slice(0, 24)}…`,
      );
      assert.equal(fs.existsSync(out), false);
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  }
});

test('guardGeneratedTree: acepta el paquete legitimo (plantillas .example, migraciones, codigo)', () => {
  const { base, out } = makeTree({
    'back/.env.example': 'DATABASE_URL=\n',
    'front/.env.local.example': 'NEXT_PUBLIC_API_URL=\n',
    'back/prisma/migrations/20260616_x/migration.sql': 'CREATE TABLE x();',
    'back/src/index.ts': 'export {};',
    'front/app/page.tsx': 'export default function Page(){return null;}',
    'front/public/.npmrc': 'legacy-peer-deps=true',
  });
  try {
    assert.doesNotThrow(() => guardGeneratedTree(out, OPERATOR_ENV));
    assert.equal(fs.existsSync(out), true, 'el paquete limpio se conserva');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('guardGeneratedTree: acepta el anon key publico del tenant (JWT role anon)', () => {
  const { base, out } = makeTree({
    'front/.env.local.example': `NEXT_PUBLIC_SUPABASE_ANON_KEY=${makeJwt({ role: 'anon' })}\n`,
  });
  try {
    assert.doesNotThrow(() => guardGeneratedTree(out, OPERATOR_ENV));
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('guardGeneratedTree: copyDir -> guard pasa con un origen limpio', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'generar-guard-e2e-'));
  try {
    const src = path.join(base, 'origen', 'back');
    fs.mkdirSync(path.join(src, 'src'), { recursive: true });
    fs.mkdirSync(path.join(src, '.next'), { recursive: true });
    fs.writeFileSync(path.join(src, 'src', 'index.ts'), 'export {};');
    fs.writeFileSync(path.join(src, 'backups.tmp'), 'esta no es una carpeta backups/');
    fs.writeFileSync(path.join(src, '.env.example'), 'DATABASE_URL=\n');
    fs.writeFileSync(path.join(src, '.next', 'cache.bin'), 'descartado con el directorio');

    const out = path.join(base, 'generated', 'demo', 'back');
    copyDir(src, out);

    assert.doesNotThrow(() => guardGeneratedTree(path.dirname(out), OPERATOR_ENV));
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});
