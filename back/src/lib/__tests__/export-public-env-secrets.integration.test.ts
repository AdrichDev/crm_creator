/**
 * back/src/lib/__tests__/export-public-env-secrets.integration.test.ts
 *
 * crm-env-contract-tiers (WU3.4): cierra la brecha de cobertura end-to-end del
 * horneado de secretos `FRONTEND_PUBLIC`. Comprueba que un secreto de tenant
 * con `envVarName` NEXT_PUBLIC_* pasado por `deps.publicEnvSecrets` viaja hasta
 * el `.env.local` real dentro del ZIP construido, en los 4 builders.
 *
 * Complementa a export-runtime-config.test.ts (cableado runtime plataforma) y a
 * export-env-leak.test.ts (anti-fuga del .env.local del operador): aqui el foco
 * es el puente secreto->NEXT_PUBLIC y sus barreras (regex, no-clobber de base).
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
import type { PublicEnvSecret } from '../export-builders/public-env-secrets.js';
import type { BuildResult, Emitter } from '../export-builders/web-zip.js';

const config = {
  business: { name: 'Public Env Co', vertical: 'custom' },
  modules: {},
  workerChips: {},
  terminology: {},
  branding: { primary: '#0a0a0a', secondary: '#1a1a1a', logoText: 'PE' },
} as unknown as TenantConfig;

/**
 * Secretos de prueba: uno valido (NEXT_PUBLIC_*, debe hornearse) y uno con
 * `envVarName` estilo backend (control negativo: la regex de
 * `buildPublicEnvSecretsLines` lo descarta y su valor NUNCA debe aparecer).
 */
const VALID_ENV_VAR = 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY';
const VALID_VALUE = 'AIza-TESTVALUE';
const BACKEND_ENV_VAR = 'BACKEND_SECRET';
const BACKEND_VALUE = 'sk_backend_should_not_ship';

const publicEnvSecrets: PublicEnvSecret[] = [
  { envVarName: VALID_ENV_VAR, value: VALID_VALUE },
  // Control negativo: envVarName no-NEXT_PUBLIC, filtrado por la re-validacion.
  { envVarName: BACKEND_ENV_VAR, value: BACKEND_VALUE },
];

// Limpieza de tmp entre tests (mismo patron que export-runtime-config.test.ts).
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
    config: TenantConfig,
    frontDir: string,
    outputDir: string,
    emit: Emitter,
    signal?: AbortSignal,
    deps?: { createTempCopy: unknown; cleanupTempCopy: unknown; publicEnvSecrets?: PublicEnvSecret[] },
  ) => Promise<BuildResult>;
}

// prefix = carpeta raiz del codigo front dentro del ZIP de cada builder.
const BUILDERS: BuilderCase[] = [
  { name: 'web-zip', prefix: 'app', build: buildWebZip as BuilderCase['build'] },
  { name: 'apk', prefix: 'mobile-src', build: buildApk as BuilderCase['build'] },
  { name: 'ipa', prefix: 'mobile-src', build: buildIpa as BuilderCase['build'] },
  { name: 'exe', prefix: 'desktop-src', build: buildExe as BuilderCase['build'] },
];

// ── WU3.4: el secreto NEXT_PUBLIC_* llega al .env.local horneado ────────────

