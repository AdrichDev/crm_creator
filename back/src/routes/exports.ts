/**
 * back/src/routes/exports.ts
 *
 * Contrato HTTP del exportador (D2 del design):
 *  - POST   /api/exports                    → 202 { jobId } | 409 si lock ocupado
 *  - GET    /api/exports/active             → job running/retenido | 204
 *  - GET    /api/exports/versions           → historial de versiones (crm-generator-versiones-historico)
 *  - GET    /api/exports/versions/:id/download → URL firmada de una version concreta
 *  - GET    /api/exports/:id/status         → ExportJob serializado | 404
 *  - GET    /api/exports/pick-folder        → sin cambios (selector nativo de carpeta)
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
import { randomUUID } from "node:crypto";
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
  type ExportJob,
  type StartJobParams,
} from "../lib/export-job-manager.js";
import type { RuntimeConfig } from "../lib/export-builders/runtime-config-env.js";
import { env } from "../env.js";
import {
  type PublicEnvSecret,
} from "../lib/export-builders/public-env-secrets.js";
import { readBakeableSecrets } from "../lib/tenant-secrets/store.js";
import { generateApiKeyToken } from "../middleware/tenant-api-key.js";
import {
  zipDirectoryToBuffer,
  uploadExportArtifact,
  signExportUrl,
} from "../lib/storage-exports.js";
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

/** Fila de `ExportVersion` tal como la devuelve Prisma (subconjunto usado aqui). */
export interface ExportVersionRow {
  id: string;
  businessId: string;
  version: string;
  changeNote: string | null;
  storagePath: string;
  createdAt: Date;
}

/** Subconjunto de Prisma que consumen los handlers. */
export interface ExportsDb {
  membership: {
    findFirst(args: unknown): Promise<{ id: string } | null>;
    /** crm-generator-versiones-historico: scoping de /versions por membership. */
    findMany(args: unknown): Promise<Array<{ businessId: string }>>;
  };
  businessSetting: {
    findFirst(args: unknown): Promise<{ datos: unknown } | null>;
  };
  /** crm-generator-versiones-historico (WU3): historial de versiones. */
  exportVersion: {
    count(args: unknown): Promise<number>;
    create(args: unknown): Promise<ExportVersionRow>;
    findFirst(args: unknown): Promise<ExportVersionRow | null>;
    findMany(args: unknown): Promise<ExportVersionRow[]>;
  };
  /** crm-generator-versiones-historico: nombre + lifecycle para el listado. */
  business: {
    findMany(args: unknown): Promise<Array<{ id: string; nombre: string; lifecycle: string }>>;
  };
  /** crm-generator-versiones-historico: "sin desplegar" = 0 eventos (design.md). */
  tenantStateEvent: {
    findMany(args: unknown): Promise<Array<{ businessId: string }>>;
  };
}

// ---------------------------------------------------------------------------
// crm-generator-versiones-historico: semver manual (WU3.3)
// ---------------------------------------------------------------------------

const SEMVER_RE = /^\d+\.\d+\.\d+$/;

function parseSemver(v: string): [number, number, number] {
  const [maj, min, patch] = v.split(".").map((n) => Number(n));
  return [maj, min, patch];
}

