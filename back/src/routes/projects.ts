import { Router, type Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma.js';
import type { AuthedRequest } from '../middleware/types.js';

// Proyectos = crm.Business (1-1 con aa.tenant vía tenant_id). La config del
// onboarding (módulos/terminología/branding…) se guarda íntegra en BusinessSetting
// (categoria='config', Json) y se espeja a columnas de Business (nombre/vertical/marca)
// para consultas y emails. Tenancy row-level. Soft delete (eliminadoEn).
export const projectsRouter = Router();

type Cfg = Record<string, unknown> & {
  business?: { name?: string; vertical?: string; clienteId?: string };
  branding?: { primary?: string; secondary?: string; logoImage?: string };
};

const CONFIG_CATEGORY = 'config';

async function tenantExists(tenantId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM aa.tenant WHERE id = ${tenantId} AND activo = true LIMIT 1`;
  return rows.length > 0;
}

interface BusinessRow {
  id: string;
  createdAt: Date;
  name: string;
  vertical: string;
  brandPrimary: string;
  brandSecondary: string;
  logoUrl: string | null;
  settings: { data: unknown }[];
}

// Reconstruye el "proyecto" para el front: config guardada (BusinessSetting) si existe,
// + espejo de columnas de Business para que el front arme un fallback (configFromVertical)
// en proyectos sin config (ej. negocios sembrados antes de tener onboarding).
function toProject(b: BusinessRow) {
  return {
    id: b.id,
    createdAt: b.createdAt.toISOString(),
    config: (b.settings[0]?.data as unknown) ?? null,
    business: {
      name: b.name,
      vertical: b.vertical,
      brandPrimary: b.brandPrimary,
      brandSecondary: b.brandSecondary,
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
      id: true, createdAt: true, name: true, vertical: true,
      brandPrimary: true, brandSecondary: true, logoUrl: true,
      settings: { where: { category: CONFIG_CATEGORY }, select: { data: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(businesses.map(toProject));
});

// POST / → crea proyecto. Exige tenant existente en AA (no proyecto sin cliente). 1-1.
projectsRouter.post('/', async (req: AuthedRequest, res: Response) => {
  const config = (req.body?.config ?? {}) as Cfg;
  const tenantId: string | undefined = req.body?.tenantId ?? config.business?.clienteId;
  if (!tenantId) {
    return res.status(422).json({ error: { code: 'tenant_required', message: 'Selecciona un cliente (tenant) existente' } });
  }
  if (!(await tenantExists(tenantId))) {
    return res.status(422).json({ error: { code: 'tenant_not_found', message: 'El cliente (tenant) no existe en agents-agency' } });
  }
  const dup = await prisma.business.findUnique({ where: { tenantId } });
  if (dup && dup.eliminadoEn === null) {
    return res.status(409).json({ error: { code: 'tenant_taken', message: 'Ese cliente ya tiene un proyecto' } });
  }

  const business = await prisma.$transaction(async (tx) => {
    const b = await tx.business.create({
      data: {
        tenantId,
        name: config.business?.name ?? 'Nuevo proyecto',
        vertical: config.business?.vertical ?? 'custom',
        ...(config.branding?.primary ? { brandPrimary: config.branding.primary } : {}),
        ...(config.branding?.secondary ? { brandSecondary: config.branding.secondary } : {}),
        ...(config.branding?.logoImage ? { logoUrl: config.branding.logoImage } : {}),
      },
    });
    await tx.location.create({ data: { businessId: b.id, name: config.business?.name ?? 'Sede' } });
    await tx.businessSetting.create({
      data: { businessId: b.id, category: CONFIG_CATEGORY, data: config as Prisma.InputJsonValue },
    });
    await tx.membership.create({ data: { userId: req.userId!, businessId: b.id, role: 'OWNER' } });
    return b;
  });

  res.status(201).json({ id: business.id, config, createdAt: business.createdAt.toISOString() });
});

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
        ...(config.business?.name ? { name: config.business.name } : {}),
        ...(config.business?.vertical ? { vertical: config.business.vertical } : {}),
        ...(config.branding?.primary ? { brandPrimary: config.branding.primary } : {}),
        ...(config.branding?.secondary ? { brandSecondary: config.branding.secondary } : {}),
        ...(config.branding?.logoImage ? { logoUrl: config.branding.logoImage } : {}),
      },
    });
    // locationId nullable en el unique compuesto → Prisma no permite where con null;
    // resolvemos con findFirst + update/create.
    const existing = await tx.businessSetting.findFirst({ where: { businessId: id, category: CONFIG_CATEGORY } });
    if (existing) {
      await tx.businessSetting.update({ where: { id: existing.id }, data: { data: config as Prisma.InputJsonValue } });
    } else {
      await tx.businessSetting.create({ data: { businessId: id, category: CONFIG_CATEGORY, data: config as Prisma.InputJsonValue } });
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
