// @vitest-environment node
/**
 * front/tests/electron-static-server.test.ts
 *
 * Tests del servidor estatico embebido de Electron (front/electron/static-server.cjs):
 * resolucion de rutas (exacto / .html / index.html / fallback SPA), proteccion
 * contra path traversal y content-type basico. NO monta Electron (modulo puro).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import http from 'node:http';

const require = createRequire(import.meta.url);
const {
  resolveStaticPath,
  getContentType,
  createStaticServer,
} = require('../electron/static-server.cjs') as {
  resolveStaticPath: (root: string, url: string) => string | null;
  getContentType: (filePath: string) => string;
  createStaticServer: (root: string) => http.Server;
};

const trash: string[] = [];
afterEach(() => {
  for (const dir of trash.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** Crea una carpeta `out/` sintetica con la forma tipica de una export de Next. */
function makeFixtureOut(): string {
  const root = path.join(os.tmpdir(), `out-fixture-${randomUUID()}`);
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'index.html'), '<html>home</html>');
  fs.writeFileSync(path.join(root, '404.html'), '<html>404</html>');
  fs.writeFileSync(path.join(root, 'panel.html'), '<html>panel</html>');
  fs.mkdirSync(path.join(root, 'nested'), { recursive: true });
  fs.writeFileSync(path.join(root, 'nested', 'index.html'), '<html>nested</html>');
  fs.mkdirSync(path.join(root, '_next', 'static', 'chunks'), { recursive: true });
  fs.writeFileSync(path.join(root, '_next', 'static', 'chunks', 'main.js'), '// js');
  return root;
}

describe('resolveStaticPath', () => {
  it('sirve index.html en la raiz', () => {
    const root = makeFixtureOut();
    trash.push(root);
    const hit = resolveStaticPath(root, '/');
    expect(hit).toBe(path.join(root, 'index.html'));
  });

  it('resuelve fichero exacto (assets con ruta absoluta /_next/...)', () => {
    const root = makeFixtureOut();
    trash.push(root);
    const hit = resolveStaticPath(root, '/_next/static/chunks/main.js');
    expect(hit).toBe(path.join(root, '_next', 'static', 'chunks', 'main.js'));
  });

  it('resuelve <ruta>.html cuando no hay fichero exacto', () => {
    const root = makeFixtureOut();
    trash.push(root);
    const hit = resolveStaticPath(root, '/panel');
    expect(hit).toBe(path.join(root, 'panel.html'));
  });

  it('resuelve <ruta>/index.html para carpetas', () => {
    const root = makeFixtureOut();
    trash.push(root);
    const hit = resolveStaticPath(root, '/nested');
    expect(hit).toBe(path.join(root, 'nested', 'index.html'));
  });

  it('ignora query string y hash', () => {
    const root = makeFixtureOut();
    trash.push(root);
    const hit = resolveStaticPath(root, '/panel?foo=bar#section');
    expect(hit).toBe(path.join(root, 'panel.html'));
  });

  it('fallback SPA: ruta inexistente devuelve 404.html si existe', () => {
    const root = makeFixtureOut();
    trash.push(root);
    const hit = resolveStaticPath(root, '/ruta-que-no-existe');
    expect(hit).toBe(path.join(root, '404.html'));
  });

  it('fallback SPA: sin 404.html cae a index.html', () => {
    const root = makeFixtureOut();
    trash.push(root);
    fs.rmSync(path.join(root, '404.html'));
    const hit = resolveStaticPath(root, '/ruta-que-no-existe');
    expect(hit).toBe(path.join(root, 'index.html'));
  });

  it('bloquea path traversal (../../../etc/passwd)', () => {
    const root = makeFixtureOut();
    trash.push(root);
    // Fichero real fuera de root para probar que NO se sirve.
    const secretDir = path.join(os.tmpdir(), `secret-${randomUUID()}`);
    fs.mkdirSync(secretDir, { recursive: true });
    trash.push(secretDir);
    fs.writeFileSync(path.join(secretDir, 'secret.txt'), 'top secret');

    const relativeUp = path.relative(root, path.join(secretDir, 'secret.txt'));
    const hit = resolveStaticPath(root, `/${relativeUp.replace(/\\/g, '/')}`);
    // Debe caer al fallback SPA (404/index), nunca al fichero externo.
    expect(hit).not.toBe(path.join(secretDir, 'secret.txt'));
    expect(hit).toBe(path.join(root, '404.html'));
  });

  it('bloquea %2e%2e URL-encoded (cae al fallback SPA)', () => {
    const root = makeFixtureOut();
    trash.push(root);
    const hit = resolveStaticPath(root, '/%2e%2e/%2e%2e/etc/passwd');
    expect(hit).toBe(path.join(root, '404.html'));
  });

  it('devuelve null si %-secuencia invalida en la URL', () => {
    const root = makeFixtureOut();
    trash.push(root);
    expect(resolveStaticPath(root, '/%')).toBeNull();
  });
});

describe('getContentType', () => {
  it('resuelve mime basico por extension', () => {
    expect(getContentType('a.html')).toContain('text/html');
    expect(getContentType('a.js')).toContain('javascript');
    expect(getContentType('a.css')).toContain('text/css');
    expect(getContentType('a.json')).toContain('application/json');
    expect(getContentType('a.png')).toBe('image/png');
    expect(getContentType('a.svg')).toContain('svg');
    expect(getContentType('a.woff2')).toContain('font');
    expect(getContentType('a.ico')).toContain('image');
  });

  it('cae a octet-stream para extensiones desconocidas', () => {
    expect(getContentType('a.weird')).toBe('application/octet-stream');
  });
});

describe('createStaticServer (integracion http real)', () => {
  it('sirve index.html en / y panel.html en /panel via HTTP real', async () => {
    const root = makeFixtureOut();
    trash.push(root);
    const server = createStaticServer(root);

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('sin puerto asignado');
    const base = `http://127.0.0.1:${address.port}`;

    try {
      const home = await fetch(`${base}/`);
      expect(home.status).toBe(200);
      expect(await home.text()).toContain('home');

      const panel = await fetch(`${base}/panel`);
      expect(panel.status).toBe(200);
      expect(await panel.text()).toContain('panel');

      const missing = await fetch(`${base}/does-not-exist-at-all`);
      // Cae al fallback SPA (404.html), sigue siendo 200 a nivel HTTP.
      expect(missing.status).toBe(200);
      expect(await missing.text()).toContain('404');
    } finally {
      server.close();
    }
  });
});
