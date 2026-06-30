/**
 * back/src/lib/export-builders/apk.ts
 *
 * Builds an Android .apk via Capacitor + Gradle.
 * RF-04: apk = createTempCopy → next build → cap sync android → gradlew assembleRelease → copy.
 *
 * RNF-02: shell: false in ALL spawn calls.
 * spawnAsync is implemented inline (no separate utility file).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { checkToolchain } from '../export-preflight.js';
import { createTempCopy, cleanupTempCopy } from '../export-temp-copy.js';
import type { TenantConfig } from '../../../../shared/generate/tenant-types.js';
import type { Emitter, BuildResult } from './web-zip.js';

export type { Emitter, BuildResult };

// ---------------------------------------------------------------------------
// Internal: spawnAsync
// ---------------------------------------------------------------------------

interface SpawnOpts {
  cwd?: string;
  signal?: AbortSignal;
  onStdoutLine?: (line: string) => void;
}

interface SpawnResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Spawn a child process with shell: false, capturing stdout/stderr.
 * Abort signal triggers SIGTERM followed by SIGKILL after 3 seconds.
 */
async function spawnAsync(
  cmd: string,
  args: string[],
  opts: SpawnOpts = {},
): Promise<SpawnResult> {
  return new Promise<SpawnResult>((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      shell: false,
      stdio: 'pipe',
    });

    let stdoutBuf = '';
    let stderrBuf = '';
    let lineBuffer = '';

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stdoutBuf += text;
      if (opts.onStdoutLine) {
        lineBuffer += text;
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() ?? '';
        for (const line of lines) {
          opts.onStdoutLine(line);
        }
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderrBuf += chunk.toString();
    });

    let aborted = false;

    if (opts.signal) {
      const onAbort = (): void => {
        aborted = true;
        try { child.kill('SIGTERM'); } catch { /* process may already be gone */ }
        setTimeout(() => {
          try { child.kill('SIGKILL'); } catch { /* already dead */ }
        }, 3000);
      };

      if (opts.signal.aborted) {
        onAbort();
      } else {
        opts.signal.addEventListener('abort', onAbort, { once: true });
      }
    }

    child.on('error', (err) => reject(err));

    child.on('close', (code) => {
      void aborted; // suppress unused warning — used for SIGKILL side effect
      resolve({
        exitCode: code ?? (aborted ? 1 : 0),
        stdout: stdoutBuf,
        stderr: stderrBuf,
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build an Android .apk for the given tenant configuration.
 *
 * @param config    - Tenant configuration baked into the copied front project.
 * @param frontDir  - Absolute path to the front/ project directory.
 * @param outputDir - Directory where the resulting .apk will be placed.
 * @param emit      - Event emitter for streaming progress to the client.
 * @param signal    - Optional AbortSignal to cancel the build mid-flight.
 */
export async function buildApk(
  config: TenantConfig,
  frontDir: string,
  outputDir: string,
  emit: Emitter,
  signal?: AbortSignal,
): Promise<BuildResult> {
  // Preflight: ensure java and gradle/gradlew are available.
  const preflight = await checkToolchain('apk');
  if (!preflight.ok) {
    emit({ type: 'format-error', format: 'apk', message: preflight.message });
    return { success: false, error: preflight.message };
  }

  let tmpDir: string | undefined;

  try {
    emit({ type: 'progress', format: 'apk', step: 'Copiando proyecto...', pct: 5 });
    tmpDir = await createTempCopy(frontDir, config);

    // Step 1: next build (pct 10 → 40)
    emit({ type: 'progress', format: 'apk', step: 'Compilando (next build)...', pct: 10 });

    let nextPct = 10;
    const { exitCode: nextCode, stderr: nextStderr } = await spawnAsync(
      'npx',
      ['next', 'build', '--no-lint'],
      {
        cwd: tmpDir,
        signal,
        onStdoutLine: () => {
          if (nextPct < 40) {
            nextPct = Math.min(40, nextPct + 2);
            emit({
              type: 'progress',
              format: 'apk',
              step: 'Compilando (next build)...',
              pct: nextPct,
            });
          }
        },
      },
    );

    if (nextCode !== 0) {
      throw new Error('next build failed: ' + nextStderr.slice(-500));
    }

    // Step 2: Capacitor sync (pct 40 → 50)
    emit({ type: 'progress', format: 'apk', step: 'Sincronizando Capacitor...', pct: 40 });

    const { exitCode: capCode, stderr: capStderr } = await spawnAsync(
      'npx',
      ['cap', 'sync', 'android'],
      { cwd: tmpDir, signal },
    );

    if (capCode !== 0) {
      throw new Error('cap sync android failed: ' + capStderr.slice(-500));
    }

    // Step 3: Gradle assembleRelease (pct 50 → 90)
    emit({ type: 'progress', format: 'apk', step: 'Compilando APK (Gradle)...', pct: 50 });

    const androidDir = path.join(tmpDir, 'android');

    // Use gradlew.bat on Windows (shell: false requires the bat shim via cmd),
    // or ./gradlew on Unix. Always append --no-daemon.
    let gradlePct = 50;
    const isWin = process.platform === 'win32';
    const gradleCmd = isWin ? 'cmd' : './gradlew';
    const gradleArgs = isWin
      ? ['/c', 'gradlew.bat', 'assembleRelease', '--no-daemon']
      : ['assembleRelease', '--no-daemon'];

    const { exitCode: gradleCode, stderr: gradleStderr } = await spawnAsync(
      gradleCmd,
      gradleArgs,
      {
        cwd: androidDir,
        signal,
        onStdoutLine: () => {
          if (gradlePct < 90) {
            gradlePct = Math.min(90, gradlePct + 2);
            emit({
              type: 'progress',
              format: 'apk',
              step: 'Compilando APK (Gradle)...',
              pct: gradlePct,
            });
          }
        },
      },
    );

    if (gradleCode !== 0) {
      throw new Error('gradlew assembleRelease failed: ' + gradleStderr.slice(-500));
    }

    emit({ type: 'progress', format: 'apk', step: 'Copiando artefacto...', pct: 95 });

    // Locate the generated .apk
    const apkDir = path.join(
      tmpDir,
      'android',
      'app',
      'build',
      'outputs',
      'apk',
      'release',
    );
    const apkFiles = fs.readdirSync(apkDir);
    const apkFile = apkFiles.find((f) => f.endsWith('.apk'));
    if (!apkFile) {
      throw new Error('No .apk file found in ' + apkDir);
    }

    fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, apkFile);
    fs.copyFileSync(path.join(apkDir, apkFile), outputPath);

    return { success: true, outputPath };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    emit({ type: 'format-error', format: 'apk', message: error });
    return { success: false, error };
  } finally {
    // Always clean up the temporary directory — even on error or abort.
    if (tmpDir) {
      cleanupTempCopy(tmpDir);
    }
  }
}
