/**
 * back/src/lib/export-builders/manifest-allowlist.ts
 *
 * Manifiestos allowlist por formato de exportacion (web/android/ios/desktop)
 * + escritor unico de `.env.local`/`.env.example` para el pipeline de export.
 *
 * Decision (design.md #1, aprobada por product owner): CUATRO listas
 * independientes, literales y sin constante compartida. La redundancia
 * textual es deliberada: el precio de repetir ~15 entradas se paga a cambio
 * de que cada manifiesto sea auditable de un vistazo, sin resolver sumas
 * mentales (nucleo + excepciones por formato). El guardian anti-drift vive
 * en `export-manifest-snapshot.test.ts` (WU1.3): un archivo "core" anadido a
 * una lista y olvidado en las otras tres rompe el snapshot del formato
 * afectado.
 *
 * Nota: `.env.local` esta listado en las 4 allowlists (no solo
 * `.env.example`) porque `writeFreshEnvLocal` lo escribe SIEMPRE antes del
 * ensamblado y la app exportada necesita `NEXT_PUBLIC_TENANT_JSON` horneado
 * para arrancar (`BAKED_TENANT_CONFIG`, ver front). Sin la entrada en el
 * allowlist, el propio filtro descartaria el archivo recien escrito.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { TenantConfig } from '../../../../shared/generate/tenant-types.js';

// ---------------------------------------------------------------------------
// Allowlists por formato (design.md #1)
// ---------------------------------------------------------------------------

/** Web (SaaS puro): sin capacitor/android/electron. */
export const WEB_ALLOWLIST: string[] = [
  'app',
  'components',
  'lib',
  'public',
  'package.json',
  'package-lock.json',
  'next.config.ts',
  'next.config.mjs',
  'next.config.js',
  'tsconfig.json',
  'next-env.d.ts',
  'tailwind.config.ts',
  'postcss.config.mjs',
  // `.npmrc` con `legacy-peer-deps=true`: sin él, `npm install` del artefacto rompe por
  // el conflicto React 19 ↔ @emoji-mart/react (peerDep React ≤18).
  '.npmrc',
  '.env.local',
  '.env.example',
  'README.md',
];

/** Android (APK): web + capacitor + android/, sin electron. */
export const ANDROID_ALLOWLIST: string[] = [
  'app',
  'components',
  'lib',
  'public',
  'package.json',
  'package-lock.json',
  'next.config.ts',
  'next.config.mjs',
  'next.config.js',
  'tsconfig.json',
  'next-env.d.ts',
  'tailwind.config.ts',
  'postcss.config.mjs',
  // `.npmrc` (legacy-peer-deps=true): imprescindible para que `npm install` del artefacto
  // no rompa por el conflicto React 19 ↔ @emoji-mart/react.
  '.npmrc',
  '.env.local',
  '.env.example',
  'README.md',
  'capacitor.config.ts',
  'android',
];

/** iOS (.ipa): web + capacitor, SIN 'android' (se genera en Mac con `cap add ios`). */
export const IOS_ALLOWLIST: string[] = [
  'app',
  'components',
  'lib',
  'public',
  'package.json',
  'package-lock.json',
  'next.config.ts',
  'next.config.mjs',
  'next.config.js',
  'tsconfig.json',
  'next-env.d.ts',
  'tailwind.config.ts',
  'postcss.config.mjs',
  // `.npmrc` (legacy-peer-deps=true): imprescindible para que `npm install` del artefacto
  // no rompa por el conflicto React 19 ↔ @emoji-mart/react.
  '.npmrc',
  '.env.local',
  '.env.example',
  'README.md',
  'capacitor.config.ts',
];

/**
 * Escritorio (.exe): web + electron, SIN 'android'. `build/icon.png` NO se
 * declara aqui como carpeta ('build' queda fuera a proposito, ver bug en
 * proposal.md) — se permite como archivo puntual via el parametro
 * `extraFiles` de `allowlistFilter`, para no abrir toda la carpeta `build/`.
 */
export const DESKTOP_ALLOWLIST: string[] = [
  'app',
  'components',
  'lib',
  'public',
  'package.json',
  'package-lock.json',
  'next.config.ts',
  'next.config.mjs',
  'next.config.js',
  'tsconfig.json',
  'next-env.d.ts',
  'tailwind.config.ts',
  'postcss.config.mjs',
  // `.npmrc` (legacy-peer-deps=true): imprescindible para que `npm install` del artefacto
  // no rompa por el conflicto React 19 ↔ @emoji-mart/react.
  '.npmrc',
  '.env.local',
  '.env.example',
  'README.md',
  'electron',
  'electron-builder.yml',
];

// ---------------------------------------------------------------------------
// Filtro de ensamblado (usado por `archive.directory(..., filterFn)`)
// ---------------------------------------------------------------------------

interface EntryLike {
  name: string;
}

/**
 * Rutas server-only del operador (proxies API: `app/api/*`). Son validas en
 * web/standalone (servidor Node), pero INCOMPATIBLES con `output: export`
 * (exe/apk/ios): un route handler dinamico no puede prerenderizarse a HTML
 * estatico y rompe `next build`. Se excluyen del paquete nativo para que el
 * `build:static` del cliente compile. NO se excluyen del web-zip.
 */
export const NATIVE_EXCLUDE_PATHS: string[] = ['app/api'];