for (const { name, prefix, build } of BUILDERS) {
  test(`3.4 ${name}: .env.local del ZIP hornea el secreto FRONTEND_PUBLIC (NEXT_PUBLIC_*)`, async () => {
    const fixture = buildFixtureTmp({ includeCrossPlatform: true });
    trash.push(fixture.rootDir);
    const outputDir = path.join(os.tmpdir(), `publicenv-${name}-${randomUUID()}`);
    trash.push(outputDir);

    const result = await build(config, '/fake/front', outputDir, () => {}, undefined, {
      createTempCopy: async () => fixture,
      cleanupTempCopy: () => {},
      publicEnvSecrets,
    });
    assert.ok(result.success, `${name} debe tener exito`);

    const envLocal = await readZipEntry((result as { outputPath: string }).outputPath, `${prefix}/.env.local`);
    assert.ok(envLocal, `${name}: .env.local debe existir en el ZIP`);
    // El secreto valido se hornea con su valor exacto.
    assert.ok(
      envLocal!.includes(`${VALID_ENV_VAR}=${VALID_VALUE}`),
      `${name}: debe hornear ${VALID_ENV_VAR}`,
    );
    // Control negativo: el secreto estilo backend jamas se emite.
    assert.ok(!envLocal!.includes(BACKEND_VALUE), `${name}: no debe filtrar valor backend`);
    assert.ok(!envLocal!.includes(`${BACKEND_ENV_VAR}=`), `${name}: no debe emitir la clave backend`);
    // No-clobber: la variable base del tenant sigue horneada.
    assert.ok(envLocal!.includes('NEXT_PUBLIC_TENANT_JSON='), `${name}: base tenant intacta`);
  });
}

// ── WU3.4: consistencia cruzada entre los 4 formatos ────────────────────────

test('3.4 los 4 formatos hornean el mismo secreto NEXT_PUBLIC_* y descartan el backend', async () => {
  const results: Record<string, string> = {};

  for (const { name, prefix, build } of BUILDERS) {
    const fixture = buildFixtureTmp({ includeCrossPlatform: true });
    trash.push(fixture.rootDir);
    const outputDir = path.join(os.tmpdir(), `publicenv-cross-${name}-${randomUUID()}`);
    trash.push(outputDir);

    const result = await build(config, '/fake/front', outputDir, () => {}, undefined, {
      createTempCopy: async () => fixture,
      cleanupTempCopy: () => {},
      publicEnvSecrets,
    });
    assert.ok(result.success, `${name} debe tener exito`);

    const envLocal = await readZipEntry((result as { outputPath: string }).outputPath, `${prefix}/.env.local`);
    assert.ok(envLocal, `${name}: .env.local debe existir en el ZIP`);
    results[name] = envLocal!;
  }

  for (const name of Object.keys(results)) {
    assert.ok(results[name].includes(`${VALID_ENV_VAR}=${VALID_VALUE}`), `${name}: ${VALID_ENV_VAR}`);
    assert.ok(!results[name].includes(BACKEND_VALUE), `${name}: sin valor backend`);
    assert.ok(results[name].includes('NEXT_PUBLIC_TENANT_JSON='), `${name}: base tenant`);
  }
});

// ── WU3.4: sin secretos -> ningun NEXT_PUBLIC_* extra (camino por defecto) ───

test('3.4 web-zip: publicEnvSecrets vacio no hornea lineas extra', async () => {
  const fixture = buildFixtureTmp({ includeCrossPlatform: true });
  trash.push(fixture.rootDir);
  const outputDir = path.join(os.tmpdir(), `publicenv-empty-${randomUUID()}`);
  trash.push(outputDir);

  const result = await buildWebZip(config, '/fake/front', outputDir, () => {}, undefined, {
    createTempCopy: async () => fixture,
    cleanupTempCopy: () => {},
    publicEnvSecrets: [],
  } as never);
  assert.ok(result.success, 'web-zip debe tener exito');

  const envLocal = await readZipEntry((result as { outputPath: string }).outputPath, 'app/.env.local');
  assert.ok(envLocal, 'web-zip: .env.local debe existir en el ZIP');
  // Regresion: sin secretos no aparece el NEXT_PUBLIC_* del negocio.
  assert.ok(!envLocal!.includes(VALID_ENV_VAR), 'web-zip: sin secretos no hornea la variable');
  assert.ok(!envLocal!.includes(VALID_VALUE), 'web-zip: sin secretos no hornea el valor');
  // Pero la base del tenant sigue presente (el archivo no esta vacio).
  assert.ok(envLocal!.includes('NEXT_PUBLIC_TENANT_JSON='), 'web-zip: base tenant intacta');
});
