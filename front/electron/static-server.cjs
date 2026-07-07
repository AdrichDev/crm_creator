// front/electron/static-server.cjs
//
// Servidor HTTP estatico embebido para servir la exportacion de Next (out/)
// dentro de Electron.
//
// Por que no `loadFile` directo: la exportacion estatica usa rutas absolutas
// para sus assets (`/_next/...`) y hace redirects de cliente (p.ej. `/` ->
// `/panel`). Bajo el protocolo `file://` las rutas absolutas resuelven contra
// la raiz del disco (no contra `out/`) y `/panel` no existe como fichero real
// -> pantalla en blanco. Sirviendolo con `http://127.0.0.1:<puerto>` estas
// rutas funcionan exactamente igual que en un hosting estatico normal.
//
// CERO dependencias nuevas: solo modulos nativos de Node (http/fs/path).
// Modulo puro (sin `require('electron')`) para poder testearlo sin montar
// un proceso Electron real.

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

/** Tipos MIME basicos por extension (los que sirve una exportacion de Next). */
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/** Devuelve el Content-Type por extension (fallback: octet-stream). */
function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

/** true si `p` existe y es un fichero regular. */
function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * Resuelve una URL a un fichero dentro de `rootDir`, replicando el
 * comportamiento de un hosting estatico para una exportacion de Next:
 *
 *   1. fichero exacto           (rootDir + urlPath)
 *   2. `<ruta>.html`
 *   3. `<ruta>/index.html`
 *   4. fallback SPA: `404.html` si existe, si no `index.html` — necesario
 *      para que rutas de cliente sin fichero real (p.ej. `/panel` tras el
 *      redirect de la raiz) no mueran en silencio.
 *
 * Devuelve `null` si ni siquiera el fallback existe, o si la ruta pedida
 * intenta escapar de `rootDir` (path traversal) — la comprobacion se hace
 * contra la ruta YA resuelta, no contra el string crudo, para que sea
 * robusta ante cualquier combinacion de `..`/barras.
 */
function resolveStaticPath(rootDir, urlPath) {
  const rootResolved = path.resolve(rootDir);

  let decoded;
  try {
    decoded = decodeURIComponent(String(urlPath).split('?')[0].split('#')[0]);
  } catch {
    return null; // %-secuencia invalida en la URL.
  }

  const relative = decoded.replace(/^[/\\]+/, '');
  const candidateResolved = path.resolve(rootResolved, relative);

  const withinRoot =
    candidateResolved === rootResolved ||
    candidateResolved.startsWith(rootResolved + path.sep);

  // Path traversal: NUNCA se sirve el fichero fuera de rootDir. Se ignoran
  // los pasos 1-3 y se cae directo al fallback SPA (igual que una ruta que
  // simplemente no existe), en vez de devolver null y filtrar informacion
  // sobre la existencia del fichero externo.
  if (withinRoot) {
    if (isFile(candidateResolved)) return candidateResolved;

    const asHtml = `${candidateResolved}.html`;
    if (isFile(asHtml)) return asHtml;

    const asIndex = path.join(candidateResolved, 'index.html');
    if (isFile(asIndex)) return asIndex;
  }

  const notFoundPage = path.join(rootResolved, '404.html');
  if (isFile(notFoundPage)) return notFoundPage;

  const rootIndex = path.join(rootResolved, 'index.html');
  if (isFile(rootIndex)) return rootIndex;

  return null;
}

/** Crea (sin arrancar) un servidor http que sirve `rootDir` con la resolucion de arriba. */
function createStaticServer(rootDir) {
  return http.createServer((req, res) => {
    const filePath = resolveStaticPath(rootDir, req.url || '/');
    if (!filePath) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': getContentType(filePath) });
    fs.createReadStream(filePath).pipe(res);
  });
}

module.exports = { resolveStaticPath, getContentType, createStaticServer };
