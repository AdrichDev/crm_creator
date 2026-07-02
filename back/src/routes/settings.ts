import { Router, type Response } from 'express';
import { prisma } from '../prisma.js';
import type { AuthedRequest } from '../middleware/types.js';

// Ajustes del negocio (BusinessSetting) por categoría, a nivel negocio
// (locationId = null). La categoría `config` está RESERVADA al generador
// (projects.ts guarda ahí el TenantConfig del proyecto) → PUT sobre `config`
// responde 403; GET sí se permite.
export const settingsRouter = Router();

const RESERVED = 'config';

settingsRouter.get('/:categoria', async (req: AuthedRequest, res: Response) => {
  const { categoria } = req.params;
  const row = await prisma.businessSetting.findFirst({
    where: { businessId: req.businessId, locationId: null, categoria },
  });
  res.json({ categoria, datos: row?.datos ?? {} });
});

settingsRouter.put('/:categoria', async (req: AuthedRequest, res: Response) => {
  const { categoria } = req.params;
  if (categoria === RESERVED) {
    return res.status(403).json({ error: { code: 'forbidden', message: 'Categoría reservada al generador' } });
  }
  const datos = req.body?.datos;
  if (typeof datos !== 'object' || datos === null || Array.isArray(datos)) {
    return res.status(400).json({ error: { code: 'validation', message: 'datos debe ser un objeto JSON' } });
  }

  // Upsert manual por (negocio, sucursal=null, categoria): la unique compuesta
  // con locationId NULL no deduplica de forma fiable en Postgres, así que
  // resolvemos la fila explícitamente.
  const existing = await prisma.businessSetting.findFirst({
    where: { businessId: req.businessId, locationId: null, categoria },
  });
  const row = existing
    ? await prisma.businessSetting.update({ where: { id: existing.id }, data: { datos } })
    : await prisma.businessSetting.create({ data: { businessId: req.businessId!, locationId: null, categoria, datos } });
  res.json({ categoria: row.categoria, datos: row.datos });
});
