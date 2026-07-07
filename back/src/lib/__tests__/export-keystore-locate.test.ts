/**
 * back/src/lib/__tests__/export-keystore-locate.test.ts
 *
 * Fase 5.2 (fix gate 5.V): resolucion robusta de keytool ante shims de Java
 * (p.ej. Oracle javapath, que solo contiene java/javaw/javac sin keytool).
 *
 * Cadena de resolucion cubierta:
 *   1. JAVA_HOME/bin/keytool si existe.
 *   2. `java -XshowSettings:properties -version` (stderr) → java.home real →
 *      <java.home>/bin/keytool (resuelve el caso shim).
 *   3. `where`/`which keytool` directo.
 *   4. Error claro si nada funciona.
 *
 * Runner: node --import tsx --test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { locateKeytool } from '../export-keystore.js';

const ORIGINAL_JAVA_HOME = process.env.JAVA_HOME;

function withoutJavaHome<T>(fn: () => T): T {
  delete process.env.JAVA_HOME;
  try {
    return fn();
  } finally {
    if (ORIGINAL_JAVA_HOME !== undefined) process.env.JAVA_HOME = ORIGINAL_JAVA_HOME;
  }
}

test('5.2 locateKeytool: usa JAVA_HOME/bin/keytool si existe', async () => {
  process.env.JAVA_HOME = 'C:\\jdk-17';
  try {
    const execCalls: string[] = [];
    const result = await locateKeytool({
      platform: 'win32',
      exists: (p) => p === 'C:\\jdk-17\\bin\\keytool.exe',
      exec: (cmd) => {
        execCalls.push(cmd);
        return { status: 1, stdout: '', stderr: '' };
      },
    });
    assert.equal(result, 'C:\\jdk-17\\bin\\keytool.exe');
    assert.equal(execCalls.length, 0, 'no debe ejecutar nada si JAVA_HOME resuelve');
  } finally {
    delete process.env.JAVA_HOME;
    if (ORIGINAL_JAVA_HOME !== undefined) process.env.JAVA_HOME = ORIGINAL_JAVA_HOME;
  }
});

test('5.2 locateKeytool: caso shim — where java resuelve a javapath sin keytool, java.home lo tiene', () =>
  withoutJavaHome(async () => {
    const shimJavaExe = 'C:\\Program Files\\Common Files\\Oracle\\Java\\javapath\\java.exe';
    const realJdkBin = 'C:\\Program Files\\Eclipse Adoptium\\jdk-17\\bin';

    const result = await locateKeytool({
      platform: 'win32',
      // Solo existe el keytool del JDK real; el del shim (mismo dir que java) NO.
      exists: (p) => p === `${realJdkBin}\\keytool.exe`,
      exec: (cmd, args) => {
        if (cmd === 'java' && args.includes('-XshowSettings:properties')) {
          // java.home va por STDERR, apuntando al JDK real (NO al dir del shim).
          return {
            status: 0,
            stdout: '',
            stderr: `Property settings:\n    java.home = C:\\Program Files\\Eclipse Adoptium\\jdk-17\njava version "17.0.9"\n`,
          };
        }
        if (cmd === 'where' && args[0] === 'keytool') {
          // keytool no esta en el PATH global (solo dentro del JDK real).
          return { status: 1, stdout: '', stderr: '' };
        }
        throw new Error(`exec inesperado: ${cmd} ${args.join(' ')}`);
      },
    });

    assert.equal(result, `${realJdkBin}\\keytool.exe`);
    assert.notEqual(result, shimJavaExe, 'nunca debe intentar el dir del shim');
  }));

test('5.2 locateKeytool: fallback a where/which keytool si java.home no resuelve', () =>
  withoutJavaHome(async () => {
    const result = await locateKeytool({
      platform: 'win32',
      exists: (p) => p === 'C:\\tools\\keytool.exe',
      exec: (cmd, args) => {
        if (cmd === 'java') return { status: 0, stdout: '', stderr: 'no properties here\n' };
        if (cmd === 'where' && args[0] === 'keytool') {
          return { status: 0, stdout: 'C:\\tools\\keytool.exe\n', stderr: '' };
        }
        throw new Error(`exec inesperado: ${cmd}`);
      },
    });
    assert.equal(result, 'C:\\tools\\keytool.exe');
  }));

test('5.2 locateKeytool: error claro si ninguna estrategia resuelve', () =>
  withoutJavaHome(async () => {
    await assert.rejects(
      () =>
        locateKeytool({
          platform: 'win32',
          exists: () => false,
          exec: () => ({ status: 1, stdout: '', stderr: '' }),
        }),
      /JDK 17|JAVA_HOME/,
    );
  }));
