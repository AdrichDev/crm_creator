/**
 * back/src/lib/__tests__/export-builders-apk.test.ts
 *
 * Test del builder apk (Fase 5.3) con spawn/fs mockeados:
 *   - secuencia: next build (export) → cap sync android → gradlew assembleRelease.
 *   - `next build` recibe NEXT_OUTPUT_MODE=export.
 *   - gradlew recibe las propiedades -Prel... de firma.
 *   - se escribe android/local.properties (sdk.dir).
 *   - el ZIP final contiene mobile-src/, app-release.apk y README.
 * Runner: node --import tsx --test
 */

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import JSZip from 'jszip';
import { buildApk } from '../export-builders/apk.js';
import type { TenantConfig } from '../../../../shared/generate/tenant-types.js';

const config = {
  business: { name: 'Mi Negocio', vertical: 'custom' },
  modules: {},
  workerChips: {},
  terminology: {},
  branding: { primary: '#000', secondary: '#fff', logoText: 'MN' },
} as unknown as TenantConfig;

// Nombre con caracteres especiales XML (&, ') para probar el escapado.
// Se evitan '<'/'>'/'"' en el nombre de prueba porque son invalidos en rutas
// de Windows y el nombre del ZIP se deriva del slug (no relacionado con este fix).
const configXmlChars = {
  business: { name: `Café & Rincón's Bar`, vertical: 'custom' },
  modules: {},
  workerChips: {},
  terminology: {},
  branding: { primary: '#000', secondary: '#fff', logoText: 'CB' },
} as unknown as TenantConfig;

