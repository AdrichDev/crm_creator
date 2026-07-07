/**
 * back/src/lib/__tests__/export-builders-web-zip.test.ts
 *
 * Test del builder web-zip (Fase 3.3) con spawn/fs mockeados: el spawn de
 * `next build` recibe NEXT_OUTPUT_MODE=standalone y el ZIP contiene las
 * entradas esperadas (app/, standalone/, schema, README).
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
import { buildWebZip } from '../export-builders/web-zip.js';
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

/** Crea una copia temporal falsa con la estructura de un build ya hecho. */
function buildFixtureTmp(): string {
  const tmp = path.join(os.tmpdir(), `webzip-tmp-${randomUUID()}`);
  fs.mkdirSync(path.join(tmp, '.next', 'standalone'), { recursive: true });
  fs.mkdirSync(path.join(tmp, '.next', 'static', 'chunks'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'public'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'app'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'node_modules', 'foo'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'out'), { recursive: true });

  fs.writeFileSync(path.join(tmp, '.next', 'standalone', 'server.js'), '// server');
  fs.writeFileSync(path.join(tmp, '.next', 'static', 'chunks', 'main.js'), '// chunk');
  fs.writeFileSync(path.join(tmp, 'public', 'logo.svg'), '<svg/>');
  fs.writeFileSync(path.join(tmp, 'app', 'page.tsx'), '// page');
  fs.writeFileSync(path.join(tmp, '.env.local'), 'NEXT_PUBLIC_TENANT_JSON={}');
  fs.writeFileSync(path.join(tmp, 'node_modules', 'foo', 'index.js'), '// dep');
  fs.writeFileSync(path.join(tmp, 'out', 'stale.html'), '<html/>');
  return tmp;
}

test('3.3 web-zip: next build recibe NEXT_OUTPUT_MODE=standalone y el ZIP tiene las entradas esperadas', async () => {
  const tmp = buildFixtureTmp();
  trash.push(tmp);
  const outputDir = path.join(os.tmpdir(), `webzip-out-${randomUUID()}`);
  trash.push(outputDir);

  let capturedEnv: NodeJS.ProcessEnv | undefined;

  const spawnFake = ((_cmd: string, _args: string[], opts: { env?: NodeJS.ProcessEnv }) => {
    capturedEnv = opts?.env;
    const child = new EventEmitter() as EventEmitter & { stderr: EventEmitter; kill: () => void };
    child.stderr = new EventEmitter();
    child.kill = () => {};
    setImmediate(() => child.emit('close', 0));
    return child;
  }) as unknown as typeof import('node:child_process').spawn;

  const result = await buildWebZip(config, '/fake/front', outputDir, () => {}, undefined, {
    createTempCopy: async () => ({ rootDir: tmp, frontDir: tmp }),
    cleanupTempCopy: () => {}, // no borrar: lo limpia afterEach
    runNpmCi: async () => {},
    spawn: spawnFake,
  });

  assert.equal(result.success, true, 'el build debe tener exito');
  assert.ok(capturedEnv, 'next build debe recibir env');
  assert.equal(capturedEnv?.NEXT_OUTPUT_MODE, 'standalone');

  assert.ok(result.success && result.outputPath.endsWith('mi-negocio-web.zip'));

  // Verifica las entradas del ZIP.
  const buf = fs.readFileSync((result as { outputPath: string }).outputPath);
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files);

  const has = (p: string) => names.some((n) => n.replace(/\\/g, '/') === p);
  const hasPrefix = (p: string) => names.some((n) => n.replace(/\\/g, '/').startsWith(p));

  assert.ok(has('schema.sql'), 'schema.sql');
  assert.ok(has('schema.prisma'), 'schema.prisma');
  assert.ok(has('manifest.json'), 'manifest.json');
  assert.ok(has('README.md'), 'README.md');
  assert.ok(has('standalone/server.js'), 'standalone/server.js');
  assert.ok(hasPrefix('standalone/.next/static/'), 'static recolocado en standalone');
  assert.ok(hasPrefix('standalone/public/'), 'public en standalone');
  assert.ok(hasPrefix('app/'), 'fuente en app/');
  assert.ok(has('app/.env.local'), 'app/ incluye .env.local del tenant');

  // Exclusiones dentro de app/.
  assert.ok(!hasPrefix('app/node_modules/'), 'app/ NO debe incluir node_modules');
  assert.ok(!hasPrefix('app/.next/'), 'app/ NO debe incluir .next');
  assert.ok(!hasPrefix('app/out/'), 'app/ NO debe incluir out');
});
