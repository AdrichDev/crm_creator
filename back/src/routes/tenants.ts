import { Router, type Response } from 'express';
import { prisma } from '../prisma.js';
import type { AuthedRequest } from '../middleware/types.js';

// Tenants (clientes generales) dados de alta en agents-agency. AA y CRM comparten
// la MISMA Supabase → se leen por SQL raw cross-schema (aa.tenant), sin proxy HTTP
// a AA. En creador_CRM el tenant solo se usa como FK del proyecto (Business.tenant_id);
// no se puede crear un proyecto sin un tenant existente.
export const tenantsRouter = Router();

interface TenantRow {
  id: string;
  codigo: string | null;
  nombre: string;
  nif: string | null;
  email: string | null;
  telefono: string | null;
  contacto: string | null;
  direccion: string | null;
  sector: string | null;
}

// Forma ligera que consume el selector del onboarding (ClientLite).
function toLite(t: TenantRow) {
  return {
    id: t.id,
    nombre: t.nombre,
    email: t.email,
    telefono: t.telefono,
    cif: t.nif,
    direccion: t.direccion,
    contacto: t.contacto,
  };
}

// GET /api/tenants → tenants activos de AA (aa.tenant) para vincular al crear proyecto.
tenantsRouter.get('/', async (_req: AuthedRequest, res: Response) => {
  const rows = await prisma.$queryRaw<TenantRow[]>`
    SELECT id, codigo, nombre, nif, email, telefono, contacto, direccion, sector
    FROM aa.tenant
    WHERE activo = true
    ORDER BY nombre ASC
  `;
  res.json(rows.map(toLite));
});

// GET /api/tenants/:id → un tenant (validación de existencia + autorrelleno de datos).
tenantsRouter.get('/:id', async (req: AuthedRequest, res: Response) => {
  const rows = await prisma.$queryRaw<TenantRow[]>`
    SELECT id, codigo, nombre, nif, email, telefono, contacto, direccion, sector
    FROM aa.tenant
    WHERE id = ${req.params.id} AND activo = true
    LIMIT 1
  `;
  if (rows.length === 0) return res.status(404).json({ error: { code: 'not_found', message: 'Tenant no encontrado' } });
  res.json(toLite(rows[0]));
});
