// front/electron/main.cjs
//
// Proceso principal de Electron para la app de escritorio del tenant.
//
// La SPA estatica generada por `next build` (output:'export', out/) NO se
// carga con `loadFile`: sus assets usan rutas absolutas (`/_next/...`) que
// bajo `file://` resuelven contra la raiz del disco, y la raiz hace un
// redirect de cliente a `/panel` (fichero inexistente) -> pantalla en blanco.
// En su lugar se levanta un servidor HTTP embebido (ver static-server.cjs,
// sin dependencias nuevas) en 127.0.0.1 con puerto efimero y se carga esa URL,
// exactamente como en un hosting estatico normal.

const { app, BrowserWindow, Menu } = require('electron');
const path = require('node:path');
const { createStaticServer } = require('./static-server.cjs');

// En produccion se oculta el menu por defecto (File/Edit/View...). En dev se
// mantiene para poder abrir las DevTools comodamente.
const isDev = !app.isPackaged;

/**
 * Ruta absoluta a la carpeta out/ (exportacion estatica de Next).
 * `app.getAppPath()` resuelve tanto en dev (raiz de front/, cwd de `electron .`)
 * como empaquetado (raiz del asar/resources, donde electron-builder.yml ya
 * incluye `out/**` junto a `electron/**`).
 */
function outDir() {
  return path.join(app.getAppPath(), 'out');
}

/** Servidor HTTP embebido activo (una sola instancia por ciclo de vida de la app). */
let server;

/** Arranca el servidor estatico en un puerto efimero y devuelve su URL base. */
function startStaticServer() {
  return new Promise((resolve, reject) => {
    const s = createStaticServer(outDir());
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      resolve({ server: s, url: `http://127.0.0.1:${port}` });
    });
  });
}

function createWindow(baseUrl) {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (!isDev) Menu.setApplicationMenu(null);

  win.once('ready-to-show', () => win.show());

  void win.loadURL(baseUrl);
}

/** Cierra el servidor embebido (idempotente). */
function shutdownServer() {
  if (server) {
    server.close();
    server = undefined;
  }
}

app.whenReady().then(async () => {
  const started = await startStaticServer();
  server = started.server;

  createWindow(started.url);

  // macOS: recrea la ventana al reactivar si no queda ninguna (reutiliza el
  // mismo servidor, ya arrancado).
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(started.url);
  });
});

// En Windows/Linux se cierra la app al cerrar todas las ventanas.
app.on('window-all-closed', () => {
  shutdownServer();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', shutdownServer);
