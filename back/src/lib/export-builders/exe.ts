/**
 * back/src/lib/export-builders/exe.ts
 *
 * Escritorio ZIP = app Next.js estatica preparada como codigo fuente para Electron.
 *
 * Flujo:
 *   createTempCopy -> applyExportCompat -> empaquetar ZIP del codigo fuente.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn as nodeSpawn } from 'node:child_process';
import { applyExportCompat as defaultApplyExportCompat } from '../export-compat.js';
import {
  createTempCopy as defaultCreateTempCopy,
  cleanupTempCopy as defaultCleanupTempCopy,
} from '../export-temp-copy.js';
import {
  DESKTOP_ALLOWLIST,
  allowlistFilter,
  buildEnvContent,
  writeFreshEnvLocal,
  buildEnvExampleContent,
  writeFreshEnvExample,
  buildMinimalManifest,
} from './manifest-allowlist.js';
import {
  buildRuntimeConfigEnvLines,
  RUNTIME_CONFIG_ENV_EXAMPLE_LINES,
  type RuntimeConfig,
} from './runtime-config-env.js';
import { buildPublicEnvSecretsLines, type PublicEnvSecret } from './public-env-secrets.js';
import type { TenantConfig } from '../../../../shared/generate/tenant-types.js';
import type { Emitter, BuildResult, Deliverable } from './web-zip.js';

export type { Emitter, BuildResult, Deliverable };

const require = createRequire(import.meta.url);
type Archiver = import('archiver').Archiver;
type EntryData = import('archiver').EntryData;
type ArchiverFactory = (
  format: 'zip' | 'tar',
  options?: { zlib?: { level?: number } },
) => Archiver;
const archiver = require('archiver') as ArchiverFactory;

const __dirname_ = path.dirname(fileURLToPath(import.meta.url));

// shared/ no pasa por el allowlist de front/ (design.md §2, "sin cambios");
// createTempCopy ya la copia sin node_modules/.next/out, segunda barrera.
const SHARED_EXCLUDED = new Set(['node_modules', '.next', 'out', 'dist-electron', 'build']);

// Archivo puntual permitido dentro de `build/` sin abrir toda la carpeta
// ('build' no esta en DESKTOP_ALLOWLIST a proposito, ver proposal.md — bug
// del icono desaparecido). Corrige el bug: el icono escrito en
// `tmpFrontDir/build/icon.png` ahora sobrevive al filtro de ensamblado.
const DESKTOP_EXTRA_FILES = ['build/icon.png'];

function toSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

/** README cara al cliente: compilacion electron-builder generica, sin referencias internas. */
function renderReadmeClient(productName: string): string {
  return `# ${productName} — Windows (.exe)

## Que es esto

Este ZIP contiene el codigo fuente para generar una **aplicacion de escritorio
para Windows**. Por dentro es tu misma aplicacion web, empaquetada con Electron:
Electron es un contenedor que muestra la web dentro de una ventana propia, con
su icono y su ejecutable, de modo que el usuario final la abre como cualquier
programa de escritorio (sin navegador a la vista).

## Requisitos previos

- **Node.js 22** (version LTS). Comprueba con \`node --version\`; si no lo tienes,
  descargalo desde https://nodejs.org.
- **Windows.** La generacion del \`.exe\` para Windows se hace desde Windows.

## Compilar el ejecutable (paso a paso)

1. **Entrar en la carpeta del codigo.** El proyecto de escritorio vive en
   \`desktop-src/\`:
   \`\`\`
   cd desktop-src
   \`\`\`

2. **Instalar las dependencias** (solo la primera vez):
   \`\`\`
   npm install
   \`\`\`

3. **Compilar la web estatica.** Genera la version estatica de la aplicacion en
   la carpeta \`out/\`. Ese contenido es lo que Electron mostrara dentro de la
   ventana:
   \`\`\`
   npm run build:static
   \`\`\`

4. **Empaquetar el ejecutable con electron-builder.** Este paso crea el \`.exe\`
   a partir de \`out/\`:
   \`\`\`
   npx electron-builder --win
   \`\`\`

## Resultado

Los archivos generados quedan en la carpeta **\`dist-electron/\`**:

- Un **instalador NSIS** (\`.exe\` que instala la aplicacion en el equipo).
- Una version **portable** (\`.exe\` que se ejecuta sin instalar).

## Nota sobre la firma del ejecutable (opcional)

Al abrir un \`.exe\` sin firmar, Windows SmartScreen puede mostrar un aviso de
"editor desconocido". Es normal y el usuario puede continuar igualmente. Para
evitar ese aviso hace falta un **certificado de firma de codigo (code signing)**
emitido por una autoridad reconocida. No es imprescindible para distribuir la
aplicacion, pero mejora la confianza del usuario final.
`;
}

