import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LocalLandingStore } from '@/lib/landing/store';

let root: string;
let store: LocalLandingStore;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'landing-store-test-'));
  store = new LocalLandingStore(root);
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe('UC-2 · LocalLandingStore · ciclo put/get/remove', () => {
  it('almacena y recupera assets por su ruta segura', async () => {
    const res = await store.put('proj1', [
      { path: 'index.html', bytes: Buffer.from('<h1>hola</h1>') },
      { path: 'css/main.css', bytes: Buffer.from('body{}') },
    ]);
    expect(res.count).toBe(2);
    expect(res.ref).toBe('local:proj1');

    const idx = await store.get('proj1', 'index.html');
    expect(idx?.bytes.toString()).toBe('<h1>hola</h1>');
    const css = await store.get('proj1', 'css/main.css');
    expect(css?.bytes.toString()).toBe('body{}');
  });

  it('get devuelve null para asset inexistente', async () => {
    await store.put('proj1', [{ path: 'index.html', bytes: Buffer.from('x') }]);
    expect(await store.get('proj1', 'no-existe.js')).toBeNull();
  });

  it('put reemplaza el bundle anterior (idempotente)', async () => {
    await store.put('proj1', [{ path: 'old.html', bytes: Buffer.from('1') }]);
    await store.put('proj1', [{ path: 'index.html', bytes: Buffer.from('2') }]);
    expect(await store.get('proj1', 'old.html')).toBeNull(); // borrado en el reemplazo
    expect((await store.get('proj1', 'index.html'))?.bytes.toString()).toBe('2');
  });

  it('remove elimina por completo el bundle (reversibilidad estructural)', async () => {
    await store.put('proj1', [{ path: 'index.html', bytes: Buffer.from('x') }]);
    await store.remove('proj1');
    expect(await store.get('proj1', 'index.html')).toBeNull();
  });
});

describe('UC-2 · LocalLandingStore · defensa en profundidad', () => {
  it('get con path traversal NO escapa del directorio (devuelve null)', async () => {
    await store.put('proj1', [{ path: 'index.html', bytes: Buffer.from('x') }]);
    // Intento leer fuera del proyecto vía traversal.
    expect(await store.get('proj1', '../../etc/passwd')).toBeNull();
    expect(await store.get('proj1', '../proj1/index.html')).toBeNull();
  });

  it('put con projectId malicioso lanza (no escapa del root)', async () => {
    await expect(
      store.put('../evil', [{ path: 'index.html', bytes: Buffer.from('x') }]),
    ).rejects.toThrow();
    await expect(
      store.put('a/b', [{ path: 'index.html', bytes: Buffer.from('x') }]),
    ).rejects.toThrow();
  });

  it('un asset traversal en put no escribe fuera del proyecto', async () => {
    await expect(
      store.put('proj1', [{ path: '../escape.html', bytes: Buffer.from('x') }]),
    ).rejects.toThrow();
    // El fichero NO debe existir fuera del directorio del proyecto.
    await expect(fs.access(path.join(root, 'escape.html'))).rejects.toThrow();
  });
});
