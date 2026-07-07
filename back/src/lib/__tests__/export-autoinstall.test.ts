/**
 * back/src/lib/__tests__/export-autoinstall.test.ts
 *
 * Fase 6.2/6.3: auto-instalacion de la toolchain Android con spawn/fs mockeados.
 *   - secuencia jdk → sdk (winget → descarga PowerShell → licencias → paquetes).
 *   - emite progreso por paso.
 *   - fallo de winget → ok:false con instrucciones que incluyen los comandos exactos.
 *
 * Runner: node --import tsx --test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  ensureAndroidToolchain,
  CMDLINE_TOOLS_URL,
} from '../export-autoinstall.js';
import type { ProgressEvent } from '../export-builders/web-zip.js';

interface Call {
  cmd: string;
  line: string;
  env?: NodeJS.ProcessEnv;
  stdin: string;
}

/** spawn fake: registra la invocacion y cierra con `exitCodeFor(line)`. */
function makeSpawn(calls: Call[], exitCodeFor: (line: string) => number) {
  return ((cmd: string, args: string[], opts: { env?: NodeJS.ProcessEnv }) => {
    const line = [cmd, ...args].join(' ');
    let stdin = '';
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
      stdin: { write: (c: string) => void; end: () => void };
      kill: () => void;
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = { write: (c: string) => { stdin += c; }, end: () => {} };
    child.kill = () => {};
    setImmediate(() => {
      calls.push({ cmd, line, env: opts?.env, stdin });
      child.emit('close', exitCodeFor(line));
    });
    return child;
  }) as unknown as typeof import('node:child_process').spawn;
}

const ENV = {
  LOCALAPPDATA: 'C:\\Users\\dev\\AppData\\Local',
  ProgramFiles: 'C:\\Program Files',
};

const jdkHome = 'C:\\Users\\dev\\AppData\\Local\\Programs\\Eclipse Adoptium\\jdk-17';

const fsDeps = {
  exists: (p: string) => true,
  readdir: (p: string) => [],
};

test('6.2 secuencia jdk→sdk: powershell(jdk) → powershell(sdk) → licencias → paquetes, con progreso', async () => {
  const calls: Call[] = [];
  const events: ProgressEvent[] = [];

  const res = await ensureAndroidToolchain(
    ['jdk', 'sdk'],
    (e) => events.push(e),
    undefined,
    {
      spawn: makeSpawn(calls, () => 0),
      platform: 'win32',
      env: ENV,
      ...fsDeps,
    },
  );

  assert.deepEqual(res, { ok: true });

  const lines = calls.map((c) => c.line);
  const idx = (needle: string) => lines.findIndex((l) => l.includes(needle));

  const iJdkDownload = idx('api.adoptium.net/v3/binary');
  const iSdkDownload = idx(CMDLINE_TOOLS_URL);
  const iLicenses = idx('sdkmanager.bat --licenses');
  const iPackages = idx('platform-tools');

  assert.ok(iJdkDownload >= 0, 'invoca descarga JDK');
  assert.ok(iSdkDownload >= 0, 'invoca descarga SDK');
  assert.ok(iLicenses >= 0, 'invoca sdkmanager --licenses');
  assert.ok(iPackages >= 0, 'invoca sdkmanager con los paquetes');

  // Orden correcto de la secuencia.
  assert.ok(
    iJdkDownload < iSdkDownload && iSdkDownload < iLicenses && iLicenses < iPackages,
    'orden descarga JDK→descarga SDK→licencias→paquetes',
  );

  // Las licencias reciben "y" por STDIN (pipe tipo `yes | sdkmanager`).
  assert.ok(calls[iLicenses].stdin.includes('y'), 'responde y a las licencias por stdin');

  // sdkmanager corre con JAVA_HOME apuntando al Temurin recien instalado.
  assert.equal(calls[iPackages].env?.JAVA_HOME, jdkHome, 'JAVA_HOME del Temurin instalado');

  // Progreso emitido por paso.
  const steps = events.map((e) => e.step ?? '');
  assert.ok(steps.some((s) => /JDK 17/i.test(s)), 'progreso instalando JDK');
  assert.ok(steps.some((s) => /Descargando Android SDK/i.test(s)), 'progreso descarga SDK');
  assert.ok(steps.some((s) => /licencias/i.test(s)), 'progreso licencias');
  assert.ok(steps.some((s) => /paquetes/i.test(s)), 'progreso paquetes');
});

test('6.3 fallo de powershell(jdk) → ok:false con instrucciones que incluyen los comandos exactos', async () => {
  const calls: Call[] = [];
  const res = await ensureAndroidToolchain(['jdk', 'sdk'], () => {}, undefined, {
    spawn: makeSpawn(calls, (line) => (line.includes('api.adoptium.net') ? 1 : 0)),
    platform: 'win32',
    env: ENV,
    ...fsDeps,
  });

  assert.equal(res.ok, false);
  assert.ok(res.instructions, 'incluye instrucciones');
  const txt = res.instructions!;
  // Comandos manuales exactos de todo lo pendiente (jdk + sdk).
  assert.ok(txt.includes('Invoke-WebRequest'), 'comando powershell');
  assert.ok(txt.includes(CMDLINE_TOOLS_URL), 'URL del zip de cmdline-tools');
  assert.ok(txt.includes('--licenses'), 'comando de licencias');
  assert.ok(txt.includes('platform-tools'), 'comando de paquetes');
  // Tras fallar la descarga del JDK, NO debe intentar descargar el SDK.
  assert.ok(!calls.some((c) => c.line.includes(CMDLINE_TOOLS_URL)), 'aborta antes del SDK');
});

test('6.2 solo sdk: no invoca powershell(jdk)', async () => {
  const calls: Call[] = [];
  const res = await ensureAndroidToolchain(['sdk'], () => {}, undefined, {
    spawn: makeSpawn(calls, () => 0),
    platform: 'win32',
    env: ENV,
    ...fsDeps,
  });
  assert.deepEqual(res, { ok: true });
  assert.ok(!calls.some((c) => c.line.includes('api.adoptium.net')), 'no instala JDK si no falta');
  assert.ok(calls.some((c) => c.line.includes('sdkmanager.bat --licenses')), 'instala SDK');
});
