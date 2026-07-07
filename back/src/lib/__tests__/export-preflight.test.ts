/**
 * back/src/lib/__tests__/export-preflight.test.ts
 *
 * Fase 6.1: preflight POR PROYECTO con fs/exec mockeados.
 *   - detecta electron-builder LOCAL (devDependencies del front, no PATH).
 *   - detecta gradlew del proyecto (nunca `where gradle`).
 *   - detecta JDK >= 17 (JAVA_HOME o `java -version`).
 *   - detecta Android SDK (ANDROID_HOME / %LOCALAPPDATA%\Android\Sdk con platforms/).
 *
 * Runner: node --import tsx --test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkToolchain,
  parseJavaMajor,
  type CheckToolchainDeps,
} from '../export-preflight.js';

const FRONT = 'C:\\repo\\front';

/** Entorno base sin JAVA_HOME/ANDROID_HOME; solo LOCALAPPDATA para el SDK. */
function baseDeps(over: Partial<CheckToolchainDeps> = {}): CheckToolchainDeps {
  return {
    platform: 'win32',
    env: { LOCALAPPDATA: 'C:\\Users\\dev\\AppData\\Local' },
    exists: () => false,
    readFile: () => '{}',
    readdir: () => [],
    exec: () => ({ status: 1, stdout: '', stderr: '' }),
    ...over,
  };
}

// ---------------------------------------------------------------------------
// web-zip / ipa
// ---------------------------------------------------------------------------

test('6.1 web-zip: siempre ok (solo Node)', async () => {
  const r = await checkToolchain('web-zip', FRONT, baseDeps());
  assert.deepEqual(r, { ok: true, missing: [] });
});

test('6.1 ipa: siempre ok en preflight (guard vive en el builder)', async () => {
  const r = await checkToolchain('ipa', FRONT, baseDeps());
  assert.deepEqual(r, { ok: true, missing: [] });
});

// ---------------------------------------------------------------------------
// exe → electron-builder local (devDependencies), no PATH
// ---------------------------------------------------------------------------

test('6.1 exe: electron-builder en devDependencies → ok (deteccion local, sin node_modules)', async () => {
  const r = await checkToolchain(
    'exe',
    FRONT,
    baseDeps({
      exists: (p) => p === 'C:\\repo\\front\\package.json',
      readFile: () => JSON.stringify({ devDependencies: { 'electron-builder': '^24.0.0' } }),
    }),
  );
  assert.deepEqual(r, { ok: true, missing: [] });
});

test('6.1 exe: electron-builder ausente en package.json → missing electron_builder', async () => {
  const r = await checkToolchain(
    'exe',
    FRONT,
    baseDeps({
      exists: (p) => p === 'C:\\repo\\front\\package.json',
      readFile: () => JSON.stringify({ devDependencies: { next: '^15' } }),
    }),
  );
  assert.deepEqual(r, { ok: false, missing: ['electron_builder'] });
});

test('6.1 exe: sin package.json → missing node_modules (repo roto)', async () => {
  const r = await checkToolchain('exe', FRONT, baseDeps({ exists: () => false }));
  assert.deepEqual(r, { ok: false, missing: ['node_modules'] });
});

// ---------------------------------------------------------------------------
// apk → gradlew del proyecto + JDK + SDK
// ---------------------------------------------------------------------------

const gradlew = 'C:\\repo\\front\\android\\gradlew.bat';
const wrapperJar = 'C:\\repo\\front\\android\\gradle\\wrapper\\gradle-wrapper.jar';
const platformsDir = 'C:\\Users\\dev\\AppData\\Local\\Android\\Sdk\\platforms';

