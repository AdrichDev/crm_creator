/**
 * back/src/lib/export-builders/ipa.ts
 *
 * IPA builder stub.
 * RF-06: IPA on Windows → immediate format-error event, no process started, no FS access.
 * Platform guard lives here (not in preflight), per spec.
 *
 * NEVER throws an exception. NEVER touches the filesystem on non-macOS platforms.
 */

import type { Emitter, BuildResult } from './web-zip.js';

export type { Emitter, BuildResult };

/**
 * Attempt to build an IPA archive.
 *
 * On non-macOS platforms: emits a format-error event and returns failure immediately.
 * On macOS: emits a format-error event for the not-yet-implemented build path.
 */
export async function buildIpa(emit: Emitter): Promise<BuildResult> {
  if (process.platform !== 'darwin') {
    emit({
      type: 'format-error',
      format: 'ipa',
      message: 'Requiere macOS. Este servidor corre en ' + process.platform,
    });
    return { success: false, error: 'Requiere macOS' };
  }

  // macOS stub — build IPA via Xcode / fastlane is pending implementation.
  emit({
    type: 'format-error',
    format: 'ipa',
    message: 'Build IPA en macOS: pendiente de implementar',
  });
  return { success: false, error: 'Pendiente' };
}
