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
import { shouldCopy, copyDir } from './generar.mjs';

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

// ── T2: integración copyDir sobre origen sintético ──────────────────────────

test('copyDir: origen sintético — copia lo permitido, filtra lo sensible', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'generar-test-'));
  try {
    const src = path.join(base, 'origen', 'back');
    fs.mkdirSync(path.join(src, 'backups'), { recursive: true });
    fs.mkdirSync(path.join(src, 'src'), { recursive: true });
    fs.writeFileSync(path.join(src, 'backups', 'prod.sql'), 'SELECT 1;');
    fs.writeFileSync(path.join(src, '.env.docker'), 'SECRET=x');
    fs.writeFileSync(path.join(src, '.env.example'), 'SECRET=');
    fs.writeFileSync(path.join(src, 'src', 'index.ts'), 'export {};');
    fs.writeFileSync(path.join(src, 'app.log'), 'log line');

    const dest = path.join(base, 'out', 'back');
    copyDir(src, dest);

    // Presentes (AC2)
    assert.ok(fs.existsSync(path.join(dest, '.env.example')), '.env.example debe copiarse');
    assert.ok(fs.existsSync(path.join(dest, 'src', 'index.ts')), 'src/index.ts debe copiarse');
    // Ausentes (AC1)
    assert.ok(!fs.existsSync(path.join(dest, 'backups')), 'backups/ no debe copiarse');
    assert.ok(!fs.existsSync(path.join(dest, 'backups', 'prod.sql')), 'prod.sql no debe copiarse');
    assert.ok(!fs.existsSync(path.join(dest, '.env.docker')), '.env.docker no debe copiarse');
    assert.ok(!fs.existsSync(path.join(dest, 'app.log')), 'app.log no debe copiarse');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});
