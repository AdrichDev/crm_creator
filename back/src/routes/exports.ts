/**
 * back/src/routes/exports.ts
 *
 * Contrato HTTP del exportador (D2 del design):
 *  - POST   /api/exports            → 202 { jobId } | 409 si lock ocupado
 *  - GET    /api/exports/active     → job running/retenido | 204
 *  - GET    /api/exports/:id/status → ExportJob serializado | 404
 *  - GET    /api/exports/pick-folder→ sin cambios (selector nativo de carpeta)
 *
 * RF-01: Requiere Bearer auth (heredado del middleware staffOnly del padre).
 * RF-07: 409 si ya hay un build en curso (lock).
 * RF-08: watchdog de 20 min (delegado en el job manager).
 *
 * Se elimina la respuesta NDJSON: el build corre en background y el front
 * consulta el progreso por polling.
 */

import * as path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { Router } from 'express';
import type { Request, Response } from 'express';

const execAsync = promisify(exec);
import { prisma } from '../prisma.js';
import {
  startJob as startJobDefault,
  getJob as getJobDefault,
  getActiveJob as getActiveJobDefault,
  LockBusyError,
  type BuildFormat,
  type ExportJob,
  type StartJobParams,
} from '../lib/export-job-manager.js';
import type { TenantConfig } from '../../../shared/generate/tenant-types.js';
import type { AuthedRequest } from '../middleware/types.js';

// ---------------------------------------------------------------------------
// Tipos e inyeccion de dependencias (permite testear handlers sin BD ni lock)
// ---------------------------------------------------------------------------

const VALID_FORMATS: ReadonlySet<string> = new Set<BuildFormat>([
  'web-zip',
  'exe',
  'apk',
  'ipa',
]);

/** Subconjunto de Prisma que consumen los handlers. */
export interface ExportsDb {
  membership: {
    findFirst(args: unknown): Promise<{ id: string } | null>;
  };
  businessSetting: {
    findFirst(args: unknown): Promise<{ datos: unknown } | null>;
  };
}

/** API del job manager que consumen los handlers. */
export interface ExportsJobsApi {
  startJob(params: StartJobParams): ExportJob;
  getJob(id: string): ExportJob | undefined;
  getActiveJob(): ExportJob | undefined;
}

export interface ExportsDeps {
  db: ExportsDb;
  jobs: ExportsJobsApi;
}

const defaultDeps: ExportsDeps = {
  db: prisma as unknown as ExportsDb,
  jobs: {
    startJob: (params) => startJobDefault(params),
    getJob: getJobDefault,
    getActiveJob: getActiveJobDefault,
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

// ---------------------------------------------------------------------------
// Handlers (exportados para test unitario con req/res simulados)
// ---------------------------------------------------------------------------

/**
 * GET /pick-folder — abre un selector nativo de carpeta del SO y devuelve la ruta.
 * Solo funciona cuando el back corre localmente (misma maquina que el usuario).
 */
export async function pickFolderHandler(_req: Request, res: Response): Promise<Response> {
  try {
    let command: string;
    if (process.platform === 'win32') {
      command = [
        'powershell -sta -NoProfile -Command "',
        'Add-Type -AssemblyName System.Windows.Forms;',
        '$f = New-Object System.Windows.Forms.Form;',
        '$f.TopMost = $true;',
        '$f.Show();',
        '$f.Hide();',
        '$d = New-Object System.Windows.Forms.FolderBrowserDialog;',
        "$d.Description = 'Selecciona carpeta de destino';",
        "if ($d.ShowDialog($f) -eq 'OK') { $d.SelectedPath } else { '' }\"",
      ].join(' ');
    } else if (process.platform === 'darwin') {
      command = `osascript -e 'POSIX path of (choose folder with prompt "Selecciona carpeta de destino")'`;
    } else {
      console.log("[pickFolderHandler] Unsupported platform:", process.platform);
      return res.json({ path: '' });
    }
    console.log("[pickFolderHandler] Executing command:", command);
    const { stdout } = await execAsync(command, { timeout: 60_000 });
    console.log("[pickFolderHandler] Success, path:", stdout.trim());
    return res.json({ path: stdout.trim() });
  } catch (err) {
    console.error("[pickFolderHandler] Error:", err);
    return res.json({ path: '' });
  }
}

/**
 * POST / — valida body/ownership/config, arranca el job en background y responde
 * 202 { jobId }. 409 si el lock esta ocupado.
 */
export function createExportHandler(deps: ExportsDeps) {
  return async function create(req: AuthedRequest, res: Response): Promise<Response> {
    // --- Validar body antes de tocar el lock ---
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

    // --- Verificar ownership ---
    const membership = await deps.db.membership.findFirst({
      where: { businessId: projectId, userId: req.userId! },
    });

    if (!membership) {
      return res.status(404).json({
        error: { code: 'not_found', message: 'Proyecto no encontrado' },
      });
    }

    // --- Cargar config ---
    const setting = await deps.db.businessSetting.findFirst({
      where: { businessId: projectId, categoria: 'config' },
      select: { datos: true },
    });

    if (!setting) {
      return res.status(422).json({
        error: {
          code: 'config_not_found',
          message:
            'El proyecto no tiene configuración guardada. Completa el onboarding primero.',
        },
      });
    }

    const config = setting.datos as unknown as TenantConfig;

    // --- Derivar outputDir y frontDir ---
    const slug = toSlug(config.business.name);
    const outputDir = rawOutputDir ?? path.join(process.cwd(), 'exports', slug);
    // front/ vive un nivel por encima de back/ (directorio hermano).
    const frontDir = path.resolve(process.cwd(), '..', 'front');

    // --- Arrancar job (202) o 409 si el lock esta ocupado ---
    try {
      const job = deps.jobs.startJob({
        projectId,
        formats: requestedFormats,
        config,
        outputDir,
        frontDir,
      });
      return res.status(202).json({ jobId: job.id });
    } catch (err) {
      if (err instanceof LockBusyError) {
        return res.status(409).json({
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  };
}

/** GET /:id/status — devuelve el ExportJob serializado o 404. */
export function statusHandler(deps: ExportsDeps) {
  return function status(req: Request, res: Response): Response {
    const job = deps.jobs.getJob(req.params.id);
    if (!job) {
      return res.status(404).json({
        error: { code: 'job_not_found', message: 'Job no encontrado' },
      });
    }
    return res.status(200).json(job);
  };
}

/** GET /active — job en curso o ultimo terminado en retencion; 204 si no hay. */
export function activeHandler(deps: ExportsDeps) {
  return function active(_req: Request, res: Response): Response {
    const job = deps.jobs.getActiveJob();
    if (!job) {
      return res.status(204).end();
    }
    return res.status(200).json(job);
  };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export function makeExportsRouter(deps: ExportsDeps = defaultDeps): Router {
  const router = Router();
  // Orden importante: las rutas literales van ANTES de la parametrica /:id/status.
  router.get('/pick-folder', pickFolderHandler);
  router.get('/active', activeHandler(deps));
  router.get('/:id/status', statusHandler(deps));
  router.post('/', createExportHandler(deps));
  return router;
}

export const exportsRouter = makeExportsRouter();
