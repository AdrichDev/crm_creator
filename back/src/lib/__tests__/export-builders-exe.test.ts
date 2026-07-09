import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import JSZip from 'jszip';
import { buildExe } from '../export-builders/exe.js';
import { buildFixtureTmp } from './export-fixture.js';
import type { TenantConfig } from '../../../../shared/generate/tenant-types.js';

// PNG 1x1 transparente, minimo valido para el pipeline de icono.
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const config = {
  business: { name: 'Mi Negocio', vertical: 'custom' },
  modules: {},
  workerChips: {},
  terminology: {},
  branding: {
    primary: '#000',
    secondary: '#fff',
    logoText: 'MN',
    logoImage: `data:image/png;base64,${TINY_PNG_BASE64}`,
  },
} as unknown as TenantConfig;

const trash: string[] = [];
afterEach(() => {
  for (const d of trash.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

test('buildExe stub para exportacion', async () => {
  assert.ok(typeof buildExe === 'function');
});

test('6.2 exe: icono personalizado presente (fix bug); android/ ausente; electron/ + electron-builder.yml presentes', async () => {
  const fixture = buildFixtureTmp({ includeCrossPlatform: true });
  trash.push(fixture.rootDir);
  const outputDir = path.join(os.tmpdir(), `exe-allow-${randomUUID()}`);
  trash.push(outputDir);

  const result = await buildExe(config, '/fake/front', outputDir, () => {}, undefined, {
    createTempCopy: async () => fixture,
    cleanupTempCopy: () => {},
  });
  assert.ok(result.success, 'build debe tener exito');

  const buf = fs.readFileSync((result as { outputPath: string }).outputPath);
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files).map((n) => n.replace(/\\/g, '/'));

  // AC4: el icono generado en build/icon.png sobrevive al filtro allowlist
  // via `extraFiles`, aunque 'build' no este en DESKTOP_ALLOWLIST.
  assert.ok(names.includes('desktop-src/build/icon.png'), 'build/icon.png debe estar en el EXE (fix bug icono)');

  assert.ok(!names.some((n) => n.startsWith('desktop-src/android/')), 'android/ no debe estar en el EXE');
  assert.ok(names.some((n) => n.startsWith('desktop-src/electron/')), 'electron/ debe estar en el EXE');
  assert.ok(names.includes('desktop-src/electron-builder.yml'), 'electron-builder.yml debe estar en el EXE');
});
