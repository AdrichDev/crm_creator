/**
 * back/src/lib/__tests__/export-keystore.test.ts
 *
 * Fase 5.2: ensureKeystore genera el keystore via keytool (spawn mockeado) si
 * falta y lo reutiliza (sin invocar keytool) si ya existe.
 * Runner: node --import tsx --test
 */

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ensureKeystore } from '../export-keystore.js';

const trash: string[] = [];
afterEach(() => {
  for (const d of trash.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

/**
 * spawn falso: registra las llamadas y, cuando se invoca keytool -genkeypair,
 * materializa el fichero keystore (como haria keytool de verdad).
 */
function makeSpawnFake(calls: string[][]) {
  return ((_cmd: string, args: string[]) => {
    calls.push(args);
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
      kill: () => void;
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {};
    // Emular la creacion del keystore por keytool.
    const ksIdx = args.indexOf('-keystore');
    if (ksIdx >= 0) fs.writeFileSync(args[ksIdx + 1], 'KEYSTORE-BYTES');
    setImmediate(() => child.emit('close', 0));
    return child;
  }) as unknown as typeof import('node:child_process').spawn;
}

test('5.2 keystore: genera via keytool si falta', async () => {
  const dir = path.join(os.tmpdir(), `ks-${randomUUID()}`);
  trash.push(dir);
  const calls: string[][] = [];

  const info = await ensureKeystore(undefined, {
    spawn: makeSpawnFake(calls),
    keystoreDir: dir,
    locateKeytool: () => 'keytool',
    genPassword: () => 'p4ssw0rd-fuerte',
  });

  // keytool -genkeypair invocado una vez.
  const genCall = calls.find((a) => a.includes('-genkeypair'));
  assert.ok(genCall, 'debe invocar keytool -genkeypair');
  assert.ok(genCall!.includes('-keystore'));

  assert.equal(info.alias, 'operaos-release');
  assert.equal(info.storePassword, 'p4ssw0rd-fuerte');
  assert.equal(info.keyPassword, 'p4ssw0rd-fuerte');
  assert.ok(fs.existsSync(info.keystorePath), 'keystore materializado');
  assert.ok(
    fs.existsSync(path.join(dir, 'export-release.json')),
    'metadatos persistidos',
  );
});

test('5.2 keystore: reutiliza el existente sin invocar keytool', async () => {
  const dir = path.join(os.tmpdir(), `ks-${randomUUID()}`);
  trash.push(dir);

  // Primera llamada: genera.
  const first: string[][] = [];
  const info1 = await ensureKeystore(undefined, {
    spawn: makeSpawnFake(first),
    keystoreDir: dir,
    locateKeytool: () => 'keytool',
    genPassword: () => 'primera-pass',
  });

  // Segunda llamada: debe reutilizar (0 llamadas a spawn).
  const second: string[][] = [];
  const info2 = await ensureKeystore(undefined, {
    spawn: makeSpawnFake(second),
    keystoreDir: dir,
    locateKeytool: () => 'keytool',
    genPassword: () => 'segunda-pass-ignorada',
  });

  assert.equal(second.length, 0, 'no debe invocar keytool al reutilizar');
  assert.equal(info2.storePassword, info1.storePassword, 'reutiliza la pass persistida');
  assert.equal(info2.storePassword, 'primera-pass');
});
