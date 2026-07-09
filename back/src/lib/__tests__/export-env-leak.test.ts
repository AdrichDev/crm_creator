/**
 * back/src/lib/__tests__/export-env-leak.test.ts
 *
 * WU2.3: fuga de `.env.local` de desarrollo del operador. Con un secreto de
 * prueba sembrado en el `.env.local` de la fixture, el ZIP resultante de
 * cada builder NUNCA debe contener ese secreto — con o sin `config.api.url`
 * (AC2).
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

const SECRET = 'DEV_SECRET=super-mega-shhh-do-not-ship';

const baseConfig = {
  business: { name: 'Leak Co', vertical: 'custom' },
  modules: {},
  workerChips: {},
  terminology: {},
  branding: { primary: '#333333', secondary: '#444444', logoText: 'LC' },
} as unknown as TenantConfig;

const trash: string[] = [];
afterEach(() => {
  for (const d of trash.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

async function readEnvLocalFromZip(zipPath: string, prefix: string): Promise<string | null> {
  const buf = fs.readFileSync(zipPath);
  const zip = await JSZip.loadAsync(buf);
  const entry = zip.file(`${prefix}/.env.local`);
  if (!entry) return null;
  return entry.async('string');
}

const builders: Array<{
  name: string;
  prefix: string;
  build: typeof buildWebZip | typeof buildApk | typeof buildIpa | typeof buildExe;
}> = [
  { name: 'web-zip', prefix: 'app', build: buildWebZip },
  { name: 'apk', prefix: 'mobile-src', build: buildApk },
  { name: 'ipa', prefix: 'mobile-src', build: buildIpa },
  { name: 'exe', prefix: 'desktop-src', build: buildExe },
];

for (const { name, prefix, build } of builders) {
  test(`2.3 ${name}: .env.local del ZIP nunca contiene el secreto de dev (SIN config.api.url)`, async () => {
    const fixture = buildFixtureTmp({ envLocalSecret: SECRET });
    trash.push(fixture.rootDir);
    const outputDir = path.join(os.tmpdir(), `leak-${name}-noapi-${randomUUID()}`);
    trash.push(outputDir);

    const result = await build(baseConfig, '/fake/front', outputDir, () => {}, undefined, {
      createTempCopy: async () => fixture,
      cleanupTempCopy: () => {},
    } as never);
    assert.ok(result.success, `${name} debe tener exito`);

    const envContent = await readEnvLocalFromZip((result as { outputPath: string }).outputPath, prefix);
    assert.ok(envContent !== null, `${name}: .env.local debe existir en el ZIP (fresco)`);
    assert.ok(!envContent!.includes('DEV_SECRET'), `${name}: no debe filtrar el secreto de dev`);
    // Regresion positiva: el tenant SIGUE horneado (no es que el archivo este vacio).
    assert.ok(envContent!.includes('NEXT_PUBLIC_TENANT_JSON='), `${name}: debe llevar el tenant horneado`);
  });

  test(`2.3 ${name}: .env.local del ZIP nunca contiene el secreto de dev (CON config.api.url)`, async () => {
    const fixture = buildFixtureTmp({ envLocalSecret: SECRET });
    trash.push(fixture.rootDir);
    const outputDir = path.join(os.tmpdir(), `leak-${name}-api-${randomUUID()}`);
    trash.push(outputDir);

    const configWithApi = { ...baseConfig, api: { url: 'https://api.example.com' } } as TenantConfig;
    const result = await build(configWithApi, '/fake/front', outputDir, () => {}, undefined, {
      createTempCopy: async () => fixture,
      cleanupTempCopy: () => {},
    } as never);
    assert.ok(result.success, `${name} debe tener exito`);

    const envContent = await readEnvLocalFromZip((result as { outputPath: string }).outputPath, prefix);
    assert.ok(envContent !== null, `${name}: .env.local debe existir en el ZIP (fresco)`);
    assert.ok(!envContent!.includes('DEV_SECRET'), `${name}: no debe filtrar el secreto de dev`);
    assert.ok(
      envContent!.includes('NEXT_PUBLIC_API_URL=https://api.example.com'),
      `${name}: debe hornear la API URL configurada`,
    );
  });
}
