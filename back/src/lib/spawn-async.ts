/**
 * back/src/lib/spawn-async.ts
 *
 * Spawn compartido para los builders de exportacion (D10 del design).
 *
 * Extrae la logica duplicada de exe.ts / apk.ts en una unica utilidad.
 *
 * Fix Windows: en win32, los comandos que en realidad son scripts `.cmd`/`.bat`
 * (npx, npm, electron-builder, gradlew.bat, cap...) NO se pueden lanzar con
 * `spawn(cmd, args, { shell: false })` porque el sistema busca un ejecutable
 * nativo y falla con ENOENT. Se envuelven via `cmd.exe /d /s /c "<linea>"`.
 *
 * Bug corregido (gate 4.V): la ruta del repo contiene espacios
 * (`D:\Adrian\22. Proyectos\...`) y `-c.productName="EDM San Blas"` tambien
 * trae espacios. `spawn('cmd', ['/c', cmd, ...args])` NO entrecomilla nada:
 * cmd.exe trocea por espacios y ve `"D:\Adrian\22."` como comando suelto →
 * "no se reconoce como un comando interno o externo". Ahora se construye la
 * linea completa entrecomillando cada pieza que lo necesite (ejecutable y
 * args por igual) y se pasa como UN SOLO argumento a `cmd.exe /d /s /c`, con
 * `windowsVerbatimArguments: true` para que Node NO vuelva a entrecomillar
 * (duplicaria el escapado y rompería el parseo). `/s` cambia el modo de
 * "quote stripping" de cmd.exe: sin el, si la linea empieza y termina en
 * comilla, cmd.exe se comeria las comillas exteriores y volveria a romper el
 * parseo con rutas/valores que contienen espacios. `/d` evita ejecutar
 * AutoRun de cmd.exe (higiene, no afecta al bug).
 *
 * `shell: false` en TODAS las llamadas (RNF-02): el envoltorio con
 * `cmd.exe /d /s /c` es explicito, no delega en la interpolacion de un shell.
 */

import { spawn as nodeSpawn } from 'node:child_process';

// ---------------------------------------------------------------------------
// Tipos publicos
// ---------------------------------------------------------------------------

export interface SpawnAsyncOpts {
  /** Directorio de trabajo del proceso hijo. */
  cwd?: string;
  /** Entorno para el proceso hijo (por defecto hereda process.env). */
  env?: NodeJS.ProcessEnv;
  /** Señal de aborto: dispara SIGTERM y luego SIGKILL a los 3s. */
  signal?: AbortSignal;
  /** Callback por cada trozo de stdout (para progreso granular). */
  onData?: (chunk: string) => void;
  /**
   * Datos a escribir por STDIN del proceso hijo (y luego cerrar stdin).
   * Usado para tuberias tipo `yes | sdkmanager --licenses` (aceptar licencias
   * respondiendo "y" a cada prompt) sin depender de un shell.
   */
  stdinData?: string;
  /** Plataforma (inyectable en test). Por defecto process.platform. */
  platform?: NodeJS.Platform;
  /** spawn inyectable (para test). Por defecto node:child_process spawn. */
  spawn?: typeof nodeSpawn;
}

export interface SpawnAsyncResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

// ---------------------------------------------------------------------------
// Deteccion de comandos que requieren cmd /c en Windows
// ---------------------------------------------------------------------------

/** Herramientas sin extension que en Windows son en realidad `.cmd`. */
const CMD_TOOLS = new Set([
  'npm',
  'npx',
  'yarn',
  'pnpm',
  'electron-builder',
  'cap',
]);

/**
 * Determina si un comando debe invocarse via `cmd /c` en Windows.
 * Cubre extensiones `.cmd`/`.bat` (p.ej. gradlew.bat) y binarios de node_modules
 * que se distribuyen como shim `.cmd` (npx, npm, electron-builder...).
 */
export function needsCmd(cmd: string): boolean {
  if (/\.(cmd|bat)$/i.test(cmd)) return true;
  const base = cmd.split(/[\\/]/).pop() ?? cmd;
  return CMD_TOOLS.has(base);
}

// ---------------------------------------------------------------------------
// Construccion de la linea de comando para cmd.exe /d /s /c
// ---------------------------------------------------------------------------

