/**
 * back/src/lib/export-temp-copy.ts
 *
 * Temporary working copy of the front/ project for export builds.
 *
 * RF-04 / RF-05: Copy front/ → back/tmp/build-<uuid>/, inject NEXT_PUBLIC_TENANT_JSON,
 * then clean up in finally.  Never touches front/ originals.
 *
 * RNF-04: The copy function NEVER writes to the source frontDir or front/.next.
 */

import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import type { TenantConfig } from '../../../shared/generate/tenant-types';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a temporary copy of the front directory for a build.
 *
 * @param frontDir - Absolute path to the front/ directory.
 * @param tenantConfig - Tenant configuration to bake in via .env.local.
 * @returns Absolute path to the temporary copy (back/tmp/build-<uuid>/).
 */
export async function createTempCopy(
  frontDir: string,
  tenantConfig: TenantConfig,
): Promise<string> {
  const tmpDir = path.join(process.cwd(), 'tmp', `build-${randomUUID()}`);

  // Ensure the tmp parent directory exists.
  fs.mkdirSync(path.dirname(tmpDir), { recursive: true });

  // Copy front/ to the temp directory, skipping build artifacts and VCS data.
  const excluded = new Set(['node_modules', '.next', '.git']);

  fs.cpSync(frontDir, tmpDir, {
    recursive: true,
    filter: (src: string) => {
      const base = path.basename(src);
      return !excluded.has(base);
    },
  });

  // Write .env.local with the baked tenant config.
  const envContent = `NEXT_PUBLIC_TENANT_JSON=${JSON.stringify(tenantConfig)}\n`;
  fs.writeFileSync(path.join(tmpDir, '.env.local'), envContent, 'utf8');

  return tmpDir;
}

/**
 * Remove the temporary build directory.
 * Must be called in a finally block to guarantee cleanup.
 *
 * Safe to call even if tmpDir does not exist.
 * NEVER touches the original frontDir.
 *
 * @param tmpDir - Absolute path returned by createTempCopy().
 */
export function cleanupTempCopy(tmpDir: string): void {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // Best-effort: log but do not throw so the finally block never crashes.
    console.warn(`[export-temp-copy] Could not remove ${tmpDir}`);
  }
}
