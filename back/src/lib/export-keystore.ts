/**
 * back/src/lib/export-keystore.ts
 *
 * Firma de release para el APK (Fase 5.2 del design).
 *
 * `ensureKeystore()` garantiza que existe un keystore de release reutilizable
 * en `back/keystore/export-release.keystore`. Si no existe, lo genera con
 * `keytool -genkeypair` usando una contrasena aleatoria fuerte. `keytool` se
 * localiza con una cadena robusta ante shims de Java (ver `locateKeytool`
 * mas abajo — fix del gate 5.V, `where java` puede resolver a un shim de
 * Oracle sin keytool al lado).
 * La contrasena se persiste en `back/keystore/export-release.json` (dueno unico;
 * `back/keystore/` esta en el .gitignore del back). Si el keystore ya existe se
 * reutiliza leyendo la contrasena persistida.
 *
 * El builder apk pasa las credenciales devueltas a Gradle via propiedades -P
 * (ver android/app/build.gradle → signingConfigs.release).
 *
 * RNF-02: shell: false — spawnAsync no delega en un shell.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawn as nodeSpawn, spawnSync } from 'node:child_process';
import { spawnAsync } from './spawn-async.js';
import type { Emitter } from './export-builders/web-zip.js';

// ---------------------------------------------------------------------------
// Rutas y constantes
// ---------------------------------------------------------------------------

/** Directorio propietario del keystore por defecto (ignorado en git). */
function defaultKeystoreDir(): string {
  return path.join(process.cwd(), 'keystore');
}

/** Alias fijo de la clave de release. */
const ALIAS = 'operaos-release';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface KeystoreInfo {
  keystorePath: string;
  alias: string;
  storePassword: string;
  keyPassword: string;
}

interface KeystoreMeta {
  alias: string;
  storePassword: string;
  keyPassword: string;
}

/** Dependencias inyectables para la resolucion de keytool (para test). */
export interface LocateKeytoolDeps {
  platform?: NodeJS.Platform;
  /** fs.existsSync inyectable. */
  exists?: (p: string) => boolean;
  /** Ejecutor de comandos inyectable (sustituye a spawnSync en test). */
  exec?: (cmd: string, args: string[]) => { status: number | null; stdout: string; stderr: string };
}

/** Dependencias inyectables (para test). */
export interface EnsureKeystoreDeps {
  spawn?: typeof nodeSpawn;
  platform?: NodeJS.Platform;
  /** Localizador de keytool inyectable (para test sin JDK). */
  locateKeytool?: () => Promise<string> | string;
  /** Generador de contrasena inyectable (para test determinista). */
  genPassword?: () => string;
  /** Directorio del keystore inyectable (para test). Por defecto cwd/keystore. */
  keystoreDir?: string;
}

// ---------------------------------------------------------------------------
// Localizacion de keytool
// ---------------------------------------------------------------------------

/**
 * Localiza el ejecutable `keytool` con resolucion robusta ante shims de Java.
 *
 * Bug corregido (gate 5.V): en Windows, `where java` puede resolver contra un
 * SHIM (p.ej. `C:\Program Files\Common Files\Oracle\Java\javapath\java.exe`,
 * instalado por el updater de Oracle) que solo contiene `java`/`javaw`/`javac`,
 * SIN `keytool`. Buscar `keytool` en el mismo directorio que ese `java` falla
 * con ENOENT aunque haya un JDK real instalado en otra ruta.
 *
 * Orden de resolucion:
 *   1. `JAVA_HOME` definido → `%JAVA_HOME%\bin\keytool(.exe)` si existe.
 *   2. Preguntar al propio `java` su instalacion real: `java
 *      -XshowSettings:properties -version` imprime `java.home = <ruta>` por
 *      STDERR (asi resuelve el shim: `java.home` apunta al JDK/JRE de verdad,
 *      no al directorio del shim) → `<java.home>\bin\keytool(.exe)`.
 *   3. `where`/`which keytool` directo (por si esta en el PATH aunque java no).
 *   4. Ninguna de las anteriores → error claro con instrucciones (instalar
 *      JDK 17+ o definir JAVA_HOME).
 */
