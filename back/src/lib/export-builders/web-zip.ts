/**
 * back/src/lib/export-builders/web-zip.ts
 *
 * Web ZIP = codigo fuente de la aplicacion Next.js lista para alojar (SaaS Puro).
 *
 * Flujo:
 *   createTempCopy -> empaquetar ZIP del codigo fuente junto con schemas y README.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn as nodeSpawn } from 'node:child_process';

const require = createRequire(import.meta.url);
type Archiver = import('archiver').Archiver;
type EntryData = import('archiver').EntryData;
type ArchiverFactory = (
  format: 'zip' | 'tar',
  options?: { zlib?: { level?: number } },
) => Archiver;
const archiver = require('archiver') as ArchiverFactory;

import { buildSql } from '../../../../shared/generate/build-sql.js';
import { buildPrisma } from '../../../../shared/generate/build-prisma.js';
import { buildManifest } from '../../../../shared/generate/build-manifest.js';
import type { TenantConfig } from '../../../../shared/generate/tenant-types.js';
import {
  createTempCopy as defaultCreateTempCopy,
  cleanupTempCopy as defaultCleanupTempCopy,
} from '../export-temp-copy.js';
import {
  WEB_ALLOWLIST,
  allowlistFilter,
  buildEnvContent,
  writeFreshEnvLocal,
  buildEnvExampleContent,
  writeFreshEnvExample,
} from './manifest-allowlist.js';

// ---------------------------------------------------------------------------
// Exported types (shared across all builders)
// ---------------------------------------------------------------------------

export interface ProgressEvent {
  type: string;
  format?: string;
  step?: string;
  pct?: number;
  outputPath?: string;
  message?: string;
  results?: unknown[];
}

export type BuildResult =
  | { success: true; outputPath: string }
  | { success: false; error: string };

export type Emitter = (event: ProgressEvent) => void;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const __dirname_ = path.dirname(fileURLToPath(import.meta.url));

// Carpetas que NUNCA entran en `shared/` (builds y dependencias). `shared/`
// no pasa por el allowlist de `front/` (design.md §2: "sigue empaquetandose
// aparte sin cambios") — createTempCopy ya la copia sin node_modules/.next/out,
// este filtro es una segunda barrera redundante pero barata.
const SHARED_EXCLUDED = new Set(['node_modules', '.next', 'out']);

function toSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

/** Lee la plantilla README y sustituye los placeholders del tenant. */
function renderReadme(productName: string): string {
  return `# ${productName} — Web

## Que es esto

Este ZIP contiene el **codigo fuente completo** de tu aplicacion web, construida
con Next.js. Es una aplicacion estandar de Node.js: puedes ejecutarla en tu
propia maquina para probarla, o alojarla en cualquier proveedor de hosting
(Vercel, Netlify, un servidor propio, etc.).

## Requisitos previos

- **Node.js 22** (version LTS). Comprueba tu version con \`node --version\`.
  Si no lo tienes, descargalo desde https://nodejs.org y elige la version 22 LTS.

## Compilar y ejecutar en local (paso a paso)

1. **Entrar en la carpeta del codigo.** Todo el proyecto vive dentro de \`app/\`,
   asi que lo primero es situarte ahi:
   \`\`\`
   cd app
   \`\`\`

2. **Instalar las dependencias.** Descarga las librerias que la aplicacion
   necesita (se guardan en \`node_modules/\`). Solo hace falta hacerlo la primera
   vez o cuando cambien las dependencias:
   \`\`\`
   npm install
   \`\`\`

3. **Compilar para produccion.** Genera la version optimizada de la aplicacion.
   Este paso valida el codigo y prepara los archivos que se serviran:
   \`\`\`
   npm run build
   \`\`\`

4. **Arrancar la aplicacion.** Levanta el servidor web ya compilado:
   \`\`\`
   npm start
   \`\`\`
   La aplicacion queda disponible en **http://localhost:3002**. Abre esa
   direccion en tu navegador.

## Publicar en produccion

Tienes dos caminos habituales:

- **Vercel (lo mas sencillo).** Sube esta carpeta a un repositorio de Git
  (GitHub, GitLab, etc.), entra en https://vercel.com, elige *Import Project*
  y selecciona el repositorio. Vercel detecta Next.js automaticamente, ejecuta
  el \`build\` y publica la web con una URL propia.

- **Servidor Node propio.** En cualquier servidor con Node 22, repite los pasos
  \`npm install\` -> \`npm run build\` -> \`npm start\`. Se recomienda usar un gestor
  de procesos (por ejemplo PM2) para mantener la aplicacion siempre encendida.

> Nota: si tu aplicacion se conecta a una API, configura la URL en un archivo
> \`.env.local\` (por ejemplo \`NEXT_PUBLIC_API_URL=<url-de-tu-api>\`) antes de
> compilar.
`;
}

