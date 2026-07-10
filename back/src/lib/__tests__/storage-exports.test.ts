/**
 * back/src/lib/__tests__/storage-exports.test.ts
 *
 * crm-generator-versiones-historico (WU2, tarea 2.3). Runner: node --import tsx --test
 * Estrategia: `ExportStorageApi` inyectado como fake (DI) — sin red, sin credenciales
 * reales de Supabase Storage.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  uploadExportArtifact,
  signExportUrl,
  exportArtifactPath,
  zipDirectoryToBuffer,
  EXPORT_ARTIFACTS_BUCKET,
  type ExportStorageApi,
} from '../storage-exports.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

describe('exportArtifactPath', () => {
  test('construye la key {businessId}/{versionId}.zip', () => {
    assert.equal(exportArtifactPath('biz-1', 'ver-1'), 'biz-1/ver-1.zip');
  });
});

describe('uploadExportArtifact', () => {
  test('sube al bucket con la key correcta y devuelve storagePath', async () => {
    let captured: { path: string; buffer: Buffer } | undefined;
    const fake: ExportStorageApi = {
      upload: async (p, buf) => {
        captured = { path: p, buffer: buf };
        return { error: null };
      },
      createSignedUrl: async () => ({ data: { signedUrl: 'unused' }, error: null }),
    };

    const buf = Buffer.from('zip-bytes');
    const result = await uploadExportArtifact('biz-1', 'ver-1', buf, fake);

    assert.equal(result.storagePath, 'biz-1/ver-1.zip');
    assert.equal(captured?.path, 'biz-1/ver-1.zip');
    assert.deepEqual(captured?.buffer, buf);
  });

  test('propaga error si la subida falla', async () => {
    const fake: ExportStorageApi = {
      upload: async () => ({ error: { message: 'bucket not found' } }),
      createSignedUrl: async () => ({ data: null, error: null }),
    };

    await assert.rejects(
      () => uploadExportArtifact('biz-1', 'ver-1', Buffer.from('x'), fake),
      /bucket not found/,
    );
  });
});

describe('signExportUrl', () => {
  test('devuelve {url} firmada', async () => {
    const fake: ExportStorageApi = {
      upload: async () => ({ error: null }),
      createSignedUrl: async (p) => ({
        data: { signedUrl: `https://signed.example/${p}` },
        error: null,
      }),
    };

    const { url } = await signExportUrl('biz-1/ver-1.zip', fake);
    assert.equal(url, 'https://signed.example/biz-1/ver-1.zip');
  });

  test('propaga error si storagePath no existe', async () => {
    const fake: ExportStorageApi = {
      upload: async () => ({ error: null }),
      createSignedUrl: async () => ({ data: null, error: { message: 'not found' } }),
    };

    await assert.rejects(() => signExportUrl('nope.zip', fake), /not found/);
  });
});

describe('EXPORT_ARTIFACTS_BUCKET', () => {
  test('es el bucket privado esperado', () => {
    assert.equal(EXPORT_ARTIFACTS_BUCKET, 'export-artifacts');
  });
});

describe('zipDirectoryToBuffer', () => {
  test('comprime un directorio a un Buffer ZIP no vacío', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-version-zip-'));
    try {
      fs.writeFileSync(path.join(dir, 'hello.txt'), 'hola mundo');
      fs.mkdirSync(path.join(dir, 'sub'));
      fs.writeFileSync(path.join(dir, 'sub', 'nested.txt'), 'anidado');

      const buf = await zipDirectoryToBuffer(dir);

      assert.ok(Buffer.isBuffer(buf));
      assert.ok(buf.length > 0);
      // Firma ZIP local file header: 'PK\x03\x04'.
      assert.equal(buf.subarray(0, 2).toString('latin1'), 'PK');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
