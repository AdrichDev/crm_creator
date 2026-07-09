/**
 * back/src/lib/__tests__/export-readme-leak.test.ts
 *
 * crm-export-delivery-profiles WU2.2/2.3 — barrera anti-fuga: el README
 * cliente (`deliverable: 'binary+source'`) de cada builder NUNCA debe
 * contener referencias internas del operador (rutas locales, credenciales
 * de firma, org scopes, URLs internas). La lista de marcadores prohibidos
 * vive aquí (en el TEST), no en el código de producción — así un builder
 * nuevo que reintroduzca una referencia interna en el README cliente rompe
 * este test en vez de colarse en un ZIP entregado a un cliente real.
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
import { buildExe } from '../export-builders/exe.js';
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

// Marcadores que SOLO deben aparecer en el README operador (`deliverable:
// 'binary'`), nunca en el README cliente. Cubren los 4 builders.
const FORBIDDEN_MARKERS = [
  'PAQUETE INTERNO',
  // web-zip: pipeline de deploy interno
  'operaos-hosting',
  'ops.operaos.internal',
  // apk: SDK/keystore local del operador
  'C:\\Android\\Sdk',
  'operaos-release.jks',
  'OPERAOS_KEYSTORE_PASS',
  // exe: certificado de firma de código propio
  'operaos-codesign.pfx',
  'OPERAOS_CODESIGN_PASS',
  // ipa: build host / perfil de distribución del operador
  '/Users/operaos-ci',
  'OperaOS Distribution',
];

type Builder = (
  config: TenantConfig,
  frontDir: string,
  outputDir: string,
  emit: (e: unknown) => void,
  signal: AbortSignal | undefined,
  deps: {
    createTempCopy: () => Promise<ReturnType<typeof buildFixtureTmp>>;
    cleanupTempCopy: () => void;
    deliverable?: 'binary' | 'binary+source';
  },
) => Promise<{ success: boolean; outputPath?: string }>;

const builders: Array<{ name: string; build: Builder }> = [
  { name: 'web-zip', build: buildWebZip as unknown as Builder },
  { name: 'apk', build: buildApk as unknown as Builder },
  { name: 'exe', build: buildExe as unknown as Builder },
  { name: 'ipa', build: buildIpa as unknown as Builder },
];

for (const { name, build } of builders) {
  test(`${name}: README cliente (binary+source) no filtra marcadores internos del operador`, async () => {
    const fixture = buildFixtureTmp();
    trash.push(fixture.rootDir);
    const outputDir = path.join(os.tmpdir(), `readme-leak-${name}-${randomUUID()}`);
    trash.push(outputDir);

    const result = await build(config, '/fake/front', outputDir, () => {}, undefined, {
      createTempCopy: async () => fixture,
      cleanupTempCopy: () => {},
      deliverable: 'binary+source',
    });
    assert.ok(result.success, `${name} build debe tener exito`);

    const buf = fs.readFileSync(result.outputPath!);
    const zip = await JSZip.loadAsync(buf);
    const readme = await zip.file('README.md')!.async('string');

    for (const marker of FORBIDDEN_MARKERS) {
      assert.ok(
        !readme.includes(marker),
        `${name}: README cliente NO debe contener el marcador interno "${marker}"`,
      );
    }
  });

  test(`${name}: README operador (binary) SÍ lleva el banner "PAQUETE INTERNO" en la primera línea`, async () => {
    const fixture = buildFixtureTmp();
    trash.push(fixture.rootDir);
    const outputDir = path.join(os.tmpdir(), `readme-leak-op-${name}-${randomUUID()}`);
    trash.push(outputDir);

    const result = await build(config, '/fake/front', outputDir, () => {}, undefined, {
      createTempCopy: async () => fixture,
      cleanupTempCopy: () => {},
      deliverable: 'binary',
    });
    assert.ok(result.success, `${name} build debe tener exito`);

    const buf = fs.readFileSync(result.outputPath!);
    const zip = await JSZip.loadAsync(buf);
    const readme = await zip.file('README.md')!.async('string');

    assert.ok(
      readme.startsWith('PAQUETE INTERNO — no entregar al cliente'),
      `${name}: README operador debe empezar exactamente con el banner "PAQUETE INTERNO — no entregar al cliente"`,
    );
  });
}
