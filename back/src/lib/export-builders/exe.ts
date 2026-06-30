/**
 * back/src/lib/export-builders/exe.ts
 *
 * Builds a portable Windows .exe via electron-builder.
 * RF-05: exe = createTempCopy → next build → electron-builder --win --portable → copy artifact.
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
 * Build a portable Windows .exe for the given tenant configuration.
 *
 * @param config    - Tenant configuration baked into the copied front project.
 * @param frontDir  - Absolute path to the front/ project directory.
 * @param outputDir - Directory where the resulting .exe will be placed.
 * @param emit      - Event emitter for streaming progress to the client.
 * @param signal    - Optional AbortSignal to cancel the build mid-flight.
 */
export async function buildExe(
  config: TenantConfig,
  frontDir: string,
  outputDir: string,
  emit: Emitter,
  signal?: AbortSignal,
): Promise<BuildResult> {
  // Preflight: ensure electron-builder is available.
  const preflight = await checkToolchain('exe');
  if (!preflight.ok) {
    emit({ type: 'format-error', format: 'exe', message: preflight.message });
    return { success: false, error: preflight.message };
  }

  let tmpDir: string | undefined;

  try {
    emit({ type: 'progress', format: 'exe', step: 'Copiando proyecto...', pct: 5 });
    tmpDir = await createTempCopy(frontDir, config);

    emit({ type: 'progress', format: 'exe', step: 'Compilando (next build)...', pct: 10 });

    // Gradually advance pct from 10 to 60 as stdout lines arrive.
    let nextPct = 10;
    const { exitCode: nextCode, stderr: nextStderr } = await spawnAsync(
      'npx',
      ['next', 'build', '--no-lint'],
      {
        cwd: tmpDir,
        signal,
        onStdoutLine: () => {
          if (nextPct < 60) {
            nextPct = Math.min(60, nextPct + 2);
            emit({
              type: 'progress',
              format: 'exe',
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

    emit({
      type: 'progress',
      format: 'exe',
      step: 'Empaquetando .exe (electron-builder)...',
      pct: 60,
    });

    const { exitCode: ebCode, stderr: ebStderr } = await spawnAsync(
      'npx',
      ['electron-builder', '--win', '--portable', '--projectDir', tmpDir],
      { cwd: tmpDir, signal },
    );

    if (ebCode !== 0) {
      throw new Error('electron-builder failed: ' + ebStderr.slice(-500));
    }

    emit({ type: 'progress', format: 'exe', step: 'Copiando artefacto...', pct: 95 });

    // Locate the generated .exe in tmpDir/dist/
    const distDir = path.join(tmpDir, 'dist');
    const distFiles = fs.readdirSync(distDir);
    const exeFile = distFiles.find((f) => f.endsWith('.exe'));
    if (!exeFile) {
      throw new Error('No .exe file found in ' + distDir);
    }

    fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, exeFile);
    fs.copyFileSync(path.join(distDir, exeFile), outputPath);

    return { success: true, outputPath };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    emit({ type: 'format-error', format: 'exe', message: error });
    return { success: false, error };
  } finally {
    // Always clean up the temporary directory — even on error or abort.
    if (tmpDir) {
      cleanupTempCopy(tmpDir);
    }
  }
}
