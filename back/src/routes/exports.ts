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

import * as path from "node:path";
import * as fs from "node:fs";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { Router } from "express";
import type { Request, Response } from "express";

const execAsync = promisify(exec);
import { prisma } from "../prisma.js";
import {
  startJob as startJobDefault,
  getJob as getJobDefault,
  getActiveJob as getActiveJobDefault,
  cancelJob as cancelJobDefault,
  LockBusyError,
  type BuildFormat,
  type Deliverable,
  type ExportJob,
  type StartJobParams,
} from "../lib/export-job-manager.js";
import type { RuntimeConfig } from "../lib/export-builders/runtime-config-env.js";
import { generateApiKeyToken } from "../middleware/tenant-api-key.js";
import type { TenantConfig } from "../../../shared/generate/tenant-types.js";
import type { AuthedRequest } from "../middleware/types.js";

// ---------------------------------------------------------------------------
// Tipos e inyeccion de dependencias (permite testear handlers sin BD ni lock)
// ---------------------------------------------------------------------------

const VALID_FORMATS: ReadonlySet<string> = new Set<BuildFormat>([
  "web-zip",
  "exe",
  "apk",
  "ipa",
]);

/** crm-export-delivery-profiles: destinatario del ZIP. Default 'binary+source'. */
const VALID_DELIVERABLES: ReadonlySet<string> = new Set<Deliverable>([
  "binary",
  "binary+source",
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
  cancelJob(id: string): boolean;
}

/**
 * crm-export-runtime-config: emisión server-side de una TenantApiKey fresca en
 * el momento de exportar (WU1). Deliberadamente NO se reutiliza una clave
 * existente del negocio: no hay endpoint de lectura de plaintext (solo se
 * persiste `tokenHash`, ver `middleware/tenant-api-key.ts`), así que este
 * change mintea una clave nueva por export y la hornea SOLO en el `.env.local`
 * de ese ZIP — nunca se persiste en claro ni se loguea.
 */
export interface ExportsTenantKeys {
  issueKey(businessId: string): Promise<{ token: string }>;
}

const defaultTenantKeys: ExportsTenantKeys = {
  async issueKey(businessId) {
    const { token, prefix, tokenHash } = generateApiKeyToken();
    await prisma.tenantApiKey.create({
      data: { businessId, tokenHash, prefix, label: "export" },
    });
    return { token };
  },
};

export interface ExportsDeps {
  db: ExportsDb;
  jobs: ExportsJobsApi;
  /**
   * Emisor de TenantApiKey (crm-export-runtime-config). Opcional: si no se
   * inyecta (p. ej. tests unitarios existentes que no lo necesitan), el
   * handler NO toca BD y resuelve `tenantApiKey` como cadena vacía — evita
   * llamadas involuntarias a Prisma real desde deps no relacionados con esto.
   */
  tenantKeys?: ExportsTenantKeys;
}

const defaultDeps: ExportsDeps = {
  db: prisma as unknown as ExportsDb,
  jobs: {
    startJob: (params) => startJobDefault(params),
    getJob: getJobDefault,
    getActiveJob: getActiveJobDefault,
    cancelJob: cancelJobDefault,
  },
  tenantKeys: defaultTenantKeys,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-");
}

// ---------------------------------------------------------------------------
// Handlers (exportados para test unitario con req/res simulados)
// ---------------------------------------------------------------------------

/**
 * GET /pick-folder — abre un selector nativo de carpeta del SO y devuelve la ruta.
 * Solo funciona cuando el back corre localmente (misma maquina que el usuario).
 */
export async function pickFolderHandler(
  _req: Request,
  res: Response,
): Promise<Response> {
  try {
    let command: string;
    if (process.platform === "win32") {
      command = [
        'powershell -sta -NoProfile -Command "',
        "Add-Type -AssemblyName System.Windows.Forms;",
        "$d = New-Object System.Windows.Forms.FolderBrowserDialog;",
        "$d.Description = 'Selecciona carpeta de destino';",
        "if ($d.ShowDialog() -eq 'OK') { $d.SelectedPath } else { '' }\"",
      ].join(" ");
    } else if (process.platform === "darwin") {
      command = `osascript -e 'POSIX path of (choose folder with prompt "Selecciona carpeta de destino")'`;
    } else {
      return res.json({ path: "" });
    }
    const { stdout } = await execAsync(command, { timeout: 60_000 });
    return res.json({ path: stdout.trim() });
  } catch {
    return res.json({ path: "" });
  }
}

/**
 * POST / — valida body/ownership/config, arranca el job en background y responde
 * 202 { jobId }. 409 si el lock esta ocupado.
 */
export function createExportHandler(deps: ExportsDeps) {
  return async function create(
    req: AuthedRequest,
    res: Response,
  ): Promise<Response> {
    // --- Validar body antes de tocar el lock ---
    const {
      projectId,
      formats,
      outputDir: rawOutputDir,
      deliverable: rawDeliverable,
    } = req.body as {
      projectId?: string;
      formats?: unknown[];
      outputDir?: string;
      deliverable?: unknown;
    };

    if (!projectId) {
      return res.status(400).json({
        error: {
          code: "missing_project_id",
          message: "projectId es requerido",
        },
      });
    }

    if (!Array.isArray(formats) || formats.length === 0) {
      return res.status(400).json({
        error: {
          code: "missing_formats",
          message: "formats debe ser un array no vacío",
        },
      });
    }

    const invalidFormat = formats.find((f) => !VALID_FORMATS.has(String(f)));
    if (invalidFormat !== undefined) {
      return res.status(400).json({
        error: {
          code: "invalid_format",
          message: `Formato no válido: ${String(invalidFormat)}. Válidos: web-zip, exe, apk, ipa`,
        },
      });
    }

    const requestedFormats = formats as BuildFormat[];

    // --- Validar deliverable (crm-export-delivery-profiles) ---
    const deliverable: Deliverable =
      rawDeliverable === undefined ? "binary+source" : (rawDeliverable as Deliverable);
    if (!VALID_DELIVERABLES.has(String(deliverable))) {
      return res.status(400).json({
        error: {
          code: "invalid_deliverable",
          message: `deliverable no válido: ${String(rawDeliverable)}. Válidos: binary, binary+source`,
        },
      });
    }

    // --- Verificar ownership ---
    const membership = await deps.db.membership.findFirst({
      where: { businessId: projectId, userId: req.userId! },
    });

    if (!membership) {
      return res.status(404).json({
        error: { code: "not_found", message: "Proyecto no encontrado" },
      });
    }

    // --- Cargar config ---
    const setting = await deps.db.businessSetting.findFirst({
      where: { businessId: projectId, categoria: "config" },
      select: { datos: true },
    });

    if (!setting) {
      return res.status(422).json({
        error: {
          code: "config_not_found",
          message:
            "El proyecto no tiene configuración guardada. Completa el onboarding primero.",
        },
      });
    }

    const config = setting.datos as unknown as TenantConfig;

    // --- Derivar outputDir y frontDir ---
    const slug = toSlug(config.business.name);
    const outputDir = rawOutputDir ?? path.join(process.cwd(), "exports", slug);
    // front/ vive un nivel por encima de back/ (directorio hermano).
    const frontDir = path.resolve(process.cwd(), "..", "front");

    // --- Resolver runtimeConfig (crm-export-runtime-config, design.md §2) ---
    // platformApiUrl: env del propio backend de plataforma (NO del tenant).
    // tenantId: businessId del negocio (identificador real de tenant en este
    // backend; distinto de `config.business.clienteId`, que enlaza con
    // `crm_project.id_cliente` en agents-agency y no es un id de plataforma).
    // tenantApiKey: clave fresca minteada server-side para ESTE export.
    const runtimeConfig: RuntimeConfig = {
      platformApiUrl: process.env.PLATFORM_API_URL ?? "",
      tenantId: projectId,
      tenantApiKey: "",
    };
    if (deps.tenantKeys) {
      try {
        const issued = await deps.tenantKeys.issueKey(projectId);
        runtimeConfig.tenantApiKey = issued.token;
      } catch (e) {
        // Fail-open: un fallo al mintear la clave no bloquea la exportación —
        // el ZIP sale sin TENANT_API_KEY operativa (reemitible después vía el
        // endpoint de operador). Nunca se loguea un valor de clave (aquí no
        // llega a existir ninguno).
        console.error(
          "[exports] no se pudo emitir TenantApiKey para el export:",
          e instanceof Error ? e.message : e,
        );
      }
    }

    // --- Arrancar job (202) o 409 si el lock esta ocupado ---
    try {
      const job = deps.jobs.startJob({
        projectId,
        formats: requestedFormats,
        config,
        outputDir,
        frontDir,
        runtimeConfig,
        deliverable,
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
        error: { code: "job_not_found", message: "Job no encontrado" },
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

/** GET /:id/download — descarga el ZIP de un job terminado (res.download). */
export function downloadHandler(deps: ExportsDeps) {
  return function download(req: Request, res: Response): void {
    const job = deps.jobs.getJob(req.params.id);
    if (!job) {
      res.status(404).json({
        error: { code: "job_not_found", message: "Job no encontrado" },
      });
      return;
    }
    if (job.status !== "done") {
      res.status(400).json({
        error: { code: "job_not_done", message: "La exportación aún no ha terminado" },
      });
      return;
    }
    // El ZIP producido queda en perFormat[*].outputPath; tomamos el primero disponible.
    const outputPath = Object.values(job.perFormat)
      .map((f) => f.outputPath)
      .find((p): p is string => Boolean(p));
    if (!outputPath || !fs.existsSync(outputPath)) {
      res.status(404).json({
        error: { code: "file_not_found", message: "Archivo de exportación no encontrado" },
      });
      return;
    }
    res.download(outputPath);
  };
}

/** DELETE /:id — cancela el job si esta corriendo. */
export function cancelHandler(deps: ExportsDeps) {
  return function cancel(req: Request, res: Response): Response {
    const success = deps.jobs.cancelJob(req.params.id);
    if (!success) {
      return res.status(404).json({
        error: { code: "job_not_cancellable", message: "Job no encontrado o ya finalizado" },
      });
    }
    return res.status(204).end();
  };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export function makeExportsRouter(deps: ExportsDeps = defaultDeps): Router {
  const router = Router();
  // Orden importante: las rutas literales van ANTES de la parametrica /:id/status.
  router.get("/pick-folder", pickFolderHandler);
  router.get("/active", activeHandler(deps));
  router.get("/:id/status", statusHandler(deps));
  router.get("/:id/download", downloadHandler(deps));
  router.delete("/:id", cancelHandler(deps));
  router.post("/", createExportHandler(deps));
  return router;
}

export const exportsRouter = makeExportsRouter();