/** Una pieza necesita entrecomillarse si esta vacia o contiene espacio/comilla. */
function needsQuoting(piece: string): boolean {
  return piece.length === 0 || /[\s"]/.test(piece);
}

/**
 * Entrecomilla un argumento siguiendo las reglas de escapado tipo MSVCRT
 * (las mismas que usa el parseo de argv en Windows): duplica los backslashes
 * que preceden a una comilla interna y la escapa, y duplica los backslashes
 * finales antes de la comilla de cierre para que no "escapen" esta ultima.
 *
 * Si la pieza no necesita comillas (sin espacios ni comillas) se devuelve
 * intacta, para que la linea resultante siga siendo legible en logs de error.
 */
export function quoteWindowsArg(piece: string): string {
  if (!needsQuoting(piece)) return piece;
  const escaped = piece
    .replace(/(\\*)"/g, '$1$1\\"')
    .replace(/(\\*)$/, '$1$1');
  return `"${escaped}"`;
}

/**
 * Construye la linea `"<cmd>" "<arg1>" "<arg2>"...` (sin el envoltorio
 * exterior de `cmd.exe /d /s /c`). Cada pieza (ejecutable incluido) se
 * entrecomilla si contiene espacios o comillas, de modo que un valor con
 * espacios (ruta del repo, `-c.productName=EDM San Blas`, etc.) llega SIEMPRE
 * como un unico argumento al proceso final.
 */
export function buildWindowsCommandLine(cmd: string, args: string[]): string {
  return [cmd, ...args].map(quoteWindowsArg).join(' ');
}

/**
 * Envuelve la linea de `buildWindowsCommandLine` en UN par adicional de
 * comillas exteriores — el mismo patron que usa internamente Node para
 * `child_process` con `shell:true` en Windows (`lib/child_process.js`,
 * `normalizeSpawnArguments`): `/c "<comando> <args...>"`.
 *
 * Sin este envoltorio exterior, cmd.exe puede fallar al reconocer el primer
 * token aunque ya vaya entrecomillado individualmente (bug real del gate 4.V,
 * reproducido con un .cmd de fixture en un directorio con espacio en el
 * nombre): el tokenizado de cmd.exe para `/c` espera que TODO lo que sigue
 * sea una unica cadena entre comillas cuando `/s` esta activo.
 */
export function wrapWindowsCommandLine(cmd: string, args: string[]): string {
  return `"${buildWindowsCommandLine(cmd, args)}"`;
}

// ---------------------------------------------------------------------------
// API publica
// ---------------------------------------------------------------------------

/**
 * Lanza un proceso hijo con `shell: false`, capturando stdout/stderr y
 * respetando el AbortSignal. En Windows envuelve los scripts `.cmd`/`.bat`
 * en `cmd.exe /d /s /c "<linea entrecomillada>"` (ver cabecera del fichero:
 * necesario porque el ejecutable o los args pueden traer espacios).
 *
 * A diferencia de un `spawnAsync` clasico, NO rechaza ante exit code != 0:
 * devuelve `{ exitCode, stdout, stderr }` y deja que el llamante decida.
 */
export async function spawnAsync(
  cmd: string,
  args: string[],
  opts: SpawnAsyncOpts = {},
): Promise<SpawnAsyncResult> {
  const platform = opts.platform ?? process.platform;
  const spawnFn = opts.spawn ?? nodeSpawn;

  const useCmdWrapper = platform === 'win32' && needsCmd(cmd);

  const realCmd = useCmdWrapper ? 'cmd.exe' : cmd;
  const realArgs = useCmdWrapper
    ? ['/d', '/s', '/c', wrapWindowsCommandLine(cmd, args)]
    : args;

  return new Promise<SpawnAsyncResult>((resolve, reject) => {
    const child = spawnFn(realCmd, realArgs, {
      cwd: opts.cwd,
      shell: false,
      stdio: 'pipe',
      env: opts.env ?? process.env,
      // OBLIGATORIO con la linea ya entrecomillada a mano: si Node volviera a
      // aplicar su propio quoting por encima, duplicaria el escapado y
      // cmd.exe dejaria de reconocer el comando (el bug original del gate 4.V).
      ...(useCmdWrapper ? { windowsVerbatimArguments: true } : {}),
    });

    // STDIN: para pipes tipo `yes | sdkmanager --licenses`. Se escribe todo el
    // buffer de respuestas y se cierra para que el proceso hijo no se cuelgue
    // esperando mas entrada.
    if (opts.stdinData !== undefined) {
      try {
        child.stdin?.write(opts.stdinData);
        child.stdin?.end();
      } catch {
        /* stdin ya cerrado o proceso muerto: nada que hacer */
      }
    }

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      opts.onData?.(text);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    let aborted = false;
    if (opts.signal) {
      const onAbort = (): void => {
        aborted = true;
        try { child.kill('SIGTERM'); } catch { /* ya muerto */ }
        setTimeout(() => {
          try { child.kill('SIGKILL'); } catch { /* ya muerto */ }
        }, 3000);
      };
      if (opts.signal.aborted) onAbort();
      else opts.signal.addEventListener('abort', onAbort, { once: true });
    }

    child.on('error', (err: Error) => reject(err));
    child.on('close', (code: number | null) => {
      resolve({ exitCode: code ?? (aborted ? 1 : 0), stdout, stderr });
    });
  });
}
