/**
 * back/src/lib/__tests__/export-manifest-cruft.test.ts
 *
 * WU7.1: cruft de desarrollo (openspec/, e2e/, tests/, test-results/, configs
 * de vitest/playwright/eslint, .gitignore, tsconfig.tsbuildinfo) nunca debe
 * llegar a ningun ZIP de exportacion, sea cual sea el formato. Busqueda por
 * ruta completa (no solo primer nivel) para atrapar cruft anidado.
 *
 * Nota: `.npmrc` (legacy-peer-deps=true) NO es cruft — es config intencional
 * en las 4 allowlists (crm-export-legacy-peer-deps) y viaja al artefacto.
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
import { buildFixtureTmp, CRUFT_RELATIVE_PATHS } from './export-fixture.js';
import type { TenantConfig } from '../../../../shared/generate/tenant-types.js';

const config = {
  business: { name: 'Cruft Co', vertical: 'custom' },
  modules: {},
  workerChips: {},
  terminology: {},
  branding: { primary: '#555555', secondary: '#666666', logoText: 'CC' },
} as unknown as TenantConfig;

const trash: string[] = [];
afterEach(() => {
  for (const d of trash.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const builders: Array<{
  name: string;
  build: typeof buildWebZip | typeof buildApk | typeof buildIpa | typeof buildExe;
}> = [
  { name: 'web-zip', build: buildWebZip },
  { name: 'apk', build: buildApk },
  { name: 'ipa', build: buildIpa },
  { name: 'exe', build: buildExe },
];

for (const { name, build } of builders) {
  test(`7.1 ${name}: ningun cruft de desarrollo llega al ZIP`, async () => {
    const fixture = buildFixtureTmp({ includeCruft: true, includeCrossPlatform: true });
    trash.push(fixture.rootDir);
    const outputDir = path.join(os.tmpdir(), `cruft-${name}-${randomUUID()}`);
    trash.push(outputDir);

    const result = await build(config, '/fake/front', outputDir, () => {}, undefined, {
      createTempCopy: async () => fixture,
      cleanupTempCopy: () => {},
    } as never);
    assert.ok(result.success, `${name} debe tener exito`);

    const buf = fs.readFileSync((result as { outputPath: string }).outputPath);
    const zip = await JSZip.loadAsync(buf);
    const names = Object.keys(zip.files).map((n) => n.replace(/\\/g, '/'));

    for (const cruftPath of CRUFT_RELATIVE_PATHS) {
      assert.ok(
        !names.some((n) => n.endsWith(`/${cruftPath}`) || n === cruftPath),
        `${name}: ${cruftPath} no debe aparecer en el ZIP`,
      );
    }
  });
}
