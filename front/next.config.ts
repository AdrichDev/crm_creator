import type { NextConfig } from 'next';
import path from 'node:path';
import { resolveOutputMode } from './lib/next-output-mode';

// NEXT_OUTPUT_MODE conmuta la salida del build sin tocar el flujo de dev:
// 'standalone' (web zip) | 'export' (exe/apk) | undefined (dev, sin cambios).
const output = resolveOutputMode(process.env.NEXT_OUTPUT_MODE);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Directorio de build conmutable. Dos `next dev` sobre el mismo `.next` se pisan la
  // caché y corrompen el servidor que ya tenía levantado el usuario; con esto, un dev
  // efímero para e2e escribe en su propio directorio y no se entera nadie.
  //   NEXT_DIST_DIR=.next-e2e npx next dev -p 3101
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  outputFileTracingRoot: path.join(__dirname),
  ...(output ? { output } : {}),
  // El badge de dev de Next vive por defecto abajo-derecha, EXACTAMENTE donde
  // está el chip flotante de Telegram (telegram-widget.tsx) — se superponía y
  // interceptaba los clicks en desarrollo. Solo afecta a dev, no a producción.
  devIndicators: { position: 'bottom-left' },
};
export default nextConfig;
