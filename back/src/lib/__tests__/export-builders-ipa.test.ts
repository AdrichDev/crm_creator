import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import JSZip from 'jszip';
import { buildIpa } from '../export-builders/ipa.js';
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

test('buildIpa stub para exportacion', async () => {
  assert.ok(typeof buildIpa === 'function');
});

test('5.2 ipa: android/ y electron/ ausentes; capacitor.config.ts personalizado presente', async () => {
  const fixture = buildFixtureTmp({ includeCrossPlatform: true });
  trash.push(fixture.rootDir);
  const outputDir = path.join(os.tmpdir(), `ipa-allow-${randomUUID()}`);
  trash.push(outputDir);

  const result = await buildIpa(config, '/fake/front', outputDir, () => {}, undefined, {
    createTempCopy: async () => fixture,
    cleanupTempCopy: () => {},
  });
  assert.ok(result.success, 'build debe tener exito');

  const buf = fs.readFileSync((result as { outputPath: string }).outputPath);
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files).map((n) => n.replace(/\\/g, '/'));

  assert.ok(!names.some((n) => n.startsWith('mobile-src/android/')), 'android/ no debe estar en el IPA');
  assert.ok(!names.some((n) => n.startsWith('mobile-src/electron/')), 'electron/ no debe estar en el IPA');

  const capacitorEntry = zip.file('mobile-src/capacitor.config.ts');
  assert.ok(capacitorEntry, 'capacitor.config.ts debe estar en el IPA');
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

// ── crm-export-delivery-profiles WU1.3/WU2.1: deliverable en ipa ────────────

test('ipa: sin deliverable → manifest.json declara binary+source (default) y README cliente', async () => {
  const fixture = buildFixtureTmp();
  trash.push(fixture.rootDir);
  const outputDir = path.join(os.tmpdir(), `ipa-deliv-default-${randomUUID()}`);
  trash.push(outputDir);

  const result = await buildIpa(config, '/fake/front', outputDir, () => {}, undefined, {
    createTempCopy: async () => fixture,
    cleanupTempCopy: () => {},
  });
  assert.ok(result.success);

  const buf = fs.readFileSync((result as { outputPath: string }).outputPath);
  const zip = await JSZip.loadAsync(buf);

  const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
  assert.equal(manifest.deliverable, 'binary+source');
  assert.equal(manifest.format, 'ipa');

  const readme = await zip.file('README.md')!.async('string');
  assert.ok(!readme.startsWith('PAQUETE INTERNO'), 'README default no debe llevar banner interno');
});

test('ipa: deliverable = binary → manifest.json lo declara y README lleva banner operador', async () => {
  const fixture = buildFixtureTmp();
  trash.push(fixture.rootDir);
  const outputDir = path.join(os.tmpdir(), `ipa-deliv-binary-${randomUUID()}`);
  trash.push(outputDir);

  const result = await buildIpa(config, '/fake/front', outputDir, () => {}, undefined, {
    createTempCopy: async () => fixture,
    cleanupTempCopy: () => {},
    deliverable: 'binary',
  });
  assert.ok(result.success);

  const buf = fs.readFileSync((result as { outputPath: string }).outputPath);
  const zip = await JSZip.loadAsync(buf);

  const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
  assert.equal(manifest.deliverable, 'binary');

  const readme = await zip.file('README.md')!.async('string');
  assert.ok(readme.startsWith('PAQUETE INTERNO'), 'README operador debe empezar con el banner interno');
});
