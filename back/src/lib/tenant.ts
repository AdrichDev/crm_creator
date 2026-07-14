import type { Response } from 'express';
import { prisma } from '../prisma.js';

// Gate central de tenancy: garantiza que un FK del body pertenece al negocio
// activo (req.businessId) y no está soft-deleted. Cierra el riesgo de datos
// cruzados (reserva/bono/venta de negocio A apuntando a entidad de negocio B).
// RLS bloquea las LECTURAS cruzadas; esto bloquea las ESCRITURAS con FK ajeno.

export class CrossTenantError extends Error {
  constructor(public field: string) {
    super(`Referencia fuera del negocio activo: ${field}`);
    this.name = 'CrossTenantError';
  }
}

// Modelos que pueden ser destino de un FK validable (todos con businessId + eliminadoEn).
export type TenantModel = 'customer' | 'service' | 'employee' | 'location' | 'resource' | 'package' | 'team' | 'contacto';

/** Comprobación de pertenencia. Inyectable en tests (DI), igual que el middleware de auth. */
export type BelongsCheck = (model: TenantModel, id: string, businessId: string | undefined) => Promise<boolean>;

export const belongs: BelongsCheck = async (model, id, businessId) => {
  const delegate = (prisma as unknown as Record<string, { findFirst: (a: unknown) => Promise<unknown> }>)[model];
  const row = await delegate.findFirst({ where: { id, businessId, eliminadoEn: null } });
  return !!row;
};

/** Lanza CrossTenantError si el id (no nulo) no pertenece al negocio. FKs nulos = OK. */
export async function assertBelongsToBusiness(
  model: TenantModel,
  id: string | null | undefined,
  businessId: string | undefined,
  field: string,
  check: BelongsCheck = belongs,
): Promise<void> {
  if (!id) return;
  if (!(await check(model, id, businessId))) throw new CrossTenantError(field);
}

/** Valida varios FKs (incluye listas). Lanza CrossTenantError en el primero ajeno. */
export async function assertFks(
  businessId: string | undefined,
  fks: Array<{ model: TenantModel; id: string | null | undefined; field: string }>,
  check: BelongsCheck = belongs,
): Promise<void> {
  for (const f of fks) await assertBelongsToBusiness(f.model, f.id, businessId, f.field, check);
}

/**
 * Punto ÚNICO de respuesta para FK cross-tenant. Si `e` es CrossTenantError,
 * responde 422 `cross_tenant` y devuelve true; si no, devuelve false (re-lanzar).
 * El errorHandler central tiene la misma red de seguridad para rutas que no
 * usen try/catch explícito.
 */
export function handleCrossTenant(e: unknown, res: Response): boolean {
  if (e instanceof CrossTenantError) {
    res.status(422).json({ error: { code: 'cross_tenant', message: e.message } });
    return true;
  }
  return false;
}
