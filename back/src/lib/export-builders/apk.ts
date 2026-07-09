/**
 * back/src/lib/export-builders/apk.ts
 *
 * Android ZIP = app Next.js estatica preparada como codigo fuente para Capacitor.
 *
 * Flujo:
 *   createTempCopy -> applyExportCompat -> personalizar capacitor.config.ts
 *   -> empaquetar ZIP del codigo fuente.
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
  ANDROID_ALLOWLIST,
  NATIVE_EXCLUDE_PATHS,
  allowlistFilter,
  buildEnvContent,
  writeFreshEnvLocal,
  buildEnvExampleContent,
  writeFreshEnvExample,
} from './manifest-allowlist.js';
import {
  buildRuntimeConfigEnvLines,
  RUNTIME_CONFIG_ENV_EXAMPLE_LINES,
  type RuntimeConfig,
} from './runtime-config-env.js';
import { buildPublicEnvSecretsLines, type PublicEnvSecret } from './public-env-secrets.js';
import type { TenantConfig } from '../../../../shared/generate/tenant-types.js';
import type { Emitter, BuildResult } from './web-zip.js';

export type { Emitter, BuildResult };

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
const SHARED_EXCLUDED = new Set(['node_modules', '.next', 'out', 'build', '.gradle']);

function toSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

function toAppId(slug: string): string {
  const suffix = slug.replace(/[^a-z0-9]/g, '') || 'app';
  return `com.operaos.${suffix}`;
}

function renderReadme(productName: string): string {
  return `# ${productName} — Android (APK)

## Que es esto

Este ZIP contiene el codigo fuente para generar la **app de Android (APK)**. Por
dentro es tu misma aplicacion web, empaquetada con Capacitor dentro de un
proyecto nativo de Android que se compila con Gradle. El resultado es un archivo
\`.apk\` que se instala en cualquier telefono Android.

## Requisitos previos (explicados)

- **Node.js 22.** Motor de JavaScript que ejecuta las herramientas de compilacion
  de la parte web. Comprueba con \`node --version\`.

- **Java JDK 17 o superior** (JDK 21 tambien funciona). Gradle y el compilador de
  Android estan escritos en Java, asi que necesitas un JDK instalado. Comprueba
  con \`java -version\`. Recomendado: Temurin/OpenJDK 17 o 21.

- **Android SDK** con la plataforma **android-35** y las **build-tools 35**. Es el
  conjunto de librerias y herramientas de Android que compilan el APK.
  No hace falta instalar Android Studio completo: basta con los *command line
  tools* (que incluyen \`sdkmanager\`). Desde ahi puedes instalar lo necesario:
  \`\`\`
  sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"
  \`\`\`
  Despues, indica al proyecto donde esta el SDK de una de estas dos formas:
  - Definiendo la variable de entorno \`ANDROID_HOME=<ruta-al-sdk>\`, **o**
  - Creando el archivo \`android/local.properties\` con una linea:
    \`sdk.dir=<ruta-al-sdk>\`

## Compilar el APK (paso a paso)

1. **Entrar en la carpeta del codigo:**
   \`\`\`
   cd mobile-src
   \`\`\`

2. **Instalar las dependencias** (solo la primera vez):
   \`\`\`
   npm install
   \`\`\`

3. **Compilar la web estatica.** Genera la carpeta \`out/\`, que es la web que
   Capacitor empaqueta dentro de la app:
   \`\`\`
   npm run build:static
   \`\`\`

4. **Sincronizar con el proyecto Android.** Copia \`out/\` dentro del proyecto
   nativo de Android:
   \`\`\`
   npx cap sync android
   \`\`\`

5. **Entrar en el proyecto Android:**
   \`\`\`
   cd android
   \`\`\`

6. **Elegir una variante de compilacion.** Hay dos:

   - **Debug (para probar rapido, sin tu firma).** Genera un APK firmado con la
     clave de depuracion automatica de Android. Sirve para instalar y probar en
     tu movil, pero **no** para entregar actualizaciones (la clave debug no es
     estable ni tuya):
     \`\`\`
     .\\gradlew.bat assembleDebug
     \`\`\`
     Resultado: \`app\\build\\outputs\\apk\\debug\\app-debug.apk\`

   - **Release firmado (para ENTREGAR a usuarios).** Firma el APK con **tu**
     keystore (ver la seccion siguiente). Pasa las rutas y contrasenas como
     parametros \`-P\` (usa marcadores como placeholders, sustituyelos por tus
     valores reales):
     \`\`\`
     .\\gradlew.bat assembleRelease \`
       -PrelKeystore="<ruta-a-tu-keystore.jks>" \`
       -PrelStorePass=<contraseña-del-keystore> \`
       -PrelAlias=<alias> \`
       -PrelKeyPass=<contraseña-de-la-clave>
     \`\`\`
     Resultado: \`app\\build\\outputs\\apk\\release\\app-release.apk\`

## Firma (keystore)

- El **keystore** (archivo \`.jks\`) es tu **identidad de firma**. Demuestra que
  una app es tuya. Se genera **una sola vez** y se **reutiliza** para todas tus
  apps y todas sus futuras versiones.

- **Es un archivo binario: no se abre ni se lee.** Que parezca "ilegible" es
  normal y correcto — es una caja fuerte, no un documento. No lo edites; solo lo
  pasas al compilar con los parametros \`-P...\` de arriba.

- **Guardalo con copia de seguridad, y apunta sus contrasenas en un gestor de
  contrasenas.** Si pierdes el archivo O sus contrasenas, **no podras publicar
  actualizaciones** de una app ya entregada: Android las rechazara por no
  coincidir la firma. Es irrecuperable.

- **Dos contrasenas, normalmente iguales.** El keystore pide una contrasena del
  almacen (\`-PrelStorePass\`) y una de la clave (\`-PrelKeyPass\`). Con el formato
  por defecto de \`keytool\` (**PKCS12**) ambas son **la misma**; solo difieren si
  al generarlo elegiste dos distintas a proposito.

- Generarlo (una vez):
  \`\`\`
  keytool -genkeypair -v -keystore mi-release.jks -alias mi-alias -keyalg RSA -keysize 2048 -validity 10000
  \`\`\`
  El comando te pedira las contrasenas y algunos datos (nombre, organizacion...).

- **Consultar lo que contiene** (alias, fecha, huella) sin abrirlo a mano —
  necesitas la contrasena del almacen:
  \`\`\`
  keytool -list -keystore <ruta-a-tu-keystore.jks> -storepass <contraseña-del-keystore>
  \`\`\`
  Si lista tu alias sin error, la contrasena es correcta.

- **Es TUYO y no viaja en este ZIP.** Lo mantienes aparte y NUNCA lo incluyes en
  un paquete que entregues a un cliente.

## Actualizaciones

Android instala un APK **como actualizacion** de una app ya instalada
(conservando sus datos) solo si se cumplen las tres condiciones:

1. **Mismo \`applicationId\`** (ya viene fijado por la app, no debes tocarlo).
2. **Misma keystore** que la version anterior.
3. **\`versionCode\` MAYOR** que el de la version instalada.

El \`versionCode\` de este proyecto se genera **automaticamente** (minutos
transcurridos desde una fecha base, siempre creciente), asi que cada compilacion
posterior se instala como actualizacion sin que tengas que gestionar numeros.
Si quieres fijar el **nombre de version visible** al usuario, añade:
\`-PappVersionName="1.1"\`.

## Instalacion en el movil

Para instalar el APK directamente (sideload), sin pasar por Google Play:

1. Copia el archivo \`.apk\` al telefono (cable, correo, nube...).
2. Abrelo desde el gestor de archivos del movil.
3. Android mostrara un aviso de "origenes desconocidos" o "no verificada por
   Play Protect". Es **normal** para apps instaladas fuera de la Play Store:
   acepta para continuar con la instalacion.
`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&apos;')
    .replace(/"/g, '&quot;');
}

function customizeCapacitorConfig(
  frontDir: string,
  appId: string,
  appName: string,
): void {
  const configPath = path.join(frontDir, 'capacitor.config.ts');
  const content =
    `import type { CapacitorConfig } from '@capacitor/cli';\n\n` +
    `// Config horneada por el exportador para este tenant.\n` +
    `const config: CapacitorConfig = {\n` +
    `  appId: ${JSON.stringify(appId)},\n` +
    `  appName: ${JSON.stringify(appName)},\n` +
    `  webDir: 'out',\n` +
    `};\n\n` +
    `export default config;\n`;
  fs.writeFileSync(configPath, content, 'utf8');

  const gradlePath = path.join(frontDir, 'android', 'app', 'build.gradle');
  if (fs.existsSync(gradlePath)) {
    let gradle = fs.readFileSync(gradlePath, 'utf8');
    gradle = gradle.replace(/applicationId\s+"[^"]*"/, `applicationId "${appId}"`);
    fs.writeFileSync(gradlePath, gradle, 'utf8');
  }

  const stringsPath = path.join(
    frontDir,
    'android',
    'app',
    'src',
    'main',
    'res',
    'values',
    'strings.xml',
  );
  if (fs.existsSync(stringsPath)) {
    let strings = fs.readFileSync(stringsPath, 'utf8');
    const escapedName = escapeXml(appName);
    strings = strings.replace(
      /(<string name="app_name">)[^<]*(<\/string>)/,
      `$1${escapedName}$2`,
    );
    strings = strings.replace(
      /(<string name="title_activity_main">)[^<]*(<\/string>)/,
      `$1${escapedName}$2`,
    );
    fs.writeFileSync(stringsPath, strings, 'utf8');
  }
}

async function assembleZip(
  frontDir: string,
  sharedDir: string,
  outputPath: string,
  artifacts: { readme: string },
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

    archive.directory(frontDir, 'mobile-src', (entry: EntryData) =>
      allowlistFilter(entry, ANDROID_ALLOWLIST, [], NATIVE_EXCLUDE_PATHS),
    );

    // shared/ en la raiz del ZIP: front importa `../../../shared/generate/*`
    // (desde mobile-src/lib/generate/*), que resuelve a la raiz de extraccion.
    // Sin esta carpeta el `next build` del proyecto exportado falla con
    // "Cannot find module '../../../shared/generate/build-sql'".
    if (fs.existsSync(sharedDir)) {
      archive.directory(sharedDir, 'shared', (entry: EntryData) => {
        const segs = entry.name.split(/[\\/]/);
        return segs.some((s) => SHARED_EXCLUDED.has(s)) ? false : entry;
      });
    }

    archive.append(artifacts.readme, { name: 'README.md' });

    void archive.finalize();
  });
}

export interface ApkDeps {
  spawn?: typeof nodeSpawn;
  createTempCopy?: typeof defaultCreateTempCopy;
  cleanupTempCopy?: typeof defaultCleanupTempCopy;
  applyExportCompat?: typeof defaultApplyExportCompat;
  platform?: NodeJS.Platform;
  /** crm-export-runtime-config: cableado runtime de plataforma para este ZIP. */
  runtimeConfig?: RuntimeConfig;
  /**
   * crm-env-contract-tiers (WU3.4): secretos `FRONTEND_PUBLIC` del negocio
   * con `envVarName` asignado, ya descifrados (`readBakeableSecrets`).
   * Solo hornean `.env.local`, NUNCA `.env.example`.
   */
  publicEnvSecrets?: PublicEnvSecret[];
}

