import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
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

function buildFixtureTmp(): string {
  const tmp = path.join(os.tmpdir(), `webzip-tmp-${randomUUID()}`);
  fs.mkdirSync(path.join(tmp, 'app'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'app', 'page.tsx'), '// page');
  return tmp;
}

test('3.3 web-zip: empaqueta codigo fuente en ZIP', async () => {
  const tmp = buildFixtureTmp();
  trash.push(tmp);
  const outputDir = path.join(os.tmpdir(), `webzip-out-${randomUUID()}`);
  trash.push(outputDir);

  const result = await buildWebZip(config, '/fake/front', outputDir, () => {}, undefined, {
    createTempCopy: async () => ({ rootDir: tmp, frontDir: tmp }),
    cleanupTempCopy: () => {},
  });

  assert.equal(result.success, true, 'el build debe tener exito');
  assert.ok(result.success && result.outputPath.endsWith('mi-negocio-web-src.zip'));

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
  assert.ok(hasPrefix('app/'), 'fuente en app/');
});
