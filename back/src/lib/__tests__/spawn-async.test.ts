/**
 * back/src/lib/__tests__/spawn-async.test.ts
 *
 * Tests del spawn compartido (D10): envoltura `cmd.exe /d /s /c` en Windows
 * con quoting correcto (regresion gate 4.V: rutas/args con espacios), captura
 * de stdout/stderr, onData y resolucion con exitCode.
 * Runner: node --import tsx --test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  spawnAsync,
  needsCmd,
  quoteWindowsArg,
  buildWindowsCommandLine,
  wrapWindowsCommandLine,
} from '../spawn-async.js';

/** Fake child con stdout/stderr controlables. */
function fakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: (sig?: string) => void;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => {};
  return child;
}

test('needsCmd: .cmd/.bat y herramientas conocidas requieren cmd /c', () => {
  assert.equal(needsCmd('gradlew.bat'), true);
  assert.equal(needsCmd('foo.cmd'), true);
  assert.equal(needsCmd('npm'), true);
  assert.equal(needsCmd('npx'), true);
  assert.equal(needsCmd('electron-builder'), true);
  assert.equal(needsCmd('C\\path\\to\\node_modules\\.bin\\electron-builder'), true);
  assert.equal(needsCmd('node'), false);
  assert.equal(needsCmd('java'), false);
});

// ── quoteWindowsArg / buildWindowsCommandLine (regresion gate 4.V) ─────────

test('quoteWindowsArg: deja intactas las piezas sin espacios/comillas', () => {
  assert.equal(quoteWindowsArg('--win'), '--win');
  assert.equal(quoteWindowsArg('portable'), 'portable');
  assert.equal(quoteWindowsArg('npx'), 'npx');
});

test('quoteWindowsArg: entrecomilla piezas con espacios', () => {
  assert.equal(quoteWindowsArg('EDM San Blas'), '"EDM San Blas"');
  assert.equal(
    quoteWindowsArg('-c.productName=EDM San Blas'),
    '"-c.productName=EDM San Blas"',
  );
  assert.equal(
    quoteWindowsArg('D:\\Adrian\\22. Proyectos\\front'),
    '"D:\\Adrian\\22. Proyectos\\front"',
  );
});

test('quoteWindowsArg: escapa comillas internas y backslashes finales (regla CRT)', () => {
  assert.equal(quoteWindowsArg('foo "bar"'), '"foo \\"bar\\""');
  assert.equal(quoteWindowsArg(''), '""');
});

test('buildWindowsCommandLine: entrecomilla ejecutable y args por igual, une con espacio', () => {
  const line = buildWindowsCommandLine(
    'D:\\Adrian\\22. Proyectos\\front\\node_modules\\.bin\\electron-builder',
    ['--win', 'portable', 'nsis', '-c.productName=EDM San Blas'],
  );
  assert.equal(
    line,
    '"D:\\Adrian\\22. Proyectos\\front\\node_modules\\.bin\\electron-builder"'
      + ' --win portable nsis "-c.productName=EDM San Blas"',
  );
});

test('wrapWindowsCommandLine: añade un par extra de comillas exteriores (patron shell:true de Node)', () => {
  const wrapped = wrapWindowsCommandLine('npm', ['ci']);
  assert.equal(wrapped, '"npm ci"');
});

test('win32: envuelve via cmd.exe /d /s /c con la linea entrecomillada y windowsVerbatimArguments', async () => {
  let capturedCmd = '';
  let capturedArgs: string[] = [];
  let capturedEnv: NodeJS.ProcessEnv | undefined;
  let capturedVerbatim: boolean | undefined;
  const child = fakeChild();

  const spawnFake = ((
    cmd: string,
    args: string[],
    opts: { env?: NodeJS.ProcessEnv; windowsVerbatimArguments?: boolean },
  ) => {
    capturedCmd = cmd;
    capturedArgs = args;
    capturedEnv = opts?.env;
    capturedVerbatim = opts?.windowsVerbatimArguments;
    setImmediate(() => child.emit('close', 0));
    return child;
  }) as unknown as typeof import('node:child_process').spawn;

  const res = await spawnAsync('npx', ['next', 'build'], {
    platform: 'win32',
    spawn: spawnFake,
    env: { ...process.env, NEXT_OUTPUT_MODE: 'export' },
  });

  assert.equal(capturedCmd, 'cmd.exe');
  assert.deepEqual(capturedArgs, ['/d', '/s', '/c', '"npx next build"']);
  assert.equal(capturedVerbatim, true);
  assert.equal(capturedEnv?.NEXT_OUTPUT_MODE, 'export');
  assert.equal(res.exitCode, 0);
});

