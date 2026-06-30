/**
 * back/src/lib/export-preflight.ts
 *
 * Toolchain verification before starting each export format.
 * RF-09: If a required binary is missing → return actionable error message.
 *
 * Supported formats:
 *   exe  → electron-builder
 *   apk  → java + (gradle OR gradlew)
 *   ipa  → always ok (platform guard is handled in the ipa builder itself)
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface PreflightResult {
  ok: boolean;
  message: string;
}

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

/** Returns true when the command resolves (exits 0), false otherwise. */
async function commandExists(cmd: string): Promise<boolean> {
  // Use platform-appropriate lookup command.
  const lookup =
    process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`;
  try {
    await execAsync(lookup);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Verify the toolchain required for the given export format.
 *
 * @param format - One of 'exe' | 'apk' | 'ipa'
 * @returns PreflightResult with ok:true when all required tools are found.
 */
export async function checkToolchain(
  format: 'exe' | 'apk' | 'ipa',
): Promise<PreflightResult> {
  switch (format) {
    case 'exe': {
      const found = await commandExists('electron-builder');
      if (!found) {
        return {
          ok: false,
          message:
            'electron-builder no encontrado. Instala con: npm install -g electron-builder',
        };
      }
      return { ok: true, message: 'electron-builder encontrado' };
    }

    case 'apk': {
      const hasJava = await commandExists('java');
      if (!hasJava) {
        return {
          ok: false,
          message:
            'java no encontrado. Instala el JDK 17+ y asegúrate de que esté en el PATH.',
        };
      }
      // Accept either the system gradle or the project wrapper.
      const hasGradle =
        (await commandExists('gradle')) || (await commandExists('gradlew'));
      if (!hasGradle) {
        return {
          ok: false,
          message:
            'gradle / gradlew no encontrado. Instala Gradle o incluye el wrapper en el proyecto.',
        };
      }
      return { ok: true, message: 'java y gradle encontrados' };
    }

    case 'ipa':
      // The ipa builder handles its own platform guard (Windows → format-error).
      // Preflight always passes so the builder can emit the right error event.
      return { ok: true, message: 'ipa preflight ok (plataforma verificada en el builder)' };

    default: {
      const exhaustive: never = format;
      return { ok: false, message: `Formato desconocido: ${String(exhaustive)}` };
    }
  }
}
