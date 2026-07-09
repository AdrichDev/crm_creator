import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import JSZip from 'jszip';
import { buildApk } from '../export-builders/apk.js';
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

test('buildApk stub para exportacion', async () => {
  assert.ok(typeof buildApk === 'function');
});

test('4.2 apk: electron/ ausente; android/ + capacitor.config.ts personalizado presentes', async () => {
  const fixture = buildFixtureTmp({ includeCrossPlatform: true });
  trash.push(fixture.rootDir);
  const outputDir = path.join(os.tmpdir(), `apk-allow-${randomUUID()}`);
  trash.push(outputDir);

  const result = await buildApk(config, '/fake/front', outputDir, () => {}, undefined, {
    createTempCopy: async () => fixture,
    cleanupTempCopy: () => {},
  });
  assert.ok(result.success, 'build debe tener exito');

  const buf = fs.readFileSync((result as { outputPath: string }).outputPath);
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files).map((n) => n.replace(/\\/g, '/'));

  assert.ok(!names.some((n) => n.startsWith('mobile-src/electron/')), 'electron/ no debe estar en el APK');
  assert.ok(names.some((n) => n.startsWith('mobile-src/android/')), 'android/ debe estar en el APK');

  const capacitorEntry = zip.file('mobile-src/capacitor.config.ts');
  assert.ok(capacitorEntry, 'capacitor.config.ts debe estar en el APK');
  const capacitorContent = await capacitorEntry!.async('string');
  assert.ok(
    capacitorContent.includes('Config horneada por el exportador'),
    'capacitor.config.ts debe ser el personalizado por customizeCapacitorConfig, no el placeholder de la fixture',
  );
  // appId horneado: slug "mi-negocio" sin separadores -> com.operaos.minegocio.
  assert.ok(
    capacitorContent.includes('appId: "com.operaos.minegocio"'),
    'capacitor.config.ts debe hornear el appId derivado del nombre del negocio',
  );
  // appName horneado: nombre del negocio tal cual.
  assert.ok(
    capacitorContent.includes('appName: "Mi Negocio"'),
    'capacitor.config.ts debe hornear el appName con el nombre del negocio',
  );
});