export async function locateKeytool(deps: LocateKeytoolDeps = {}): Promise<string> {
  const platform = deps.platform ?? process.platform;
  const isWin = platform === 'win32';
  const exe = isWin ? 'keytool.exe' : 'keytool';
  const exists = deps.exists ?? fs.existsSync;
  const exec =
    deps.exec ??
    ((cmd: string, args: string[]) => {
      const res = spawnSync(cmd, args, { encoding: 'utf8' });
      return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
    });

  // 1) JAVA_HOME.
  const javaHome = process.env.JAVA_HOME;
  if (javaHome) {
    const candidate = path.join(javaHome, 'bin', exe);
    if (exists(candidate)) return candidate;
  }

  // 2) Preguntar a java su java.home real (resuelve shims tipo Oracle javapath).
  const propsRes = exec('java', ['-XshowSettings:properties', '-version']);
  // La salida va por stderr en todas las JVM conocidas.
  const combined = `${propsRes.stdout}\n${propsRes.stderr}`;
  const match = combined.match(/java\.home\s*=\s*(.+)/);
  if (match) {
    const javaHomeReal = match[1].trim();
    const candidate = path.join(javaHomeReal, 'bin', exe);
    if (exists(candidate)) return candidate;
  }

  // 3) keytool directo en PATH.
  const finder = isWin ? 'where' : 'which';
  const whereRes = exec(finder, ['keytool']);
  if (whereRes.status === 0 && whereRes.stdout) {
    const keytoolPath = whereRes.stdout.split(/\r?\n/)[0]?.trim();
    if (keytoolPath && exists(keytoolPath)) return keytoolPath;
  }

  // 4) Nada funciono: error claro con instrucciones.
  throw new Error(
    'No se encontro keytool. Instala un JDK 17+ (p.ej. Eclipse Temurin) o ' +
      'define la variable de entorno JAVA_HOME apuntando a tu instalacion de JDK.',
  );
}

/** Genera una contrasena aleatoria fuerte (base64url, sin caracteres problematicos). */
function genPassword(): string {
  return randomBytes(24).toString('base64url');
}

// ---------------------------------------------------------------------------
// API publica
// ---------------------------------------------------------------------------

/**
 * Garantiza un keystore de release reutilizable y devuelve sus credenciales.
 * Genera el keystore si falta; lo reutiliza si ya existe.
 *
 * @param emit - Emisor de progreso opcional.
 * @param deps - Inyeccion de dependencias (para test).
 */
export async function ensureKeystore(
  emit?: Emitter,
  deps: EnsureKeystoreDeps = {},
): Promise<KeystoreInfo> {
  const locate = deps.locateKeytool ?? (() => locateKeytool({ platform: deps.platform }));
  const makePassword = deps.genPassword ?? genPassword;

  const keystoreDir = deps.keystoreDir ?? defaultKeystoreDir();
  const KEYSTORE_PATH = path.join(keystoreDir, 'export-release.keystore');
  const KEYSTORE_META = path.join(keystoreDir, 'export-release.json');

  fs.mkdirSync(keystoreDir, { recursive: true });

  // Reutilizar si ya existen keystore + metadatos.
  if (fs.existsSync(KEYSTORE_PATH) && fs.existsSync(KEYSTORE_META)) {
    const meta = JSON.parse(fs.readFileSync(KEYSTORE_META, 'utf8')) as KeystoreMeta;
    return {
      keystorePath: KEYSTORE_PATH,
      alias: meta.alias,
      storePassword: meta.storePassword,
      keyPassword: meta.keyPassword,
    };
  }

  emit?.({
    type: 'progress',
    format: 'apk',
    step: 'Generando keystore de firma...',
    pct: 46,
  });

  const password = makePassword();
  const keytool = await locate();

  // keytool -genkeypair: clave RSA 2048, validez larga (release reutilizable).
  const res = await spawnAsync(
    keytool,
    [
      '-genkeypair',
      '-keystore', KEYSTORE_PATH,
      '-alias', ALIAS,
      '-keyalg', 'RSA',
      '-keysize', '2048',
      '-validity', '10000',
      '-storepass', password,
      '-keypass', password,
      '-dname', 'CN=OperaOS, OU=Export, O=OperaOS, L=Madrid, C=ES',
    ],
    { spawn: deps.spawn, platform: deps.platform },
  );

  if (res.exitCode !== 0) {
    throw new Error('keytool -genkeypair fallo: ' + res.stderr.slice(-500));
  }

  const meta: KeystoreMeta = {
    alias: ALIAS,
    storePassword: password,
    keyPassword: password,
  };
  fs.writeFileSync(KEYSTORE_META, JSON.stringify(meta, null, 2), 'utf8');

  return {
    keystorePath: KEYSTORE_PATH,
    alias: ALIAS,
    storePassword: password,
    keyPassword: password,
  };
}