const trash: string[] = [];
afterEach(() => {
  for (const d of trash.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

/** Copia temporal falsa con proyecto android/ y un APK ya materializado. */
function buildFixtureTmp(): string {
  const tmp = path.join(os.tmpdir(), `apk-tmp-${randomUUID()}`);
  // Fuente que debe entrar en mobile-src/.
  fs.mkdirSync(path.join(tmp, 'app', '(crm)', 'panel'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'app', '(crm)', 'panel', 'page.tsx'), '// panel');
  fs.writeFileSync(path.join(tmp, 'package.json'), '{}');
  fs.writeFileSync(path.join(tmp, '.env.local'), 'NEXT_PUBLIC_TENANT_JSON=e30=');
  fs.writeFileSync(
    path.join(tmp, 'capacitor.config.ts'),
    "const config = { appId: 'com.operaos.app' }; export default config;",
  );
  // Proyecto android/ scaffoldeado (build.gradle + wrapper).
  fs.mkdirSync(path.join(tmp, 'android', 'app'), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, 'android', 'app', 'build.gradle'),
    'android {\n  namespace "com.operaos.app"\n  defaultConfig { applicationId "com.operaos.app" }\n}',
  );
  fs.writeFileSync(path.join(tmp, 'android', 'gradlew.bat'), '@echo off');
  // strings.xml scaffoldeado por `cap add android` (nombre por defecto OperaOS).
  const valuesDir = path.join(tmp, 'android', 'app', 'src', 'main', 'res', 'values');
  fs.mkdirSync(valuesDir, { recursive: true });
  fs.writeFileSync(
    path.join(valuesDir, 'strings.xml'),
    "<?xml version='1.0' encoding='utf-8'?>\n" +
      '<resources>\n' +
      '    <string name="app_name">OperaOS</string>\n' +
      '    <string name="title_activity_main">OperaOS</string>\n' +
      '    <string name="package_name">com.operaos.app</string>\n' +
      '    <string name="custom_url_scheme">com.operaos.app</string>\n' +
      '</resources>\n',
  );
  // APK generado por Gradle.
  const releaseDir = path.join(tmp, 'android', 'app', 'build', 'outputs', 'apk', 'release');
  fs.mkdirSync(releaseDir, { recursive: true });
  fs.writeFileSync(path.join(releaseDir, 'app-release.apk'), 'APK-BYTES');
  // Carpetas que NO deben entrar en mobile-src/.
  fs.mkdirSync(path.join(tmp, 'node_modules', '.bin'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'node_modules', '.bin', 'cap'), '#!/bin/sh');
  fs.mkdirSync(path.join(tmp, '.next'), { recursive: true });
  fs.writeFileSync(path.join(tmp, '.next', 'x'), 'x');
  fs.mkdirSync(path.join(tmp, 'out'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'out', 'index.html'), '<html></html>');
  fs.mkdirSync(path.join(tmp, 'android', '.gradle'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'android', '.gradle', 'cache'), 'x');
  return tmp;
}

function makeSpawnFake(calls: { args: string[]; env?: NodeJS.ProcessEnv }[]) {
  return ((_cmd: string, args: string[], opts: { env?: NodeJS.ProcessEnv }) => {
    calls.push({ args, env: opts?.env });
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
      kill: () => void;
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {};
    setImmediate(() => child.emit('close', 0));
    return child;
  }) as unknown as typeof import('node:child_process').spawn;
}

test('5.3 apk: secuencia build→sync→gradlew firmado, local.properties y ZIP', async () => {
  const tmp = buildFixtureTmp();
  trash.push(tmp);
  const outputDir = path.join(os.tmpdir(), `apk-out-${randomUUID()}`);
  trash.push(outputDir);

  const calls: { args: string[]; env?: NodeJS.ProcessEnv }[] = [];

  const result = await buildApk(config, '/fake/front', outputDir, () => {}, undefined, {
    createTempCopy: async () => ({ rootDir: tmp, frontDir: tmp }),
    cleanupTempCopy: () => {}, // lo limpia afterEach
    runNpmCi: async () => {},
    applyExportCompat: () => [],
    checkToolchain: (async () => ({ ok: true, missing: [] })) as unknown as typeof import('../export-preflight.js').checkToolchain,
    ensureKeystore: async () => ({
      keystorePath: '/fake/ks/export-release.keystore',
      alias: 'operaos-release',
      storePassword: 'store-pass',
      keyPassword: 'key-pass',
    }),
    spawn: makeSpawnFake(calls),
    platform: 'win32',
  });

  assert.equal(result.success, true, 'el build debe tener exito');

  const line = (c: { args: string[] }) => c.args.join(' ');

  // next build con NEXT_OUTPUT_MODE=export.
  const nextCall = calls.find((c) => line(c).includes('next build'));
  assert.ok(nextCall, 'debe invocar next build');
  assert.equal(nextCall!.env?.NEXT_OUTPUT_MODE, 'export');

  // cap sync android.
  const capCall = calls.find((c) => line(c).includes('cap sync android'));
  assert.ok(capCall, 'debe invocar cap sync android');

  // gradlew assembleRelease con propiedades de firma.
  const gradleCall = calls.find((c) => line(c).includes('assembleRelease'));
  assert.ok(gradleCall, 'debe invocar gradlew assembleRelease');
  const gArgs = line(gradleCall!);
  assert.ok(gArgs.includes('-PrelKeystore='), 'pasa -PrelKeystore');
  assert.ok(gArgs.includes('-PrelAlias=operaos-release'), 'pasa -PrelAlias');
  assert.ok(gArgs.includes('-PrelStorePass=store-pass'), 'pasa -PrelStorePass');
  assert.ok(gArgs.includes('-PrelKeyPass=key-pass'), 'pasa -PrelKeyPass');
  assert.ok(gArgs.includes('--no-daemon'), 'pasa --no-daemon');

  // Orden: next build < cap sync < gradlew.
  const idxNext = calls.indexOf(nextCall!);
  const idxCap = calls.indexOf(capCall!);
  const idxGradle = calls.indexOf(gradleCall!);
  assert.ok(idxNext < idxCap && idxCap < idxGradle, 'orden correcto de la secuencia');

  // local.properties escrito con sdk.dir.
  const localProps = path.join(tmp, 'android', 'local.properties');
  assert.ok(fs.existsSync(localProps), 'local.properties escrito');
  assert.ok(fs.readFileSync(localProps, 'utf8').startsWith('sdk.dir='), 'contiene sdk.dir');

  // strings.xml: nombre visible de la app actualizado al del tenant (gate 5.V).
  const stringsPath = path.join(
    tmp,
    'android',
    'app',
    'src',
    'main',
    'res',
    'values',
    'strings.xml',
  );
  const strings = fs.readFileSync(stringsPath, 'utf8');
  assert.ok(
    strings.includes('<string name="app_name">Mi Negocio</string>'),
    'app_name actualizado al nombre del negocio',
  );
  assert.ok(
    strings.includes('<string name="title_activity_main">Mi Negocio</string>'),
    'title_activity_main actualizado al nombre del negocio',
  );
  // package_name/custom_url_scheme no deben tocarse por esta personalizacion.
  assert.ok(strings.includes('<string name="package_name">com.operaos.app</string>'));

  // Nombre del ZIP.
  assert.ok(result.success && result.outputPath.endsWith('mi-negocio-android.zip'));

  // Entradas del ZIP.
  const buf = fs.readFileSync((result as { outputPath: string }).outputPath);
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files);
  const has = (p: string) => names.some((n) => n.replace(/\\/g, '/') === p);
  const hasPrefix = (p: string) => names.some((n) => n.replace(/\\/g, '/').startsWith(p));

  assert.ok(has('README.md'), 'README.md');
  assert.ok(has('app-release.apk'), 'app-release.apk');
  assert.ok(hasPrefix('mobile-src/'), 'mobile-src/ presente');
  assert.ok(has('mobile-src/android/app/build.gradle'), 'android/ en mobile-src');

  // Exclusiones de mobile-src/.
  assert.ok(!hasPrefix('mobile-src/node_modules/'), 'NO node_modules');
  assert.ok(!hasPrefix('mobile-src/.next/'), 'NO .next');
  assert.ok(!hasPrefix('mobile-src/out/'), 'NO out');
  assert.ok(!hasPrefix('mobile-src/android/app/build/'), 'NO android build');
  assert.ok(!hasPrefix('mobile-src/android/.gradle/'), 'NO android .gradle');
});

test('5.3 apk: strings.xml escapa caracteres XML del nombre del negocio', async () => {
  const tmp = buildFixtureTmp();
  trash.push(tmp);
  const outputDir = path.join(os.tmpdir(), `apk-out-${randomUUID()}`);
  trash.push(outputDir);

  const result = await buildApk(configXmlChars, '/fake/front', outputDir, () => {}, undefined, {
    createTempCopy: async () => ({ rootDir: tmp, frontDir: tmp }),
    cleanupTempCopy: () => {},
    runNpmCi: async () => {},
    applyExportCompat: () => [],
    checkToolchain: (async () => ({ ok: true, missing: [] })) as unknown as typeof import('../export-preflight.js').checkToolchain,
    ensureKeystore: async () => ({
      keystorePath: '/fake/ks/export-release.keystore',
      alias: 'operaos-release',
      storePassword: 'store-pass',
      keyPassword: 'key-pass',
    }),
    spawn: makeSpawnFake([]),
    platform: 'win32',
  });

  assert.equal(result.success, true);

  const stringsPath = path.join(
    tmp,
    'android',
    'app',
    'src',
    'main',
    'res',
    'values',
    'strings.xml',
  );
  const strings = fs.readFileSync(stringsPath, 'utf8');
  const escaped = 'Café &amp; Rincón&apos;s Bar';
  assert.ok(
    strings.includes(`<string name="app_name">${escaped}</string>`),
    'app_name escapado correctamente',
  );
  assert.ok(
    strings.includes(`<string name="title_activity_main">${escaped}</string>`),
    'title_activity_main escapado correctamente',
  );
});

test('6.3 apk: preflight con jdk/sdk ausentes → autoinstall → re-preflight ok → build sigue', async () => {
  const tmp = buildFixtureTmp();
  trash.push(tmp);
  const outputDir = path.join(os.tmpdir(), `apk-out-${randomUUID()}`);
  trash.push(outputDir);

  let checkCalls = 0;
  let installArgs: string[] | undefined;

  const result = await buildApk(config, '/fake/front', outputDir, () => {}, undefined, {
    createTempCopy: async () => ({ rootDir: tmp, frontDir: tmp }),
    cleanupTempCopy: () => {},
    runNpmCi: async () => {},
    applyExportCompat: () => [],
    ensureKeystore: async () => ({
      keystorePath: '/fake/ks.keystore',
      alias: 'operaos-release',
      storePassword: 's',
      keyPassword: 'k',
    }),
    // 1ra llamada: faltan jdk+sdk. 2da (re-preflight): todo ok.
    checkToolchain: (async () => {
      checkCalls += 1;
      return checkCalls === 1
        ? { ok: false, missing: ['jdk', 'sdk'] as const }
        : { ok: true, missing: [] };
    }) as unknown as typeof import('../export-preflight.js').checkToolchain,
    ensureAndroidToolchain: (async (missing: string[]) => {
      installArgs = missing;
      return { ok: true };
    }) as unknown as typeof import('../export-autoinstall.js').ensureAndroidToolchain,
    spawn: makeSpawnFake([]),
    platform: 'win32',
  });

  assert.equal(result.success, true, 'el build debe completarse tras la instalacion');
  assert.equal(checkCalls, 2, 'preflight se llama antes y despues de instalar');
  assert.deepEqual(installArgs, ['jdk', 'sdk'], 'autoinstall recibe lo que falta');
});

test('6.3 apk: gradlew ausente → error inmediato (repo roto, no auto-instalable)', async () => {
  const tmp = buildFixtureTmp();
  trash.push(tmp);
  const outputDir = path.join(os.tmpdir(), `apk-out-${randomUUID()}`);
  trash.push(outputDir);

  let installCalled = false;

  const result = await buildApk(config, '/fake/front', outputDir, () => {}, undefined, {
    createTempCopy: async () => ({ rootDir: tmp, frontDir: tmp }),
    cleanupTempCopy: () => {},
    runNpmCi: async () => {},
    applyExportCompat: () => [],
    checkToolchain: (async () => ({
      ok: false,
      missing: ['gradlew'] as const,
    })) as unknown as typeof import('../export-preflight.js').checkToolchain,
    ensureAndroidToolchain: (async () => {
      installCalled = true;
      return { ok: true };
    }) as unknown as typeof import('../export-autoinstall.js').ensureAndroidToolchain,
    spawn: makeSpawnFake([]),
    platform: 'win32',
  });

  assert.equal(result.success, false);
  assert.ok(!result.success && /wrapper de Gradle/i.test(result.error), 'error de repo incompleto');
  assert.equal(installCalled, false, 'no intenta auto-instalar un wrapper ausente');
});

test('6.3 apk: autoinstall falla → error con las instrucciones manuales', async () => {
  const tmp = buildFixtureTmp();
  trash.push(tmp);
  const outputDir = path.join(os.tmpdir(), `apk-out-${randomUUID()}`);
  trash.push(outputDir);

  const result = await buildApk(config, '/fake/front', outputDir, () => {}, undefined, {
    createTempCopy: async () => ({ rootDir: tmp, frontDir: tmp }),
    cleanupTempCopy: () => {},
    runNpmCi: async () => {},
    applyExportCompat: () => [],
    checkToolchain: (async () => ({
      ok: false,
      missing: ['jdk'] as const,
    })) as unknown as typeof import('../export-preflight.js').checkToolchain,
    ensureAndroidToolchain: (async () => ({
      ok: false,
      instructions: 'winget install EclipseAdoptium.Temurin.17.JDK ...',
    })) as unknown as typeof import('../export-autoinstall.js').ensureAndroidToolchain,
    spawn: makeSpawnFake([]),
    platform: 'win32',
  });

  assert.equal(result.success, false);
  assert.ok(!result.success && result.error.includes('winget install'), 'propaga instrucciones');
});

test('5.3 apk: falla si gradlew sale con code != 0', async () => {
  const tmp = buildFixtureTmp();
  trash.push(tmp);
  const outputDir = path.join(os.tmpdir(), `apk-out-${randomUUID()}`);
  trash.push(outputDir);

  const spawnFake = ((_cmd: string, args: string[]) => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
      kill: () => void;
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {};
    const isGradle = args.join(' ').includes('assembleRelease');
    setImmediate(() => {
      if (isGradle) child.stderr.emit('data', Buffer.from('boom-gradle'));
      child.emit('close', isGradle ? 1 : 0);
    });
    return child;
  }) as unknown as typeof import('node:child_process').spawn;

  const result = await buildApk(config, '/fake/front', outputDir, () => {}, undefined, {
    createTempCopy: async () => ({ rootDir: tmp, frontDir: tmp }),
    cleanupTempCopy: () => {},
    runNpmCi: async () => {},
    applyExportCompat: () => [],
    checkToolchain: (async () => ({ ok: true, missing: [] })) as unknown as typeof import('../export-preflight.js').checkToolchain,
    ensureKeystore: async () => ({
      keystorePath: '/fake/ks.keystore',
      alias: 'operaos-release',
      storePassword: 's',
      keyPassword: 'k',
    }),
    spawn: spawnFake,
    platform: 'win32',
  });

  assert.equal(result.success, false);
  assert.ok(!result.success && result.error.includes('gradlew'));
});
