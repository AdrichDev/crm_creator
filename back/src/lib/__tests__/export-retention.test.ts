/**
 * back/src/lib/__tests__/export-retention.test.ts
 *
 * security-wave-2 / T5 (S3): los artefactos de export caducan. Pasada la
 * retencion (`EXPORT_RETENTION_DAYS`, 7 por defecto) el ZIP se borra; nada
 * fuera del directorio de exports se toca JAMAS (contencion de rutas).
 */

import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  EXPORT_RETENTION_DAYS,
  isInsideExportRoot,
  pruneOldExports,
  startExportRetention,
} from '../export-retention.js';

const trash: string[] = [];

afterEach(() => {
  for (const d of trash.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function tmpRoot(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  trash.push(dir);
  return dir;
}

function writeArtifact(root: string, rel: string, ageDays: number): string {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, 'PK\u0003\u0004 zip');
  const when = new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000);
  fs.utimesSync(full, when, when);
  return full;
}

describe('pruneOldExports (S3)', () => {
  test('la retencion por defecto es de 7 dias', () => {
    assert.equal(EXPORT_RETENTION_DAYS, 7);
  });

  test('borra solo los artefactos mas viejos que la retencion', () => {
    const exportsDir = tmpRoot('retention-');
    const old = writeArtifact(exportsDir, 'tenant-a/tenant-a-web-src.zip', 10);
    const nestedOld = writeArtifact(exportsDir, 'tenant-b/deep/tenant-b-exe.zip', 30);
    const fresh = writeArtifact(exportsDir, 'tenant-a/tenant-a-apk.zip', 1);
    const edge = writeArtifact(exportsDir, 'tenant-c/edge.zip', 6);

    const deleted = pruneOldExports(exportsDir, { now: new Date() });

    assert.deepEqual(deleted.sort(), [nestedOld, old].sort());
    assert.equal(fs.existsSync(old), false, 'artefacto viejo borrado');
    assert.equal(fs.existsSync(nestedOld), false, 'artefacto viejo anidado borrado');
    assert.equal(fs.existsSync(fresh), true, 'artefacto reciente conservado');
    assert.equal(fs.existsSync(edge), true, 'artefacto dentro de la retencion conservado');
  });

  test('respeta un EXPORT_RETENTION_DAYS inyectado (no solo el default)', () => {
    const exportsDir = tmpRoot('retention-days-');
    const twoDays = writeArtifact(exportsDir, 'a.zip', 2);
    const halfDay = writeArtifact(exportsDir, 'b.zip', 0.5);

    const deleted = pruneOldExports(exportsDir, { retentionDays: 1, now: new Date() });
    assert.deepEqual(deleted, [twoDays]);
    assert.equal(fs.existsSync(halfDay), true);
  });

  test('nunca borra nada fuera del directorio de exports', () => {
    const base = tmpRoot('retention-outside-');
    const exportsDir = path.join(base, 'exports');
    fs.mkdirSync(exportsDir, { recursive: true });
    const outside = writeArtifact(base, 'otro/importante.zip', 60);
    writeArtifact(exportsDir, 'dentro.zip', 60);

    pruneOldExports(exportsDir, { now: new Date() });

    assert.equal(fs.existsSync(outside), true, 'un fichero fuera de exports/ no se toca');
    assert.equal(fs.existsSync(path.join(exportsDir, 'dentro.zip')), false);
  });

  test('un directorio de exports inexistente no lanza ni devuelve nada', () => {
    const exportsDir = path.join(tmpRoot('retention-missing-'), 'no-existe');
    assert.deepEqual(pruneOldExports(exportsDir, { now: new Date() }), []);
  });

  test('isInsideExportRoot rechaza rutas hermanas, con .. y la propia raiz', () => {
    const root = path.resolve(os.tmpdir(), 'exports-root');
    assert.equal(isInsideExportRoot(root, path.join(root, 'a', 'b.zip')), true);
    assert.equal(isInsideExportRoot(root, path.join(root, '..', 'fuera.zip')), false);
    assert.equal(isInsideExportRoot(root, path.resolve(os.tmpdir(), 'otro', 'fuera.zip')), false);
    assert.equal(isInsideExportRoot(root, root), false);
  });
});

describe('startExportRetention (S3)', () => {
  test('ejecuta una pasada al arrancar y se puede parar', () => {
    let calls = 0;
    const stop = startExportRetention({
      exportsDir: tmpRoot('retention-start-'),
      intervalMs: 60 * 60 * 1000,
      prune: () => {
        calls += 1;
        return [];
      },
    });
    try {
      assert.equal(calls, 1, 'la pasada de arranque es inmediata');
    } finally {
      stop();
    }
  });
});
