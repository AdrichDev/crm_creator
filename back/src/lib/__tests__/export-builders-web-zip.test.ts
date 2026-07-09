import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import JSZip from 'jszip';
import { buildWebZip } from '../export-builders/web-zip.js';
import { buildFixtureTmp } from './export-fixture.js';
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

test('3.3 web-zip: empaqueta codigo fuente en ZIP', async () => {
  const fixture = buildFixtureTmp();
  trash.push(fixture.rootDir);
  const outputDir = path.join(os.tmpdir(), `webzip-out-${randomUUID()}`);
  trash.push(outputDir);

  const result = await buildWebZip(config, '/fake/front', outputDir, () => {}, undefined, {
    createTempCopy: async () => fixture,
    cleanupTempCopy: () => {},
  });

  assert.equal(result.success, true);
  assert.ok(result.success && result.outputPath.endsWith('mi-negocio-web-src.zip'));

  // Inspeccion del ZIP.
  const buf = fs.readFileSync((result as { outputPath: string }).outputPath);
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files);

  const has = (p: string) => names.some((n) => n.replace(/\\/g, '/') === p);
  const hasPrefix = (p: string) => names.some((n) => n.replace(/\\/g, '/').startsWith(p));

  assert.ok(has('schema.sql'), 'schema.sql');
  assert.ok(has('schema.prisma'), 'schema.prisma');
  assert.ok(has('manifest.json'), 'manifest.json');
  assert.ok(has('README.md'), 'README.md');
  assert.ok(hasPrefix('app/'), 'fuente en app/');
  // shared/ debe estar en la raiz del ZIP para que `../../../shared` resuelva
  // tras extraer (regresion: "Cannot find module '../../../shared/generate/...'").
  assert.ok(hasPrefix('shared/'), 'shared/ en la raiz del ZIP');
});

test('3.2 web-zip: allowlist excluye openspec/android/electron/e2e; core sin regresion', async () => {
  const fixture = buildFixtureTmp({ includeCrossPlatform: true, includeCruft: true });
  trash.push(fixture.rootDir);
  const outputDir = path.join(os.tmpdir(), `webzip-allow-${randomUUID()}`);
  trash.push(outputDir);

  const result = await buildWebZip(config, '/fake/front', outputDir, () => {}, undefined, {
    createTempCopy: async () => fixture,
    cleanupTempCopy: () => {},
  });
  assert.ok(result.success, 'build debe tener exito');

  const buf = fs.readFileSync((result as { outputPath: string }).outputPath);
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files).map((n) => n.replace(/\\/g, '/'));

  for (const cruft of ['openspec/', 'android/', 'electron/', 'e2e/']) {
    assert.ok(!names.some((n) => n.startsWith(`app/${cruft}`)), `${cruft} no debe estar en el ZIP web`);
  }

  // No regresion: nucleo + artefactos generados siguen presentes.
  assert.ok(names.includes('schema.sql'), 'schema.sql');
  assert.ok(names.includes('schema.prisma'), 'schema.prisma');
  assert.ok(names.includes('manifest.json'), 'manifest.json');
  assert.ok(names.includes('README.md'), 'README.md');
});
