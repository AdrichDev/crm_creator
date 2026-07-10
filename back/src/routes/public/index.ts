import { Router, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { publicRateLimiter } from '../../middleware/rate-limit.js';
import { tenantGate } from '../../middleware/tenant-gate.js';
import type { AuthedRequest } from '../../middleware/types.js';
import { leadsPublicRouter } from './leads.js';
import { bookingsPublicRouter } from './bookings.js';
import { availabilityPublicRouter } from './availability.js';

// ---------------------------------------------------------------------------
// crm-tenant-lifecycle-gate (WU2.5): el carril público es NO autenticado — el
// negocio se identifica por `businessId` en el propio payload (body en POST
// /leads y /bookings, query string en GET /availability), no por sesión ni API
// key. Este resolver fija `req.tenantBusinessId` ANTES del gate con el MISMO
// dato que después validan los handlers (zod `.cuid()`), sin tocar el contrato
// externo: con negocio ACTIVE la petición sigue idéntica.
//
// Solo se acepta un valor con forma de cuid: un `businessId` malformado NO se
// fija (el gate queda no-op) para que el handler siga devolviendo su 422 de
// validación como hasta ahora. Un cuid bien formado pero inexistente cae en el
// fail-closed del resolver de WU2 (fila ausente → TERMINATED → 410): identidad
// huérfana = acceso cortado, nunca ACTIVE por defecto.
// ---------------------------------------------------------------------------

const cuid = z.string().cuid();

/** Resolver de identidad del carril público (exportado para el test de wiring). */
export function publicTenantResolver(req: AuthedRequest, _res: Response, next: NextFunction) {
  const raw =
    (req.body as { businessId?: unknown } | undefined)?.businessId ?? req.query?.businessId;
  if (typeof raw === 'string' && cuid.safeParse(raw).success) {
    req.tenantBusinessId = raw;
  }
  next();
}

export const publicRouter = Router();

// Aplicar el limitador de peticiones a todos los endpoints públicos
publicRouter.use(publicRateLimiter);

// Kill switch (crm-tenant-lifecycle-gate): SUSPENDED / gracia expirada → 423
// tenant_suspended; TERMINATED → 410 tenant_terminated; ACTIVE/GRACE pasan
// (GRACE añade el header x-tenant-grace-until). Un negocio suspendido deja de
// aceptar leads y reservas y de servir disponibilidad.
publicRouter.use(publicTenantResolver, tenantGate());

// Endpoints
publicRouter.use('/leads', leadsPublicRouter);
publicRouter.use('/bookings', bookingsPublicRouter);
publicRouter.use('/availability', availabilityPublicRouter);
