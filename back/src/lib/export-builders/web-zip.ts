/**
 * back/src/lib/export-builders/web-zip.ts
 *
 * Builds a downloadable ZIP containing schema.sql, schema.prisma, and manifest.json.
 * RF-03: web-zip = ZIP(manifest+sql+prisma), no next build required.
 *
 * Also re-exports ProgressEvent, BuildResult, and Emitter types used by all builders.
 */

import JSZip from 'jszip';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildSql } from '../../../../shared/generate/build-sql.js';
import { buildPrisma } from '../../../../shared/generate/build-prisma.js';
import { buildManifest } from '../../../../shared/generate/build-manifest.js';
import type { TenantConfig } from '../../../../shared/generate/tenant-types.js';

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

function toSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a ZIP archive containing the generated SQL schema, Prisma models,
 * and manifest for the given tenant configuration.
 *
 * @param config    - Tenant configuration to generate artifacts from.
 * @param outputDir - Directory where the resulting .zip will be written.
 * @param emit      - Event emitter for streaming progress to the client.
 */
export async function buildWebZip(
  config: TenantConfig,
  outputDir: string,
  emit: Emitter,
): Promise<BuildResult> {
  try {
    emit({ type: 'progress', format: 'web-zip', step: 'Generando SQL...', pct: 15 });
    const sql = buildSql(config);

    emit({ type: 'progress', format: 'web-zip', step: 'Generando modelos Prisma...', pct: 35 });
    const prismaSchema = buildPrisma(config);

    emit({ type: 'progress', format: 'web-zip', step: 'Generando manifest...', pct: 55 });
    const manifest = buildManifest(config);

    emit({ type: 'progress', format: 'web-zip', step: 'Comprimiendo ZIP...', pct: 75 });
    const zip = new JSZip();
    zip.file('schema.sql', sql);
    zip.file('schema.prisma', prismaSchema);
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));

    emit({ type: 'progress', format: 'web-zip', step: 'Guardando archivo...', pct: 95 });
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    fs.mkdirSync(outputDir, { recursive: true });

    const slug = toSlug(config.business.name);
    const outputPath = path.join(outputDir, `${slug}.zip`);
    fs.writeFileSync(outputPath, zipBuffer);

    return { success: true, outputPath };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { success: false, error };
  }
}