/**
 * Filtra entradas para `archive.directory(...)`: solo deja pasar la entrada
 * si su segmento de primer nivel esta en `allowlist`, o si su ruta completa
 * (relativa a la raiz del directorio empaquetado) esta en `extraFiles`.
 *
 * `extraFiles` permite un archivo puntual (p.ej. `build/icon.png`) SIN abrir
 * toda la carpeta (`build`) a la que pertenece.
 *
 * `excludePaths` descarta una ruta anidada y todo su subarbol (p.ej.
 * `app/api`) aunque su segmento top-level (`app`) SI este en la allowlist —
 * la exclusion tiene prioridad sobre la inclusion.
 */
export function allowlistFilter<T extends EntryLike>(
  entry: T,
  allowlist: string[],
  extraFiles: string[] = [],
  excludePaths: string[] = [],
): T | false {
  const normalized = entry.name.replace(/\\/g, '/').replace(/\/+$/, '');
  for (const ex of excludePaths) {
    if (normalized === ex || normalized.startsWith(ex + '/')) return false;
  }
  if (extraFiles.includes(normalized)) return entry;
  const top = normalized.split('/')[0];
  return allowlist.includes(top) ? entry : false;
}

// ---------------------------------------------------------------------------
// `.env.local` / `.env.example` — escritor y emisor unicos (design.md #3)
// ---------------------------------------------------------------------------

/**
 * IP local de la maquina (util para apps moviles/escritorio exportadas en
 * desarrollo que necesitan apuntar al backend local en vez de `localhost`).
 * Trasladada desde `export-temp-copy.ts`: ahora vive junto al unico punto
 * que decide el contenido de `.env.local`.
 */
function getLocalIp(): string | null {
  const nets = os.networkInterfaces();
  let ip: string | null = null;
  for (const name of Object.keys(nets)) {
    if (name.toLowerCase().includes('vswitch') || name.toLowerCase().includes('wsl')) continue;
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        ip = net.address;
        break;
      }
    }
    if (ip) break;
  }
  return ip;
}

export interface BuildEnvOptions {
  /**
   * Lineas adicionales que otras changes puedan aportar (hook de extension,
   * p.ej. `crm-export-runtime-config`/`crm-env-contract-tiers`). Nunca
   * escriben el archivo por si mismas: solo declaran lineas.
   */
  extraLines?: string[];
}

/**
 * Construye el contenido de `.env.local` para el ZIP de exportacion de un
 * tenant. Unica fuente de las lineas del archivo — ningun builder ni
 * `createTempCopy` escriben/appendean `.env.local` por su cuenta
 * (single-writer, design.md §3).
 *
 * - `NEXT_PUBLIC_TENANT_JSON` va SIEMPRE, codificado en base64 (no en crudo)
 *   porque dotenv trata `#` como inicio de comentario y la config del tenant
 *   trae colores hex (`branding.primary`, p.ej. "#1E90FF") que truncarian el
 *   JSON si se escribiera sin codificar.
 * - `NEXT_PUBLIC_API_URL` solo si `config.api.url` existe; si apunta a
 *   `localhost` se sustituye por la IP LAN de la maquina (utíl para pruebas
 *   moviles). Sin `api.url` se deja un placeholder comentado, NUNCA el
 *   `.env.local` real del operador.
 */
export function buildEnvContent(config: TenantConfig, options: BuildEnvOptions = {}): string[] {
  const lines: string[] = [];

  const json = JSON.stringify(config);
  const b64 = Buffer.from(json, 'utf8').toString('base64');
  lines.push(`NEXT_PUBLIC_TENANT_JSON=${b64}`);

  if (config.api?.url) {
    let url = config.api.url;
    if (url.includes('localhost')) {
      const localIp = getLocalIp();
      if (localIp) url = url.replace(/localhost/g, localIp);
    }
    lines.push(`NEXT_PUBLIC_API_URL=${url}`);
  } else {
    lines.push('# NEXT_PUBLIC_API_URL sin configurar');
  }

  if (options.extraLines?.length) lines.push(...options.extraLines);

  return lines;
}

/**
 * Escribe `.env.local` FRESCO en la copia temporal — sobreescribe cualquier
 * contenido previo (incluido el del `.env.local` real del operador, si por
 * lo que sea sobrevivio a `createTempCopy`). Unico punto de escritura del
 * pipeline de export para este archivo.
 */
export function writeFreshEnvLocal(tmpFrontDir: string, lines: string[]): void {
  fs.writeFileSync(path.join(tmpFrontDir, '.env.local'), lines.join('\n') + '\n', 'utf8');
}

/**
 * Contenido placeholder de `.env.example` — nunca copiado del `.env.example`
 * real del repo (que podria arrastrar valores de una sesion de desarrollo
 * anterior); siempre generado fresco en memoria.
 */
export function buildEnvExampleContent(options: BuildEnvOptions = {}): string[] {
  const lines = ['# NEXT_PUBLIC_API_URL=https://tu-api.example.com'];
  if (options.extraLines?.length) lines.push(...options.extraLines);
  return lines;
}

/** Emisor unico de `.env.example` en la copia temporal. */
export function writeFreshEnvExample(tmpFrontDir: string, lines: string[]): void {
  fs.writeFileSync(path.join(tmpFrontDir, '.env.example'), lines.join('\n') + '\n', 'utf8');
}
