import type { CapacitorConfig } from '@capacitor/cli';

// Config base de Capacitor. appId/appName son valores por defecto; el builder
// de exportacion (back/src/lib/export-builders/apk.ts) los reescribe por tenant
// sobre la copia temporal antes de `cap sync`. webDir apunta a la salida
// estatica de Next (`out/`, generada con NEXT_OUTPUT_MODE=export).
const config: CapacitorConfig = {
  appId: 'com.operaos.app',
  appName: 'OperaOS',
  webDir: 'out',
};

export default config;