export async function buildApk(
  config: TenantConfig,
  frontDir: string,
  outputDir: string,
  emit: Emitter,
  signal?: AbortSignal,
  deps: ApkDeps = {},
): Promise<BuildResult> {
  const createTempCopy = deps.createTempCopy ?? defaultCreateTempCopy;
  const cleanupTempCopy = deps.cleanupTempCopy ?? defaultCleanupTempCopy;
  const applyExportCompat = deps.applyExportCompat ?? defaultApplyExportCompat;

  const productName = config.business.name;
  const slug = toSlug(productName);
  const appId = toAppId(slug);

  let rootDir: string | undefined;

  try {
    emit({ type: 'progress', format: 'apk', step: 'Copiando proyecto fuente...', pct: 10 });
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
      format: 'apk',
      step: `Aplicando reglas estaticas (${removed.length} rutas excluidas)...`,
      pct: 30,
    });

    customizeCapacitorConfig(tmpFrontDir, appId, productName);

    if (config.branding?.logoImage) {
      try {
        const base64Data = config.branding.logoImage.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        const mipmapDirs = ['mipmap-mdpi', 'mipmap-hdpi', 'mipmap-xhdpi', 'mipmap-xxhdpi', 'mipmap-xxxhdpi'];
        for (const dir of mipmapDirs) {
          const resDir = path.join(tmpFrontDir, 'android', 'app', 'src', 'main', 'res', dir);
          if (fs.existsSync(resDir)) {
            fs.writeFileSync(path.join(resDir, 'ic_launcher.png'), buffer);
            fs.writeFileSync(path.join(resDir, 'ic_launcher_round.png'), buffer);
            fs.writeFileSync(path.join(resDir, 'ic_launcher_foreground.png'), buffer);
          }
        }
        emit({ type: 'progress', format: 'apk', step: 'Icono personalizado inyectado...', pct: 40 });
      } catch (e) {
        console.warn('No se pudo inyectar el icono:', e);
      }
    }

    emit({ type: 'progress', format: 'apk', step: 'Empaquetando codigo fuente en ZIP...', pct: 60 });
    fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `${slug}-android-src.zip`);
    const readme = renderReadme(productName);

    await assembleZip(tmpFrontDir, tmpSharedDir, outputPath, { readme });

    emit({ type: 'progress', format: 'apk', step: 'Guardando archivo ZIP...', pct: 100, outputPath });
    return { success: true, outputPath };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    emit({ type: 'format-error', format: 'apk', message: error });
    return { success: false, error };
  } finally {
    if (rootDir) cleanupTempCopy(rootDir);
  }
}
