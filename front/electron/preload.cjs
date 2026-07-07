// front/electron/preload.cjs
//
// Preload minimo: con contextIsolation activo NO se expone ninguna API al
// renderer. La app es una SPA estatica autocontenida y no necesita puente IPC.
// Se mantiene el fichero para poder anadir un `contextBridge` en el futuro sin
// tocar la configuracion de la ventana.

'use strict';

// Intencionadamente vacio (sin superficie de ataque hacia el renderer).
