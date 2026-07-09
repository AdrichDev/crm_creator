/**
 * back/src/lib/__tests__/export-temp-copy.test.ts
 *
 * Tests de la copia temporal (Fase 3.2): exclusiones y `npm ci` con spawn
 * mockeado. Runner: node --import tsx --test
 */

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  createTempCopy,
  cleanupTempCopy,
  runNpmCi,
} from '../export-temp-copy.js';
import type { TenantConfig } from '../../../../shared/generate/tenant-types.js';
import type { Emitter } from '../export-builders/web-zip.js';

const config = {
  business: { name: 'EDM San Blas', vertical: 'centro-deportivo' },
  modules: {},
  workerChips: {},
  terminology: {},
  branding: { primary: '#1E90FF', secondary: '#FF00AA', logoText: 'EDM' },
} as unknown as TenantConfig;
const created: string[] = [];

afterEach(() => {
  for (const dir of created.splice(0)) cleanupTempCopy(dir);
});

/** Fake spawn child controlable en tests. */
function fakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    stderr: EventEmitter;
    kill: (sig?: string) => void;
  };
  child.stderr = new EventEmitter();
  child.kill = () => {};
  return child;
}

test('3.2 createTempCopy excluye node_modules/.next/out/.git/.env.local y copia el resto', async () => {
  // Fuente sintetica: repoRoot/front (+ repoRoot/shared) con carpetas a excluir.
  const repoRoot = path.join(os.tmpdir(), `repo-${randomUUID()}`);
  const srcDir = path.join(repoRoot, 'front');
  for (const d of ['node_modules', '.next', 'out', '.git', 'app']) {
    fs.mkdirSync(path.join(srcDir, d), { recursive: true });
    fs.writeFileSync(path.join(srcDir, d, 'marker.txt'), 'x');
  }
  fs.writeFileSync(path.join(srcDir, 'package.json'), '{}');
  // .env.local de desarrollo del operador con un secreto — NUNCA debe copiarse
  // a la copia temporal (segunda barrera, design.md §3; WU2.2).
  fs.writeFileSync(path.join(srcDir, '.env.local'), 'DEV_SECRET=shhh\n');

  fs.mkdirSync(path.join(repoRoot, 'shared', 'generate'), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'shared', 'generate', 'build-sql.ts'), '// sql');
  fs.mkdirSync(path.join(repoRoot, 'shared', 'node_modules'), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'shared', 'node_modules', 'marker.txt'), 'x');

  try {
    const { rootDir, frontDir } = await createTempCopy(srcDir, config);
    created.push(rootDir);

    assert.ok(fs.existsSync(path.join(frontDir, 'app', 'marker.txt')), 'app/ debe copiarse');
    assert.ok(fs.existsSync(path.join(frontDir, 'package.json')), 'package.json debe copiarse');
    // Responsabilidad movida a writeFreshEnvLocal (manifest-allowlist.ts):
    // createTempCopy ya NO escribe .env.local.
    assert.ok(
      !fs.existsSync(path.join(frontDir, '.env.local')),
      '.env.local NO debe copiarse ni escribirse aqui (single-writer en manifest-allowlist.ts)',
    );
    for (const d of ['node_modules', '.next', 'out', '.git']) {
      assert.ok(!fs.existsSync(path.join(frontDir, d)), `${d} NO debe copiarse`);
    }

    // shared/ replicado al lado de front/ (front importa shared/generate/* via ../../../shared/...)
    assert.ok(
      fs.existsSync(path.join(rootDir, 'shared', 'generate', 'build-sql.ts')),
      'shared/generate debe copiarse junto a front/',
    );
    assert.ok(
      !fs.existsSync(path.join(rootDir, 'shared', 'node_modules')),
      'shared/node_modules NO debe copiarse',
    );
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('3.2 runNpmCi usa `cmd.exe /d /s /c npm ci` en win32 y resuelve al cerrar con code 0', async () => {
  let capturedCmd = '';
  let capturedArgs: string[] = [];
  const child = fakeChild();

  const spawnFake = ((cmd: string, args: string[]) => {
    capturedCmd = cmd;
    capturedArgs = args;
    // Cierra de forma asincrona con exito.
    setImmediate(() => child.emit('close', 0));
    return child;
  }) as unknown as typeof import('node:child_process').spawn;

  const events: string[] = [];
  const emit: Emitter = (e) => { if (e.step) events.push(e.step); };

  await runNpmCi('/tmp/build-x', emit, undefined, {
    spawn: spawnFake,
    platform: 'win32',
  });

  // spawn-async.ts (D10, fix gate 4.V) envuelve via cmd.exe /d /s /c con la
  // linea completa entrecomillada como UN solo argumento — necesario para que
  // rutas de repo con espacios y valores con espacios no rompan el parseo.
  assert.equal(capturedCmd, 'cmd.exe');
  assert.deepEqual(capturedArgs, ['/d', '/s', '/c', '"npm ci"']);
  assert.ok(events.some((s) => s.includes('npm ci')), 'debe emitir progreso de npm ci');
});

test('3.2 runNpmCi rechaza cuando npm ci sale con code != 0', async () => {
  const child = fakeChild();
  const spawnFake = (() => {
    setImmediate(() => {
      child.stderr.emit('data', Buffer.from('boom'));
      child.emit('close', 1);
    });
    return child;
  }) as unknown as typeof import('node:child_process').spawn;

  await assert.rejects(
    runNpmCi('/tmp/build-x', () => {}, undefined, { spawn: spawnFake, platform: 'linux' }),
    /npm ci fallo/,
  );
});
