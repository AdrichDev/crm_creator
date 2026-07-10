import type { Response, NextFunction } from 'express';
import { TenantLifecycle } from '../lib/generated/prisma/client.js';
import { resolveTenantState, type TenantStateDb } from '../lib/tenant-lifecycle/resolver.js';
import type { AuthedRequest } from './types.js';

// crm-tenant-lifecycle-gate: gate de ciclo de vida del negocio (kill switch, lectura).
//
// Requiere que la identidad del negocio YA esté resuelta aguas arriba: `req.tenantBusinessId`
// (carril tenant-facing, resolveTenantApiKey) o `req.businessId` (sesión de panel). Si ninguna
// está presente, el gate es un no-op (`next()`): decidir identidad no es su trabajo y jamás
// debe convertir esa ausencia en un 500.
//
// NO se monta en `/service/operator` (el operador debe poder reactivar un negocio cortado) ni
// en las rutas exentas (`GET /tenant-status`, estáticos de la pantalla de bloqueo) — el montaje
// es responsabilidad de WU3 (routes/index.ts + login).

const TENANT_SUSPENDED = {
  error: { code: 'tenant_suspended', message: 'El servicio de este negocio está suspendido' },
} as const;
const TENANT_TERMINATED = {
  error: { code: 'tenant_terminated', message: 'La cuenta de este negocio está cerrada' },
} as const;

/** Header informativo con el fin de la gracia (ISO) cuando el estado efectivo es GRACE. */
export const GRACE_UNTIL_HEADER = 'x-tenant-grace-until';

export interface TenantGateOptions {
  /** BD inyectable para tests (patrón DI del repo); por defecto el prisma global vía resolver. */
  db?: TenantStateDb;
}

/**
 * Middleware: decide por estado efectivo del negocio (con GRACE perezoso del resolver):
 * - ACTIVE → next().
 * - GRACE vigente → next() + header `x-tenant-grace-until: <ISO>`.
 * - SUSPENDED (o GRACE expirado) → 423 `tenant_suspended`.
 * - TERMINATED → 410 `tenant_terminated`.
 */
export function tenantGate(opts: TenantGateOptions = {}) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    const businessId = req.tenantBusinessId ?? req.businessId;
    if (!businessId) {
      // Identidad no resuelta en este carril → el gate no opina (nunca 500 por esto).
      return next();
    }
    try {
      const { effective, graceUntil } = await resolveTenantState(
        businessId,
        opts.db ? { db: opts.db } : {},
      );
      switch (effective) {
        case TenantLifecycle.ACTIVE:
          return next();
        case TenantLifecycle.GRACE:
          if (graceUntil) res.setHeader(GRACE_UNTIL_HEADER, graceUntil.toISOString());
          return next();
        case TenantLifecycle.SUSPENDED:
          return res.status(423).json(TENANT_SUSPENDED);
        case TenantLifecycle.TERMINATED:
          return res.status(410).json(TENANT_TERMINATED);
      }
    } catch (e) {
      console.error('[tenant-gate] error resolviendo estado del negocio:', e);
      return res.status(500).json({ error: { code: 'server_error', message: 'Error interno' } });
    }
  };
}
