import { Router, type Response } from 'express';
import { prisma } from '../prisma.js';
import { Prisma } from '../lib/generated/prisma/client.js';
import type { AuthedRequest } from '../middleware/types.js';
import {
  CONFIG_CATEGORY,
  createProjectService,
  tenantExists,
  type CreateProjectDeps,
  type ProjectConfig,
} from '../lib/projects/create-project-service.js';

// Proyectos = crm.Business (1-1 con aa.tenant vía tenant_id). La config del
// onboarding (módulos/terminología/branding…) se guarda íntegra en BusinessSetting
// (categoria='config', Json) y se espeja a columnas de Business (nombre/vertical/marca)
// para consultas y emails. Tenancy row-level. Soft delete (eliminadoEn).
// El create vive en lib/projects/create-project-service.ts (compartido con el
// operador, F8-T3); aquí solo queda el mapeo HTTP.
export const projectsRouter = Router();

// Re-export para los tests de caracterización del alta (importan desde la ruta).
export type { CreateProjectDeps, ProjectTxClient, CreatedBusiness } from '../lib/projects/create-project-service.js';

type Cfg = ProjectConfig;

interface BusinessRow {
  id: string;
  createdAt: Date;
  nombre: string;
  vertical: string;
  marcaPrimario: string;
  marcaSecundario: string;
  logoUrl: string | null;
  settings: { datos: unknown }[];
}

// Reconstruye el "proyecto" para el front: config guardada (BusinessSetting) si existe,
// + espejo de columnas de Business para que el front arme un fallback (configFromVertical)
// en proyectos sin config (ej. negocios sembrados antes de tener onboarding).
function toProject(b: BusinessRow) {
  return {
    id: b.id,
    createdAt: b.createdAt.toISOString(),
    config: (b.settings[0]?.datos as unknown) ?? null,
    business: {
      nombre: b.nombre,
      vertical: b.vertical,
      marcaPrimario: b.marcaPrimario,
      marcaSecundario: b.marcaSecundario,
      logoUrl: b.logoUrl,
    },
  };
}

// GET / → proyectos del usuario (vía Membership), no eliminados.
projectsRouter.get('/', async (req: AuthedRequest, res: Response) => {
  const memberships = await prisma.membership.findMany({
    where: { userId: req.userId },
    select: { businessId: true },
  });
  const ids = memberships.map((m) => m.businessId);
  const businesses = await prisma.business.findMany({
    where: { id: { in: ids }, eliminadoEn: null },
    select: {
      id: true, createdAt: true, nombre: true, vertical: true,
      marcaPrimario: true, marcaSecundario: true, logoUrl: true,
      settings: { where: { categoria: CONFIG_CATEGORY }, select: { datos: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(businesses.map(toProject));
});

/**
 * Handler del alta de proyecto con deps inyectables (tenantExists + transaction).
 * Exportado para tests de caracterización; el router lo enlaza con Prisma real.
 * La lógica de creación vive en createProjectService (compartida con el operador).
 */
export async function createProjectHandler(deps: CreateProjectDeps, req: AuthedRequest, res: Response) {
  const config = (req.body?.config ?? {}) as Cfg;
  const tenantId: string | undefined = req.body?.tenantId ?? config.business?.clienteId;
  if (!tenantId) {
    return res.status(422).json({ error: { code: 'tenant_required', message: 'Selecciona un cliente (tenant) existente' } });
  }

  try {
    // El service valida el tenant (una sola vez) y crea el alta en 1 transacción.
    const result = await createProjectService({ tenantId, userId: req.userId!, config }, deps);
    if (!result.ok) {
      return res.status(422).json({ error: { code: 'tenant_not_found', message: 'El cliente (tenant) no existe en agents-agency' } });
    }
    res.status(201).json({ id: result.business.id, config, createdAt: result.business.createdAt.toISOString() });
  } catch (e) {
    console.error('[projects] create error:', e);
    return res.status(500).json({ error: { code: 'server_error', message: 'No se pudo crear el proyecto' } });
  }
}

// Dependencias reales: Prisma satisface las interfaces estrechas estructuralmente.
const defaultCreateDeps: CreateProjectDeps = {
  tenantExists: (tenantId) => tenantExists(prisma, tenantId),
  transaction: (fn) => prisma.$transaction(fn),
};

// POST / → crea proyecto. Exige tenant existente en AA. Un tenant puede tener N proyectos.
projectsRouter.post('/', (req: AuthedRequest, res: Response) => createProjectHandler(defaultCreateDeps, req, res));

// PATCH /:id → actualiza config (modo edición). Espeja a columnas + BusinessSetting.
projectsRouter.patch('/:id', async (req: AuthedRequest, res: Response) => {
  const id = req.params.id;
  const member = await prisma.membership.findFirst({ where: { userId: req.userId, businessId: id } });
  if (!member) return res.status(404).json({ error: { code: 'not_found', message: 'Proyecto no encontrado' } });
  const config = (req.body?.config ?? {}) as Cfg;

  await prisma.$transaction(async (tx) => {
    await tx.business.update({
      where: { id },
      data: {
        ...(config.business?.name ? { nombre: config.business.name } : {}),
        ...(config.business?.vertical ? { vertical: config.business.vertical } : {}),
        ...(config.branding?.primary ? { marcaPrimario: config.branding.primary } : {}),
        ...(config.branding?.secondary ? { marcaSecundario: config.branding.secondary } : {}),
        ...(config.branding?.logoImage ? { logoUrl: config.branding.logoImage } : {}),
      },
    });
    // locationId nullable en el unique compuesto → Prisma no permite where con null;
    // resolvemos con findFirst + update/create.
    const existing = await tx.businessSetting.findFirst({ where: { businessId: id, categoria: CONFIG_CATEGORY } });
    if (existing) {
      await tx.businessSetting.update({ where: { id: existing.id }, data: { datos: config as Prisma.InputJsonValue } });
    } else {
      await tx.businessSetting.create({ data: { businessId: id, categoria: CONFIG_CATEGORY, datos: config as Prisma.InputJsonValue } });
    }
  });
  res.json({ id, config });
});

// DELETE /:id → soft delete (eliminadoEn = now). Hard delete se hará en producción.
projectsRouter.delete('/:id', async (req: AuthedRequest, res: Response) => {
  const id = req.params.id;
  const member = await prisma.membership.findFirst({ where: { userId: req.userId, businessId: id } });
  if (!member) return res.status(404).json({ error: { code: 'not_found', message: 'Proyecto no encontrado' } });
  await prisma.business.update({ where: { id }, data: { eliminadoEn: new Date() } });
  res.status(204).end();
});
