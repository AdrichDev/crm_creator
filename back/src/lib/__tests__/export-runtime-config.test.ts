/**
 * back/src/lib/__tests__/export-runtime-config.test.ts
 *
 * crm-export-runtime-config WU2/WU3/WU4: cableado de `PLATFORM_API_URL` /
 * `TENANT_ID` / `TENANT_API_KEY` en el `.env.local` de cada builder, sus
 * placeholders vacíos en `.env.example`, y consistencia cruzada entre los 4
 * formatos para un mismo `runtimeConfig`.
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
import type { RuntimeConfig } from '../export-builders/runtime-config-env.js';
import type { BuildResult, Emitter } from '../export-builders/web-zip.js';

const config = {
  business: { name: 'Runtime Co', vertical: 'custom' },
  modules: {},
  workerChips: {},
  terminology: {},
  branding: { primary: '#101010', secondary: '#202020', logoText: 'RC' },
} as unknown as TenantConfig;

const runtimeConfig: RuntimeConfig = {
  platformApiUrl: 'https://platform.example.com',
  tenantId: 'biz-42',
  tenantApiKey: 'tk_fixture_secret_value',
};

const trash: string[] = [];
afterEach(() => {
  for (const d of trash.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

async function readZipEntry(zipPath: string, entryName: string): Promise<string | null> {
  const buf = fs.readFileSync(zipPath);
  const zip = await JSZip.loadAsync(buf);
  const entry = zip.file(entryName);
  if (!entry) return null;
  return entry.async('string');
}

interface BuilderCase {
  name: string;
  prefix: string;
  build: (
    cfg: TenantConfig,
    frontDir: string,
    outputDir: string,
    emit: Emitter,
    signal: AbortSignal | undefined,
    deps: { createTempCopy: () => Promise<{ rootDir: string; frontDir: string }>; cleanupTempCopy: () => void; runtimeConfig?: RuntimeConfig },
  ) => Promise<BuildResult>;
}

const BUILDERS: BuilderCase[] = [
  { name: 'web-zip', prefix: 'app', build: buildWebZip as BuilderCase['build'] },
  { name: 'apk', prefix: 'mobile-src', build: buildApk as BuilderCase['build'] },
  { name: 'ipa', prefix: 'mobile-src', build: buildIpa as BuilderCase['build'] },
  { name: 'exe', prefix: 'desktop-src', build: buildExe as BuilderCase['build'] },
];

// ── WU2.2: valores del fixture presentes en .env.local ──────────────────────

for (const { name, prefix, build } of BUILDERS) {
  test(`2.2 ${name}: .env.local del ZIP contiene PLATFORM_API_URL/TENANT_ID/TENANT_API_KEY reales`, async () => {
    const fixture = buildFixtureTmp({ includeCrossPlatform: true });
    trash.push(fixture.rootDir);
    const outputDir = path.join(os.tmpdir(), `runtime-envlocal-${name}-${randomUUID()}`);
    trash.push(outputDir);

    const result = await build(config, '/fake/front', outputDir, () => {}, undefined, {
      createTempCopy: async () => fixture,
      cleanupTempCopy: () => {},
      runtimeConfig,
    });
    assert.ok(result.success, `${name} debe tener exito`);

    const envLocal = await readZipEntry((result as { outputPath: string }).outputPath, `${prefix}/.env.local`);
    assert.ok(envLocal, `${name}: .env.local debe existir en el ZIP`);
    assert.ok(envLocal!.includes('PLATFORM_API_URL=https://platform.example.com'));
    assert.ok(envLocal!.includes('TENANT_ID=biz-42'));
    assert.ok(envLocal!.includes('TENANT_API_KEY=tk_fixture_secret_value'));
    // Regresión: el tenant sigue horneado como antes de este change.
    assert.ok(envLocal!.includes('NEXT_PUBLIC_TENANT_JSON='));
  });
}

// ── WU3.2: .env.example lleva solo placeholders, nunca el valor real ────────

for (const { name, prefix, build } of BUILDERS) {
  test(`3.2 ${name}: .env.example del ZIP declara las 3 claves vacías, nunca el valor real del fixture`, async () => {
    const fixture = buildFixtureTmp({ includeCrossPlatform: true });
    trash.push(fixture.rootDir);
    const outputDir = path.join(os.tmpdir(), `runtime-envexample-${name}-${randomUUID()}`);
    trash.push(outputDir);

    const result = await build(config, '/fake/front', outputDir, () => {}, undefined, {
      createTempCopy: async () => fixture,
      cleanupTempCopy: () => {},
      runtimeConfig,
    });
    assert.ok(result.success, `${name} debe tener exito`);

    const envExample = await readZipEntry((result as { outputPath: string }).outputPath, `${prefix}/.env.example`);
    assert.ok(envExample, `${name}: .env.example debe existir en el ZIP`);
    assert.ok(envExample!.includes('PLATFORM_API_URL=\n') || envExample!.trim().endsWith('PLATFORM_API_URL='));
    assert.ok(envExample!.includes('TENANT_ID=\n') || envExample!.trim().endsWith('TENANT_ID='));
    assert.ok(envExample!.includes('TENANT_API_KEY=\n') || envExample!.trim().endsWith('TENANT_API_KEY='));
    // Anti-fuga: el valor real del fixture NUNCA debe aparecer en .env.example.
    assert.ok(!envExample!.includes('tk_fixture_secret_value'));
    assert.ok(!envExample!.includes('biz-42'));
    assert.ok(!envExample!.includes('platform.example.com'));
  });
}

// ── WU4.1: consistencia cruzada entre los 4 formatos ─────────────────────────

test('4.1 consistencia cruzada: mismo runtimeConfig → los 4 ZIP llevan los mismos 3 valores', async () => {
  const results: Record<string, string> = {};

  for (const { name, prefix, build } of BUILDERS) {
    const fixture = buildFixtureTmp({ includeCrossPlatform: true });
    trash.push(fixture.rootDir);
    const outputDir = path.join(os.tmpdir(), `runtime-cross-${name}-${randomUUID()}`);
    trash.push(outputDir);

    const result = await build(config, '/fake/front', outputDir, () => {}, undefined, {
      createTempCopy: async () => fixture,
      cleanupTempCopy: () => {},
      runtimeConfig,
    });
    assert.ok(result.success, `${name} debe tener exito`);

    const envLocal = await readZipEntry((result as { outputPath: string }).outputPath, `${prefix}/.env.local`);
    assert.ok(envLocal, `${name}: .env.local debe existir en el ZIP`);
    results[name] = envLocal!;
  }

  for (const name of Object.keys(results)) {
    assert.ok(results[name].includes('PLATFORM_API_URL=https://platform.example.com'), `${name}: PLATFORM_API_URL`);
    assert.ok(results[name].includes('TENANT_ID=biz-42'), `${name}: TENANT_ID`);
    assert.ok(results[name].includes('TENANT_API_KEY=tk_fixture_secret_value'), `${name}: TENANT_API_KEY`);
  }
});
