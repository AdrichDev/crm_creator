import type { NextConfig } from 'next';
import path from 'node:path';
const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname),
  // El badge de dev de Next vive por defecto abajo-derecha, EXACTAMENTE donde
  // está el chip flotante de Telegram (telegram-widget.tsx) — se superponía y
  // interceptaba los clicks en desarrollo. Solo afecta a dev, no a producción.
  devIndicators: { position: 'bottom-left' },
};
export default nextConfig;
