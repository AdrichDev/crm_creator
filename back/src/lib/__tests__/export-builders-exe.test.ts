/**
 * back/src/lib/__tests__/export-builders-exe.test.ts
 *
 * Test del builder exe (Fase 4.2) con spawn/fs mockeados:
 *   - `next build` recibe NEXT_OUTPUT_MODE=export.
 *   - electron-builder se invoca localmente con -c.productName=<tenant>.
 *   - el ZIP final contiene desktop-src/, portable, setup y README.
 * Runner: node --import tsx --test
 */

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import JSZip from 'jszip';
import { buildExe } from '../export-builders/exe.js';
import type { TenantConfig } from '../../../../shared/generate/tenant-types.js';

const config = {
  business: { name: 'Mi Negocio', vertical: 'custom' },
  modules: {},
  workerChips: {},
  terminology: {},
  branding: { primary: '#000', secondary: '#fff', logoText: 'MN' },
} as unknown as TenantConfig;

const trash: string[] = [];
afterEach(() => {
  for (const d of trash.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

/** Copia temporal falsa con un build de escritorio ya materializado. */
function buildFixtureTmp(): string {
  const tmp = path.join(os.tmpdir(), `exe-tmp-${randomUUID()}`);
  // Fuente que debe entrar en desktop-src/.
  fs.mkdirSync(path.join(tmp, 'app', '(crm)', 'panel'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'app', '(crm)', 'panel', 'page.tsx'), '// panel');
  fs.mkdirSync(path.join(tmp, 'electron'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'electron', 'main.cjs'), '// main');
  fs.writeFileSync(path.join(tmp, 'package.json'), '{}');
  fs.writeFileSync(path.join(tmp, '.env.local'), 'NEXT_PUBLIC_TENANT_JSON=e30=');
  // Carpetas que NO deben entrar en desktop-src/.
  fs.mkdirSync(path.join(tmp, 'node_modules', '.bin'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'node_modules', '.bin', 'electron-builder'), '#!/bin/sh');
  fs.mkdirSync(path.join(tmp, '.next'), { recursive: true });
  fs.writeFileSync(path.join(tmp, '.next', 'x'), 'x');
  fs.mkdirSync(path.join(tmp, 'out'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'out', 'index.html'), '<html></html>');
  // Artefactos generados por electron-builder.
  fs.mkdirSync(path.join(tmp, 'dist-electron'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'dist-electron', 'Mi Negocio-portable.exe'), 'PORTABLE');
  fs.writeFileSync(path.join(tmp, 'dist-electron', 'Mi Negocio-setup.exe'), 'SETUP');
  return tmp;
}

test('4.2 exe: NEXT_OUTPUT_MODE=export, electron-builder con productName y ZIP correcto', async () => {
  const tmp = buildFixtureTmp();
  trash.push(tmp);
  const outputDir = path.join(os.tmpdir(), `exe-out-${randomUUID()}`);
  trash.push(outputDir);

  const calls: { args: string[]; env?: NodeJS.ProcessEnv }[] = [];

  const spawnFake = ((_cmd: string, args: string[], opts: { env?: NodeJS.ProcessEnv }) => {
    calls.push({ args, env: opts?.env });
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
      kill: () => void;
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {};
    setImmediate(() => child.emit('close', 0));
    return child;
  }) as unknown as typeof import('node:child_process').spawn;

  const result = await buildExe(config, '/fake/front', outputDir, () => {}, undefined, {
    createTempCopy: async () => ({ rootDir: tmp, frontDir: tmp }),
    cleanupTempCopy: () => {}, // lo limpia afterEach
    runNpmCi: async () => {},
    checkToolchain: (async () => ({ ok: true, missing: [] })) as unknown as typeof import('../export-preflight.js').checkToolchain,
    spawn: spawnFake,
  });

  assert.equal(result.success, true, 'el build debe tener exito');

  // next build con NEXT_OUTPUT_MODE=export.
  const nextCall = calls.find((c) => c.args.join(' ').includes('next build'));
  assert.ok(nextCall, 'debe invocar next build');
  assert.equal(nextCall!.env?.NEXT_OUTPUT_MODE, 'export');

  // electron-builder local con productName del tenant.
  const ebCall = calls.find((c) => c.args.join(' ').includes('electron-builder'));
  assert.ok(ebCall, 'debe invocar electron-builder');
  const ebArgs = ebCall!.args.join(' ');
  assert.ok(ebArgs.includes('--win'), 'targets win');
  assert.ok(ebArgs.includes('portable'), 'target portable');
  assert.ok(ebArgs.includes('nsis'), 'target nsis');
  assert.ok(ebArgs.includes('-c.productName=Mi Negocio'), 'productName del tenant');

  assert.ok(result.success && result.outputPath.endsWith('mi-negocio-desktop.zip'));

  // Entradas del ZIP.
  const buf = fs.readFileSync((result as { outputPath: string }).outputPath);
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files);
  const has = (p: string) => names.some((n) => n.replace(/\\/g, '/') === p);
  const hasPrefix = (p: string) => names.some((n) => n.replace(/\\/g, '/').startsWith(p));

  assert.ok(has('README.md'), 'README.md');
  assert.ok(has('Mi Negocio-portable.exe'), 'portable exe');
  assert.ok(has('Mi Negocio-setup.exe'), 'setup exe');
  assert.ok(hasPrefix('desktop-src/'), 'desktop-src/ presente');
  assert.ok(has('desktop-src/electron/main.cjs'), 'electron/ en desktop-src');

  // Exclusiones de desktop-src/.
  assert.ok(!hasPrefix('desktop-src/node_modules/'), 'NO node_modules');
  assert.ok(!hasPrefix('desktop-src/.next/'), 'NO .next');
  assert.ok(!hasPrefix('desktop-src/out/'), 'NO out');
  assert.ok(!hasPrefix('desktop-src/dist-electron/'), 'NO dist-electron');
});

test('4.2 exe: falla si electron-builder sale con code != 0', async () => {
  const tmp = buildFixtureTmp();
  trash.push(tmp);
  const outputDir = path.join(os.tmpdir(), `exe-out-${randomUUID()}`);
  trash.push(outputDir);

  const spawnFake = ((_cmd: string, args: string[]) => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
      kill: () => void;
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {};
    const isEb = args.join(' ').includes('electron-builder');
    setImmediate(() => {
      if (isEb) child.stderr.emit('data', Buffer.from('boom-eb'));
      child.emit('close', isEb ? 1 : 0);
    });
    return child;
  }) as unknown as typeof import('node:child_process').spawn;

  const result = await buildExe(config, '/fake/front', outputDir, () => {}, undefined, {
    createTempCopy: async () => ({ rootDir: tmp, frontDir: tmp }),
    cleanupTempCopy: () => {},
    runNpmCi: async () => {},
    checkToolchain: (async () => ({ ok: true, missing: [] })) as unknown as typeof import('../export-preflight.js').checkToolchain,
    spawn: spawnFake,
  });

  assert.equal(result.success, false);
  assert.ok(!result.success && result.error.includes('electron-builder'));
});