/** README interno de operador: pipeline local real de firma/empaquetado. NUNCA se entrega al cliente. */
function renderReadmeOperator(productName: string): string {
  return `PAQUETE INTERNO — no entregar al cliente

# ${productName} — Windows (.exe, pipeline interno)

## Que es esto

Este ZIP es el paquete de trabajo del **operador** para generar el
instalador de Windows de este tenant. El cliente final NUNCA recibe este
ZIP: recibe unicamente el \`.exe\` ya compilado.

## Pipeline local del operador (Windows)

1. **Entrar en la carpeta del codigo, instalar dependencias y compilar la
   web estatica:**
   \`\`\`
   cd desktop-src
   npm install
   npm run build:static
   \`\`\`

2. **Empaquetar con electron-builder, firmando con el certificado de la
   organizacion:**
   \`\`\`
   npx electron-builder --win --config.win.certificateFile="D:\\Operaos\\certs\\operaos-codesign.pfx" --config.win.certificatePassword=$env:OPERAOS_CODESIGN_PASS
   \`\`\`
   El certificado \`operaos-codesign.pfx\` es propiedad de la organizacion; la
   contrasena vive en el gestor de secretos del operador, nunca en este
   README.

3. **Entregar al cliente** unicamente los artefactos de \`dist-electron/\`.

## Nota

El README que recibe el cliente (variante \`binary+source\`) es distinto: no
menciona firma con certificado propio ni rutas locales de esta maquina.
`;
}

/** Lee la plantilla README y sustituye los placeholders del tenant. */
function renderReadme(productName: string, deliverable: Deliverable): string {
  return deliverable === 'binary'
    ? renderReadmeOperator(productName)
    : renderReadmeClient(productName);
}

async function assembleZip(
  frontDir: string,
  sharedDir: string,
  outputPath: string,
  artifacts: { readme: string; manifest: string },
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

    archive.directory(frontDir, 'desktop-src', (entry: EntryData) =>
      allowlistFilter(entry, DESKTOP_ALLOWLIST, DESKTOP_EXTRA_FILES),
    );

    // shared/ en la raiz del ZIP: front importa `../../../shared/generate/*`
    // (desde desktop-src/lib/generate/*), que resuelve a la raiz de extraccion.
    // Sin esta carpeta el `next build` del proyecto exportado falla con
    // "Cannot find module '../../../shared/generate/build-sql'".
    if (fs.existsSync(sharedDir)) {
      archive.directory(sharedDir, 'shared', (entry: EntryData) => {
        const segs = entry.name.split(/[\\/]/);
        return segs.some((s) => SHARED_EXCLUDED.has(s)) ? false : entry;
      });
    }

    archive.append(artifacts.readme, { name: 'README.md' });
    archive.append(artifacts.manifest, { name: 'manifest.json' });

    void archive.finalize();
  });
}