test('win32: repo/ejecutable con espacios y productName con espacios llegan como UN argumento', async () => {
  let capturedArgs: string[] = [];
  const child = fakeChild();

  const spawnFake = ((_cmd: string, args: string[]) => {
    capturedArgs = args;
    setImmediate(() => child.emit('close', 0));
    return child;
  }) as unknown as typeof import('node:child_process').spawn;

  const ebPath = 'D:\\Adrian\\22. Proyectos\\3A_Estudio\\front\\node_modules\\.bin\\electron-builder';
  await spawnAsync(ebPath, ['--win', 'portable', 'nsis', '-c.productName=EDM San Blas'], {
    platform: 'win32',
    spawn: spawnFake,
  });

  const fullCmd = capturedArgs[3];
  assert.ok(fullCmd.includes(`"${ebPath}"`), 'el ejecutable con espacios va entrecomillado');
  assert.ok(
    fullCmd.includes('"-c.productName=EDM San Blas"'),
    'el productName con espacios va entrecomillado como un solo token',
  );
});

test('non-win: NO envuelve, ejecuta el comando directo', async () => {
  let capturedCmd = '';
  let capturedArgs: string[] = [];
  const child = fakeChild();

  const spawnFake = ((cmd: string, args: string[]) => {
    capturedCmd = cmd;
    capturedArgs = args;
    setImmediate(() => child.emit('close', 0));
    return child;
  }) as unknown as typeof import('node:child_process').spawn;

  await spawnAsync('npm', ['ci'], { platform: 'linux', spawn: spawnFake });

  assert.equal(capturedCmd, 'npm');
  assert.deepEqual(capturedArgs, ['ci']);
});

test('captura stdout/stderr, invoca onData y resuelve con exitCode', async () => {
  const child = fakeChild();
  const spawnFake = (() => {
    setImmediate(() => {
      child.stdout.emit('data', Buffer.from('linea-1\n'));
      child.stderr.emit('data', Buffer.from('warn'));
      child.emit('close', 3);
    });
    return child;
  }) as unknown as typeof import('node:child_process').spawn;

  const chunks: string[] = [];
  const res = await spawnAsync('node', ['-e', ''], {
    platform: 'linux',
    spawn: spawnFake,
    onData: (c) => chunks.push(c),
  });

  assert.equal(res.exitCode, 3);
  assert.equal(res.stdout, 'linea-1\n');
  assert.equal(res.stderr, 'warn');
  assert.deepEqual(chunks, ['linea-1\n']);
});

test('AbortSignal: exitCode 1 y kill invocado al abortar', async () => {
  const child = fakeChild();
  let killed = false;
  child.kill = () => { killed = true; };

  const controller = new AbortController();
  const spawnFake = (() => {
    // No cierra por si mismo; el abort dispara kill y luego cerramos.
    setImmediate(() => {
      controller.abort();
      setImmediate(() => child.emit('close', null));
    });
    return child;
  }) as unknown as typeof import('node:child_process').spawn;

  const res = await spawnAsync('node', [], {
    platform: 'linux',
    spawn: spawnFake,
    signal: controller.signal,
  });

  assert.equal(killed, true);
  assert.equal(res.exitCode, 1);
});

// ── Round-trip real con cmd.exe (regresion directa del bug del gate 4.V) ───
// Solo aplica en win32: crea un .cmd de fixture en un directorio CON espacio
// en el nombre (simula "D:\Adrian\22. Proyectos\...") que reenvia sus
// argumentos (%*) a un script node que vuelca process.argv a un fichero. Si
// el quoting fuera incorrecto, cmd.exe fallaria al reconocer el comando o los
// argumentos con espacios llegarian troceados/perdidos.
test(
  'round-trip real win32: ejecutable y args con espacios sobreviven cmd.exe /d /s /c',
  { skip: process.platform !== 'win32' ? 'solo aplica en win32' : false },
  async () => {
    const dir = path.join(os.tmpdir(), `spawn test ${randomUUID()}`);
    fs.mkdirSync(dir, { recursive: true });
    try {
      const printArgvPath = path.join(dir, 'print-argv.cjs');
      fs.writeFileSync(
        printArgvPath,
        "const fs=require('fs');fs.writeFileSync(process.argv[2], JSON.stringify(process.argv.slice(3)));",
      );
      const outPath = path.join(dir, 'out.json');
      const cmdPath = path.join(dir, 'echo-args.cmd');
      fs.writeFileSync(
        cmdPath,
        `@echo off\r\nnode "${printArgvPath}" "${outPath}" %*\r\n`,
      );

      const expectedArgs = [
        'arg con espacios',
        'EDM San Blas',
        'sin-espacios',
        '-c.productName=EDM San Blas',
      ];

      const res = await spawnAsync(cmdPath, expectedArgs);

      assert.equal(res.exitCode, 0, `stderr inesperado: ${res.stderr}`);
      const written = JSON.parse(fs.readFileSync(outPath, 'utf8'));
      assert.deepEqual(written, expectedArgs);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
);
