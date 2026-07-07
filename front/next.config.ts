import type { NextConfig } from 'next';
import path from 'node:path';
import { resolveOutputMode } from './lib/next-output-mode';

// NEXT_OUTPUT_MODE conmuta la salida del build sin tocar el flujo de dev:
// 'standalone' (web zip) | 'export' (exe/apk) | undefined (dev, sin cambios).
const output = resolveOutputMode(process.env.NEXT_OUTPUT_MODE);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname),
  ...(output ? { output } : {}),
  // El badge de dev de Next vive por defecto abajo-derecha, EXACTAMENTE donde
  // está el chip flotante de Telegram (telegram-widget.tsx) — se superponía y
  // interceptaba los clicks en desarrollo. Solo afecta a dev, no a producción.
  devIndicators: { position: 'bottom-left' },
};
export default nextConfig;