// ---------------------------------------------------------------------------
// Dependencias inyectables (para test)
// ---------------------------------------------------------------------------

export interface WebZipDeps {
  spawn?: typeof nodeSpawn;
  createTempCopy?: typeof defaultCreateTempCopy;
  cleanupTempCopy?: typeof defaultCleanupTempCopy;
  runNpmCi?: any;
}

/**
 * Ensambla el ZIP final con archiver (streaming).
 */
async function assembleZip(
  tmpDir: string,
  sharedDir: string,
  outputPath: string,
  artifacts: { sql: string; prisma: string; manifest: string; readme: string },
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const outStream = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    outStream.on('close', () => resolve());
    outStream.on('error', reject);
    archive.on('error', reject);
    archive.on('warning', (err: NodeJS.ErrnoException) => {
      if (err.code !== 'ENOENT') reject(err);
    });

    archive.pipe(outStream);

    // app/ — solo lo que el cliente necesita para compilar/alojar (allowlist,
    // sustituye a la denylist APP_EXCLUDED; design.md §1-2).
    archive.directory(tmpDir, 'app', (entry: EntryData) => allowlistFilter(entry, WEB_ALLOWLIST));

    // shared/ en la raiz del ZIP: front importa `../../../shared/generate/*`
    // (desde app/lib/generate/*), que resuelve a la raiz de extraccion. Sin
    // esta carpeta el `next build` del proyecto exportado falla con
    // "Cannot find module '../../../shared/generate/build-sql'".
    if (fs.existsSync(sharedDir)) {
      archive.directory(sharedDir, 'shared', (entry: EntryData) => {
        const top = entry.name.split(/[\\/]/)[0];
        return SHARED_EXCLUDED.has(top) ? false : entry;
      });
    }

    // Artefactos generados en la raiz del ZIP.
    archive.append(artifacts.sql, { name: 'schema.sql' });
    archive.append(artifacts.prisma, { name: 'schema.prisma' });
    archive.append(artifacts.manifest, { name: 'manifest.json' });
    archive.append(artifacts.readme, { name: 'README.md' });

    void archive.finalize();
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Construye `<slug>-web-src.zip`: codigo fuente + schema + README.
 */
export async function buildWebZip(
  config: TenantConfig,
  frontDir: string,
  outputDir: string,
  emit: Emitter,
  signal?: AbortSignal,
  deps: WebZipDeps = {},
): Promise<BuildResult> {
  const createTempCopy = deps.createTempCopy ?? defaultCreateTempCopy;
  const cleanupTempCopy = deps.cleanupTempCopy ?? defaultCleanupTempCopy;

  let rootDir: string | undefined;

  try {
    emit({ type: 'progress', format: 'web-zip', step: 'Copiando proyecto fuente...', pct: 15 });
    const copy = await createTempCopy(frontDir, config);
    rootDir = copy.rootDir;
    const tmpFrontDir = copy.frontDir;
    const tmpSharedDir = path.join(copy.rootDir, 'shared');

    // .env.local/.env.example siempre frescos (nunca copiados del operador,
    // design.md §3 — writeFreshEnvLocal es el unico escritor del pipeline).
    writeFreshEnvLocal(tmpFrontDir, buildEnvContent(config));
    writeFreshEnvExample(tmpFrontDir, buildEnvExampleContent());

    emit({ type: 'progress', format: 'web-zip', step: 'Generando esquema y manifest...', pct: 40 });
    const sql = buildSql(config);
    const prisma = buildPrisma(config);
    const manifest = JSON.stringify(buildManifest(config), null, 2);
    const readme = renderReadme(config.business.name);

    emit({ type: 'progress', format: 'web-zip', step: 'Empaquetando codigo fuente en ZIP...', pct: 70 });
    fs.mkdirSync(outputDir, { recursive: true });
    const slug = toSlug(config.business.name);
    const outputPath = path.join(outputDir, `${slug}-web-src.zip`);

    await assembleZip(tmpFrontDir, tmpSharedDir, outputPath, { sql, prisma, manifest, readme });

    emit({ type: 'progress', format: 'web-zip', step: 'Guardando archivo ZIP...', pct: 100, outputPath });
    return { success: true, outputPath };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    emit({ type: 'format-error', format: 'web-zip', message: error });
    return { success: false, error };
  } finally {
    if (rootDir) cleanupTempCopy(rootDir);
  }
}