test('6.1 apk: gradlew + JDK 21 + SDK con platforms → ok, y NUNCA consulta PATH para gradle', async () => {
  const execCmds: string[] = [];
  const r = await checkToolchain(
    'apk',
    FRONT,
    baseDeps({
      exists: (p) => p === gradlew || p === wrapperJar || p === platformsDir,
      readdir: (p) => (p === platformsDir ? ['android-35'] : []),
      exec: (cmd, args) => {
        execCmds.push(`${cmd} ${args.join(' ')}`);
        if (cmd === 'java') {
          return { status: 0, stdout: '', stderr: 'openjdk version "21.0.11" 2024-04-16\n' };
        }
        return { status: 1, stdout: '', stderr: '' };
      },
    }),
  );
  assert.deepEqual(r, { ok: true, missing: [] });
  // Nunca debe invocar `where gradle` / `which gradle`.
  assert.ok(
    !execCmds.some((c) => /where gradle|which gradle|gradle$/i.test(c)),
    'no debe consultar el PATH para gradle',
  );
});

test('6.1 apk: sin gradlew wrapper → missing gradlew', async () => {
  const r = await checkToolchain(
    'apk',
    FRONT,
    baseDeps({
      exists: (p) => p === platformsDir, // hay SDK pero no wrapper
      readdir: () => ['android-35'],
      exec: (cmd) =>
        cmd === 'java'
          ? { status: 0, stdout: '', stderr: 'openjdk version "17.0.10"\n' }
          : { status: 1, stdout: '', stderr: '' },
    }),
  );
  assert.deepEqual(r.missing, ['gradlew']);
  assert.equal(r.ok, false);
});

test('6.1 apk: JDK 11 (< 17) → missing jdk', async () => {
  const r = await checkToolchain(
    'apk',
    FRONT,
    baseDeps({
      exists: (p) => p === gradlew || p === wrapperJar || p === platformsDir,
      readdir: () => ['android-35'],
      exec: (cmd) =>
        cmd === 'java'
          ? { status: 0, stdout: '', stderr: 'openjdk version "11.0.22"\n' }
          : { status: 1, stdout: '', stderr: '' },
    }),
  );
  assert.deepEqual(r.missing, ['jdk']);
});

test('6.1 apk: sin platforms poblado → missing sdk', async () => {
  const r = await checkToolchain(
    'apk',
    FRONT,
    baseDeps({
      exists: (p) => p === gradlew || p === wrapperJar || p === platformsDir,
      readdir: (p) => (p === platformsDir ? [] : []), // platforms/ vacio
      exec: (cmd) =>
        cmd === 'java'
          ? { status: 0, stdout: '', stderr: 'openjdk version "21"\n' }
          : { status: 1, stdout: '', stderr: '' },
    }),
  );
  assert.deepEqual(r.missing, ['sdk']);
});

test('6.1 apk: nada instalado → missing gradlew+jdk+sdk', async () => {
  const r = await checkToolchain('apk', FRONT, baseDeps());
  assert.deepEqual(r.missing.sort(), ['gradlew', 'jdk', 'sdk']);
});

test('6.1 apk: JAVA_HOME/bin/java resuelve el JDK sin tocar el PATH', async () => {
  const javaHomeExe = 'C:\\jdk-17\\bin\\java.exe';
  const r = await checkToolchain(
    'apk',
    FRONT,
    baseDeps({
      env: { LOCALAPPDATA: 'C:\\Users\\dev\\AppData\\Local', JAVA_HOME: 'C:\\jdk-17' },
      exists: (p) =>
        p === gradlew || p === wrapperJar || p === platformsDir || p === javaHomeExe,
      readdir: () => ['android-35'],
      exec: (cmd) =>
        cmd === javaHomeExe
          ? { status: 0, stdout: '', stderr: 'openjdk version "17.0.9"\n' }
          : { status: 1, stdout: '', stderr: '' },
    }),
  );
  assert.deepEqual(r, { ok: true, missing: [] });
});

// ---------------------------------------------------------------------------
// parseJavaMajor
// ---------------------------------------------------------------------------

test('6.1 parseJavaMajor: 21.0.11 → 21, 17 → 17, 1.8.0_401 → 8', () => {
  assert.equal(parseJavaMajor('21.0.11'), 21);
  assert.equal(parseJavaMajor('17'), 17);
  assert.equal(parseJavaMajor('1.8.0_401'), 8);
});
