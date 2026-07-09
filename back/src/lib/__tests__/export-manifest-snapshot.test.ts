/**
 * back/src/lib/__tests__/export-manifest-snapshot.test.ts
 *
 * WU1.3: anti-drift. Al ser 4 allowlists literales independientes SIN
 * constante compartida (design.md §1), este test fija las entradas de
 * primer nivel EXACTAS esperadas en el ZIP de cada builder mediante arrays
 * escritos aqui a mano (NO importados de manifest-allowlist.ts): un archivo
 * "core" anadido a una lista y olvidado en las otras tres deja el snapshot
 * de ese formato desincronizado, y el diff de este archivo en revision hace
 * visible el olvido.
 */

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import JSZip from 'jszip';
import { buildWebZip } from '../export-builders/web-zip.js';
import { buildApk } from '../export-builders/apk.js';
import { buildIpa } from '../export-builders/ipa.js';
import { buildExe } from '../export-builders/exe.js';
import { buildFixtureTmp } from './export-fixture.js';
import type { TenantConfig } from '../../../../shared/generate/tenant-types.js';

const config = {
  business: { name: 'Snapshot Co', vertical: 'custom' },
  modules: {},
  workerChips: {},
  terminology: {},
  branding: { primary: '#111111', secondary: '#222222', logoText: 'SC' },
} as unknown as TenantConfig;

const trash: string[] = [];
afterEach(() => {
  for (const d of trash.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

/** Segmentos de primer nivel presentes en el ZIP bajo `prefix/` (p.ej. 'app/'). */
async function topLevelSegments(zipPath: string, prefix: string): Promise<string[]> {
  const buf = fs.readFileSync(zipPath);
  const zip = await JSZip.loadAsync(buf);
  const segments = new Set<string>();
  for (const name of Object.keys(zip.files)) {
    const normalized = name.replace(/\\/g, '/');
    if (!normalized.startsWith(`${prefix}/`)) continue;
    const rest = normalized.slice(prefix.length + 1);
    const top = rest.split('/')[0];
    if (top) segments.add(top);
  }
  return [...segments].sort();
}

// Snapshots literales — copia intencional (NO import) de las 4 allowlists de
// manifest-allowlist.ts al momento de escribir este test.
const WEB_SNAPSHOT = [
  '.env.example',
  '.env.local',
  'app',
  'components',
  'lib',
  'next-env.d.ts',
  'next.config.ts',
  'package-lock.json',
  'package.json',
  'postcss.config.mjs',
  'public',
  'tailwind.config.ts',
  'tsconfig.json',
].sort();

const ANDROID_SNAPSHOT = [
  '.env.example',
  '.env.local',
  'android',
  'app',
  'capacitor.config.ts',
  'components',
  'lib',
  'next-env.d.ts',
  'next.config.ts',
  'package-lock.json',
  'package.json',
  'postcss.config.mjs',
  'public',
  'tailwind.config.ts',
  'tsconfig.json',
].sort();

const IOS_SNAPSHOT = [
  '.env.example',
  '.env.local',
  'app',
  'capacitor.config.ts',
  'components',
  'lib',
  'next-env.d.ts',
  'next.config.ts',
  'package-lock.json',
  'package.json',
  'postcss.config.mjs',
  'public',
  'tailwind.config.ts',
  'tsconfig.json',
].sort();

const DESKTOP_SNAPSHOT = [
  '.env.example',
  '.env.local',
  'app',
  'components',
  'electron',
  'electron-builder.yml',
  'lib',
  'next-env.d.ts',
  'next.config.ts',
  'package-lock.json',
  'package.json',
  'postcss.config.mjs',
  'public',
  'tailwind.config.ts',
  'tsconfig.json',
].sort();

test('1.3 anti-drift web-zip: entradas de primer nivel de app/ == WEB_SNAPSHOT', async () => {
  const fixture = buildFixtureTmp({ includeCrossPlatform: true, includeCruft: true });
  trash.push(fixture.rootDir);
  const outputDir = path.join(os.tmpdir(), `snap-web-${randomUUID()}`);
  trash.push(outputDir);

  const result = await buildWebZip(config, '/fake/front', outputDir, () => {}, undefined, {
    createTempCopy: async () => fixture,
    cleanupTempCopy: () => {},
  });
  assert.ok(result.success, 'build debe tener exito');

  const segments = await topLevelSegments((result as { outputPath: string }).outputPath, 'app');
  assert.deepEqual(segments, WEB_SNAPSHOT);
});

test('1.3 anti-drift apk: entradas de primer nivel de mobile-src/ == ANDROID_SNAPSHOT', async () => {
  const fixture = buildFixtureTmp({ includeCrossPlatform: true, includeCruft: true });
  trash.push(fixture.rootDir);
  const outputDir = path.join(os.tmpdir(), `snap-apk-${randomUUID()}`);
  trash.push(outputDir);

  const result = await buildApk(config, '/fake/front', outputDir, () => {}, undefined, {
    createTempCopy: async () => fixture,
    cleanupTempCopy: () => {},
  });
  assert.ok(result.success, 'build debe tener exito');

  const segments = await topLevelSegments((result as { outputPath: string }).outputPath, 'mobile-src');
  assert.deepEqual(segments, ANDROID_SNAPSHOT);
});

test('1.3 anti-drift ipa: entradas de primer nivel de mobile-src/ == IOS_SNAPSHOT', async () => {
  const fixture = buildFixtureTmp({ includeCrossPlatform: true, includeCruft: true });
  trash.push(fixture.rootDir);
  const outputDir = path.join(os.tmpdir(), `snap-ipa-${randomUUID()}`);
  trash.push(outputDir);

  const result = await buildIpa(config, '/fake/front', outputDir, () => {}, undefined, {
    createTempCopy: async () => fixture,
    cleanupTempCopy: () => {},
  });
  assert.ok(result.success, 'build debe tener exito');

  const segments = await topLevelSegments((result as { outputPath: string }).outputPath, 'mobile-src');
  assert.deepEqual(segments, IOS_SNAPSHOT);
});

test('1.3 anti-drift exe: entradas de primer nivel de desktop-src/ == DESKTOP_SNAPSHOT', async () => {
  const fixture = buildFixtureTmp({ includeCrossPlatform: true, includeCruft: true });
  trash.push(fixture.rootDir);
  const outputDir = path.join(os.tmpdir(), `snap-exe-${randomUUID()}`);
  trash.push(outputDir);

  const result = await buildExe(config, '/fake/front', outputDir, () => {}, undefined, {
    createTempCopy: async () => fixture,
    cleanupTempCopy: () => {},
  });
  assert.ok(result.success, 'build debe tener exito');

  const segments = await topLevelSegments((result as { outputPath: string }).outputPath, 'desktop-src');
  assert.deepEqual(segments, DESKTOP_SNAPSHOT);
});