/** true si `a` es estrictamente mayor que `b` en orden semver (no lexical). */
function isSemverGreater(a: string, b: string): boolean {
  const [aMaj, aMin, aPatch] = parseSemver(a);
  const [bMaj, bMin, bPatch] = parseSemver(b);
  if (aMaj !== bMaj) return aMaj > bMaj;
  if (aMin !== bMin) return aMin > bMin;
  return aPatch > bPatch;
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

/**
 * crm-env-contract-tiers (WU3.4): lectura+descifrado de los secretos
 * `FRONTEND_PUBLIC` con `envVarName` del negocio para hornear en el
 * `.env.local` del ZIP. Opcional (mismo motivo que `tenantKeys`): tests
 * unitarios existentes que no lo necesitan no tocan Prisma real.
 */
export interface ExportsPublicEnvSecrets {
  read(businessId: string): Promise<PublicEnvSecret[]>;
}

const defaultPublicEnvSecrets: ExportsPublicEnvSecrets = {
  read: (businessId) => readBakeableSecrets(businessId),
};

/**
 * crm-generator-versiones-historico (WU3): acceso a Storage/zip usado por el
 * `onComplete` del job y por la descarga de versiones. DI (no llamadas
 * directas a `storage-exports.js`) para poder testear con fakes sin red ni
 * credenciales reales de Supabase — mismo motivo que `tenantKeys`.
 */
export interface ExportsArtifactStorage {
  zipDirectory(dir: string): Promise<Buffer>;
  upload(businessId: string, versionId: string, buffer: Buffer): Promise<{ storagePath: string }>;
  sign(storagePath: string): Promise<{ url: string }>;
}

const defaultArtifactStorage: ExportsArtifactStorage = {
  zipDirectory: zipDirectoryToBuffer,
  upload: uploadExportArtifact,
  sign: signExportUrl,
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
  /**
   * crm-env-contract-tiers (WU3.4): fuente de secretos `FRONTEND_PUBLIC` a
   * hornear. Opcional, mismo motivo que `tenantKeys` (aislar Prisma real de
   * tests unitarios que no lo necesitan).
   */
  publicEnvSecrets?: ExportsPublicEnvSecrets;
  /**
   * crm-generator-versiones-historico (WU3): opcional, mismo motivo que
   * `tenantKeys`. Si no se inyecta, cae al wrapper real de `storage-exports.js`.
   */
  artifactStorage?: ExportsArtifactStorage;
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
  publicEnvSecrets: defaultPublicEnvSecrets,
  artifactStorage: defaultArtifactStorage,
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
      version: rawVersion,
      changeNote: rawChangeNote,
    } = req.body as {
      projectId?: string;
      formats?: unknown[];
      outputDir?: string;
      /** crm-generator-versiones-historico: obligatoria a partir del 2º export. */
      version?: string;
      changeNote?: string;
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

    // --- Verificar ownership ---
    const membership = await deps.db.membership.findFirst({
      where: { businessId: projectId, userId: req.userId! },
    });

    if (!membership) {
      return res.status(404).json({
        error: { code: "not_found", message: "Proyecto no encontrado" },
      });
    }

    // --- crm-generator-versiones-historico (WU3.3): resolver version ---
    // 1er export del negocio → 1.0.0 automatica, sin pedir nada al operador.
    // Desde el 2º export → version obligatoria en el body, semver valido y
    // estrictamente mayor (orden semver, no lexical) que la ultima existente;
    // si no, 400 duro y NO se crea job (ni fila).
    const versionCount = await deps.db.exportVersion.count({
      where: { businessId: projectId },
    });

    let resolvedVersion: string;
    let resolvedChangeNote: string | null;

    if (versionCount === 0) {
      resolvedVersion = "1.0.0";
      resolvedChangeNote = null;
    } else {
      if (!rawVersion || !SEMVER_RE.test(rawVersion)) {
        return res.status(400).json({
          error: {
            code: "invalid_version",
            message:
              "version es requerida (formato semver x.y.z) a partir del 2º export de este proyecto",
          },
        });
      }
      const latest = await deps.db.exportVersion.findFirst({
        where: { businessId: projectId },
        orderBy: { createdAt: "desc" },
      });
      if (latest && !isSemverGreater(rawVersion, latest.version)) {
        return res.status(400).json({
          error: {
            code: "version_not_greater",
            message: `La version debe ser mayor que la ultima existente (${latest.version})`,
          },
        });
      }
      // changeNote es opcional pero acotada: evita filas desproporcionadas en BD.
      if (typeof rawChangeNote === "string" && rawChangeNote.length > 500) {
        return res.status(400).json({
          error: {
            code: "invalid_change_note",
            message: "changeNote no puede superar los 500 caracteres",
          },
        });
      }
      resolvedVersion = rawVersion;
      resolvedChangeNote =
        typeof rawChangeNote === "string" && rawChangeNote.trim() ? rawChangeNote.trim() : null;
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

    // Si el proyecto no fijó su "Backend API URL", se hornea la URL del backend de
    // PLATAFORMA (env.exportPublicApiUrl / RENDER_EXTERNAL_URL) como NEXT_PUBLIC_API_URL.
    // Sin esto, el artefacto sale con la API "sin configurar" → arranca en modo mock y
    // no conecta al backend. El artefacto usa el backend de plataforma, así que este es
    // el default correcto; si el operador puso una URL propia, esa gana.
    if (!config.api?.url && env.exportPublicApiUrl) {
      config.api = { ...(config.api ?? {}), url: env.exportPublicApiUrl };
    }

    // --- Derivar outputDir y frontDir ---
    const slug = toSlug(config.business.name);
    const outputDir = rawOutputDir ?? path.join(process.cwd(), "exports", slug);
    // front/ vive un nivel por encima de back/ (directorio hermano).
    const frontDir = path.resolve(process.cwd(), "..", "front");

    // --- crm-env-contract-tiers (WU3.4): resolver secretos FRONTEND_PUBLIC a hornear ---
    // Fail-open: el export NO bloquea por configuración de BD. La decisión actual
    // (crm-onboarding-db-keys-export-connect) es que el negocio configura BD/APIs en
    // el onboarding (paso "BD, API y Keys"); al guardar quedan seteadas y el export
    // hornea LO QUE HAYA. Un fallo de lectura/descifrado tampoco bloquea: el ZIP sale
    // sin esas NEXT_PUBLIC_* (el negocio las sigue viendo vía /tenant-config).
    let publicEnvSecrets: PublicEnvSecret[] = [];
    if (deps.publicEnvSecrets) {
      try {
        publicEnvSecrets = await deps.publicEnvSecrets.read(projectId);
      } catch (e) {
        console.error(
          "[exports] no se pudieron resolver los secretos públicos del tenant para el export:",
          e instanceof Error ? e.message : e,
        );
      }
    }

    // NOTA (decisión 12/07/2026): el export NO bloquea por falta de las vars de BD.
    // La configuración de BD/APIs vive en el onboarding (paso "BD, API y Keys"); el
    // export hornea lo que el negocio haya guardado. Si faltan, el ZIP sale sin esas
    // NEXT_PUBLIC_* y el destinatario las completa — no se corta la generación.

    // --- Resolver runtimeConfig (crm-export-runtime-config, design.md §2) ---
    // platformApiUrl: env del propio backend de plataforma (NO del tenant).
    // tenantId: businessId del negocio (identificador real de tenant en este
    // backend; distinto de `config.business.clienteId`, que enlaza con
    // `crm_project.id_cliente` en agents-agency y no es un id de plataforma).
    // tenantApiKey: clave fresca minteada server-side para ESTE export.
    // crm-onboarding-db-keys-export-connect (code-review fix): esto corre
    // DESPUÉS del gate — mintear la key ANTES bloqueaba dejaba una TenantApiKey
    // huérfana (nunca usada) por cada export rechazado con 422.
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

    // --- crm-generator-versiones-historico (WU3.4): closure onComplete ---
    // Orden generar → subir → registrar (design.md): ctx.frontDir ya esta en
    // disco cuando el job termina 'done' (compartido por TODOS los builders,
    // independiente de `formats`); se comprime y sube SIEMPRE. Un fallo de
    // Storage no crea la fila ni revierte el job 'done' (se loguea en el
    // catch de export-job-manager, sin secretos — nunca se loguea el buffer).
    const artifactStorage = deps.artifactStorage ?? defaultArtifactStorage;
    const onComplete = async (): Promise<void> => {
      const buffer = await artifactStorage.zipDirectory(frontDir);
      const versionId = randomUUID();
      const { storagePath } = await artifactStorage.upload(projectId, versionId, buffer);
      await deps.db.exportVersion.create({
        data: {
          id: versionId,
          businessId: projectId,
          version: resolvedVersion,
          changeNote: resolvedChangeNote,
          format: "source",
          storagePath,
        },
      });
    };

    // --- Arrancar job (202) o 409 si el lock esta ocupado ---
    try {
      const job = deps.jobs.startJob({
        projectId,
        formats: requestedFormats,
        config,
        outputDir,
        frontDir,
        runtimeConfig,
        publicEnvSecrets,
        onComplete,
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

/**
 * GET /versions — historial de versiones (crm-generator-versiones-historico WU3.5).
 * Scoping por membership de `req.userId`: solo negocios donde el usuario tiene
 * membership aparecen en el listado. `hasStateEvents` deriva de `TenantStateEvent`
 * (NO de `lifecycle`, que nace 'ACTIVE' incluso sin desplegar nunca — ver spec
 * "Service Status via Lifecycle" de `dashboard-generados`).
 */
export function versionsHandler(deps: ExportsDeps) {
  return async function versions(req: AuthedRequest, res: Response): Promise<Response> {
    const memberships = await deps.db.membership.findMany({
      where: { userId: req.userId! },
    });
    const businessIds = memberships.map((m) => m.businessId);

    if (businessIds.length === 0) {
      return res.status(200).json({ versions: [], distinctCount: 0 });
    }

    const rows = await deps.db.exportVersion.findMany({
      where: { businessId: { in: businessIds } },
      orderBy: { createdAt: "desc" },
    });

    const uniqueBusinessIds = Array.from(new Set(rows.map((r) => r.businessId)));

    const businesses = uniqueBusinessIds.length
      ? await deps.db.business.findMany({
          where: { id: { in: uniqueBusinessIds } },
        })
      : [];
    const businessMap = new Map(businesses.map((b) => [b.id, b]));

    const stateEvents = uniqueBusinessIds.length
      ? await deps.db.tenantStateEvent.findMany({
          where: { businessId: { in: uniqueBusinessIds } },
        })
      : [];
    const hasEventsSet = new Set(stateEvents.map((e) => e.businessId));

    const versions = rows.map((r) => {
      const business = businessMap.get(r.businessId);
      return {
        id: r.id,
        businessId: r.businessId,
        businessName: business?.nombre ?? "",
        version: r.version,
        changeNote: r.changeNote,
        createdAt: r.createdAt,
        lifecycle: business?.lifecycle ?? "ACTIVE",
        hasStateEvents: hasEventsSet.has(r.businessId),
      };
    });

    return res.status(200).json({ versions, distinctCount: uniqueBusinessIds.length });
  };
}

/**
 * GET /versions/:id/download — URL firmada temporal del artefacto exacto de esa
 * version (crm-generator-versiones-historico WU3.6). Nunca regenera ni dispara un
 * job nuevo. 404 si la version no existe o no pertenece a un negocio del usuario.
 */
export function downloadVersionHandler(deps: ExportsDeps) {
  return async function downloadVersion(req: AuthedRequest, res: Response): Promise<Response> {
    const version = await deps.db.exportVersion.findFirst({
      where: { id: req.params.id },
    });
    if (!version) {
      return res.status(404).json({
        error: { code: "version_not_found", message: "Versión no encontrada" },
      });
    }

    const membership = await deps.db.membership.findFirst({
      where: { businessId: version.businessId, userId: req.userId! },
    });
    if (!membership) {
      return res.status(404).json({
        error: { code: "version_not_found", message: "Versión no encontrada" },
      });
    }

    try {
      const artifactStorage = deps.artifactStorage ?? defaultArtifactStorage;
      const { url } = await artifactStorage.sign(version.storagePath);
      return res.status(200).json({ url });
    } catch (err) {
      console.error(
        "[exports] fallo al firmar URL de descarga de version:",
        err instanceof Error ? err.message : err,
      );
      return res.status(502).json({
        error: { code: "storage_error", message: "No se pudo generar el enlace de descarga" },
      });
    }
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
  // Orden importante: las rutas literales van ANTES de las parametricas /:id/...
  // ("/versions" y "/versions/:id/download" son literales-primero por el mismo
  // motivo que "/active"; crm-generator-versiones-historico WU3.7).
  router.get("/pick-folder", pickFolderHandler);
  router.get("/active", activeHandler(deps));
  router.get("/versions", versionsHandler(deps));
  router.get("/versions/:id/download", downloadVersionHandler(deps));
  router.get("/:id/status", statusHandler(deps));
  router.get("/:id/download", downloadHandler(deps));
  router.delete("/:id", cancelHandler(deps));
  router.post("/", createExportHandler(deps));
  return router;
}

export const exportsRouter = makeExportsRouter();