export interface ExeDeps {
  spawn?: typeof nodeSpawn;
  createTempCopy?: typeof defaultCreateTempCopy;
  cleanupTempCopy?: typeof defaultCleanupTempCopy;
  applyExportCompat?: typeof defaultApplyExportCompat;
  platform?: NodeJS.Platform;
  /** crm-export-runtime-config: cableado runtime de plataforma para este ZIP. */
  runtimeConfig?: RuntimeConfig;
  /** crm-export-delivery-profiles: destinatario del ZIP. Default 'binary+source'. */
  deliverable?: Deliverable;
  /**
   * crm-env-contract-tiers (WU3.4): secretos `FRONTEND_PUBLIC` del negocio
   * con `envVarName` asignado, ya descifrados (`readBakeableSecrets`).
   * Solo hornean `.env.local`, NUNCA `.env.example`.
   */
  publicEnvSecrets?: PublicEnvSecret[];
}

export async function buildExe(
  config: TenantConfig,
  frontDir: string,
  outputDir: string,
  emit: Emitter,
  signal?: AbortSignal,
  deps: ExeDeps = {},
): Promise<BuildResult> {
  const createTempCopy = deps.createTempCopy ?? defaultCreateTempCopy;
  const cleanupTempCopy = deps.cleanupTempCopy ?? defaultCleanupTempCopy;
  const applyExportCompat = deps.applyExportCompat ?? defaultApplyExportCompat;
  const deliverable: Deliverable = deps.deliverable ?? 'binary+source';

  const productName = config.business.name;
  const slug = toSlug(productName);

  let rootDir: string | undefined;

  try {
    emit({ type: 'progress', format: 'exe', step: 'Copiando proyecto fuente...', pct: 10 });
    const copy = await createTempCopy(frontDir, config);
    rootDir = copy.rootDir;
    const tmpFrontDir = copy.frontDir;
    const tmpSharedDir = path.join(copy.rootDir, 'shared');

    // .env.local/.env.example siempre frescos (nunca copiados del operador,
    // design.md §3 — writeFreshEnvLocal es el unico escritor del pipeline).
    // crm-export-runtime-config aporta PLATFORM_API_URL/TENANT_ID/TENANT_API_KEY
    // via el punto de extension `extraLines` (sin escritura directa aqui).
    writeFreshEnvLocal(
      tmpFrontDir,
      buildEnvContent(config, {
        extraLines: [
          ...buildRuntimeConfigEnvLines(deps.runtimeConfig),
          ...buildPublicEnvSecretsLines(deps.publicEnvSecrets ?? []),
        ],
      }),
    );
    writeFreshEnvExample(
      tmpFrontDir,
      buildEnvExampleContent({ extraLines: [...RUNTIME_CONFIG_ENV_EXAMPLE_LINES] }),
    );

    const removed = applyExportCompat(tmpFrontDir);
    emit({
      type: 'progress',
      format: 'exe',
      step: `Aplicando reglas estaticas (${removed.length} rutas excluidas)...`,
      pct: 30,
    });

    if (config.branding?.logoImage) {
      try {
        const base64Data = config.branding.logoImage.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        const buildDir = path.join(tmpFrontDir, 'build');
        fs.mkdirSync(buildDir, { recursive: true });
        fs.writeFileSync(path.join(buildDir, 'icon.png'), buffer);
        emit({ type: 'progress', format: 'exe', step: 'Icono personalizado inyectado...', pct: 40 });
      } catch (e) {
        console.warn('No se pudo inyectar el icono:', e);
      }
    }

    emit({ type: 'progress', format: 'exe', step: 'Empaquetando codigo fuente en ZIP...', pct: 60 });
    fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `${slug}-desktop-src.zip`);
    const readme = renderReadme(productName, deliverable);
    const manifest = buildMinimalManifest('exe', deliverable, config);

    await assembleZip(tmpFrontDir, tmpSharedDir, outputPath, { readme, manifest });

    emit({ type: 'progress', format: 'exe', step: 'Guardando archivo ZIP...', pct: 100, outputPath });
    return { success: true, outputPath };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    emit({ type: 'format-error', format: 'exe', message: error });
    return { success: false, error };
  } finally {
    if (rootDir) cleanupTempCopy(rootDir);
  }
}
