/**
 * back/src/routes/exports.ts
 *
 * POST /api/exports — trigger a multi-format export build with NDJSON streaming.
 *
 * RF-01: Requires Bearer auth (inherited from parent staffOnly middleware).
 * RF-02: Response is application/x-ndjson, one JSON event per line.
 * RF-07: 409 if a build is already in progress.
 * RF-08: 20-minute watchdog aborts stalled builds.
 * RF-09: Preflight toolchain check per builder (delegated to builders).
 */

import * as path from 'node:path';
import { Router } from 'express';
import type { Response } from 'express';
import { prisma } from '../prisma.js';
import { acquireLock, releaseLock, startWatchdog } from '../lib/export-lock.js';
import { buildWebZip } from '../lib/export-builders/web-zip.js';
import { buildIpa } from '../lib/export-builders/ipa.js';
import { buildExe } from '../lib/export-builders/exe.js';
import { buildApk } from '../lib/export-builders/apk.js';
import type { TenantConfig } from '../../../shared/generate/tenant-types.js';
import type { AuthedRequest } from '../middleware/types.js';

export const exportsRouter = Router();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BuildFormat = 'web-zip' | 'exe' | 'apk' | 'ipa';

const VALID_FORMATS: ReadonlySet<string> = new Set<BuildFormat>([
  'web-zip',
  'exe',
  'apk',
  'ipa',
]);

interface ProgressEvent {
  type: string;
  format?: string;
  step?: string;
  pct?: number;
  outputPath?: string;
  message?: string;
  results?: unknown[];
}

interface FormatResult {
  format: BuildFormat;
  success: boolean;
  outputPath?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

// ---------------------------------------------------------------------------
// POST /
// ---------------------------------------------------------------------------

/**
 * Body: { projectId: string, formats: BuildFormat[], outputDir?: string }
 *
 * Streams NDJSON events:
 *  { type: 'format-start', format }
 *  { type: 'progress', format, step, pct }
 *  { type: 'format-done', format, outputPath }
 *  { type: 'format-error', format, message }
 *  { type: 'complete', results }
 *  { type: 'fatal', message }
 */
exportsRouter.post('/', async (req: AuthedRequest, res: Response) => {
  // --- Validate body before acquiring lock ---

  const { projectId, formats, outputDir: rawOutputDir } = req.body as {
    projectId?: string;
    formats?: unknown[];
    outputDir?: string;
  };

  if (!projectId) {
    return res.status(400).json({
      error: { code: 'missing_project_id', message: 'projectId es requerido' },
    });
  }

  if (!Array.isArray(formats) || formats.length === 0) {
    return res.status(400).json({
      error: { code: 'missing_formats', message: 'formats debe ser un array no vacío' },
    });
  }

  const invalidFormat = formats.find((f) => !VALID_FORMATS.has(String(f)));
  if (invalidFormat !== undefined) {
    return res.status(400).json({
      error: {
        code: 'invalid_format',
        message: `Formato no válido: ${String(invalidFormat)}. Válidos: web-zip, exe, apk, ipa`,
      },
    });
  }

  const requestedFormats = formats as BuildFormat[];

  // --- Verify ownership ---

  const membership = await prisma.membership.findFirst({
    where: { businessId: projectId, userId: req.userId! },
  });

  if (!membership) {
    return res.status(404).json({
      error: { code: 'not_found', message: 'Proyecto no encontrado' },
    });
  }

  // --- Load config ---

  const setting = await prisma.businessSetting.findFirst({
    where: { businessId: projectId, categoria: 'config' },
    select: { datos: true },
  });

  if (!setting) {
    return res.status(422).json({
      error: {
        code: 'config_not_found',
        message: 'El proyecto no tiene configuración guardada. Completa el onboarding primero.',
      },
    });
  }

  const config = setting.datos as unknown as TenantConfig;

  // --- Derive outputDir ---

  const slug = toSlug(config.business.name);
  const outputDir = rawOutputDir ?? path.join(process.cwd(), 'exports', slug);

  // front/ lives one level above back/ (sibling directory)
  const frontDir = path.resolve(process.cwd(), '..', 'front');

  // --- Acquire build lock (RF-07) ---

  const locked = acquireLock();
  if (!locked) {
    return res.status(409).json({
      error: {
        code: 'build_in_progress',
        message: 'Ya hay un build en curso. Espera a que termine.',
      },
    });
  }

  // --- Set NDJSON streaming headers ---

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.flushHeaders();

  // --- Emit helper ---

  const emit = (event: ProgressEvent): void => {
    if (!res.writableEnded) {
      res.write(JSON.stringify(event) + '\n');
    }
  };

  // --- Watchdog (RF-08): abort after 20 minutes ---

  const controller = new AbortController();
  startWatchdog(controller, () => {
    emit({ type: 'fatal', message: 'Timeout 20min — build abortado por el servidor' });
    res.end();
  });

  // --- Run builders ---

  const results: FormatResult[] = [];

  try {
    for (const format of requestedFormats) {
      emit({ type: 'format-start', format });

      let result: FormatResult;

      try {
        switch (format) {
          case 'web-zip': {
            const r = await buildWebZip(config, outputDir, emit);
            result = r.success
              ? { format, success: true, outputPath: r.outputPath }
              : { format, success: false, error: r.error };
            break;
          }

          case 'ipa': {
            const r = await buildIpa(emit);
            result = r.success
              ? { format, success: true, outputPath: r.outputPath }
              : { format, success: false, error: r.error };
            break;
          }

          case 'exe': {
            const r = await buildExe(
              config,
              frontDir,
              outputDir,
              emit,
              controller.signal,
            );
            result = r.success
              ? { format, success: true, outputPath: r.outputPath }
              : { format, success: false, error: r.error };
            break;
          }

          case 'apk': {
            const r = await buildApk(
              config,
              frontDir,
              outputDir,
              emit,
              controller.signal,
            );
            result = r.success
              ? { format, success: true, outputPath: r.outputPath }
              : { format, success: false, error: r.error };
            break;
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        emit({ type: 'format-error', format, message });
        result = { format, success: false, error: message };
      }

      results.push(result);

      if (result.success) {
        emit({ type: 'format-done', format, outputPath: result.outputPath });
      }
    }

    emit({ type: 'complete', results });
  } finally {
    // Always release the lock and end the response.
    releaseLock();
    res.end();
  }
});
