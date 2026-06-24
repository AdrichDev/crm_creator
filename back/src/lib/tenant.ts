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
export type TenantModel = 'customer' | 'service' | 'employee' | 'location' | 'resource' | 'package';

async function belongs(model: TenantModel, id: string, businessId: string | undefined): Promise<boolean> {
  const delegate = (prisma as unknown as Record<string, { findFirst: (a: unknown) => Promise<unknown> }>)[model];
  const row = await delegate.findFirst({ where: { id, businessId, eliminadoEn: null } });
  return !!row;
}

/** Lanza CrossTenantError si el id (no nulo) no pertenece al negocio. FKs nulos = OK. */
export async function assertBelongsToBusiness(
  model: TenantModel,
  id: string | null | undefined,
  businessId: string | undefined,
  field: string,
): Promise<void> {
  if (!id) return;
  if (!(await belongs(model, id, businessId))) throw new CrossTenantError(field);
}

/** Valida varios FKs (incluye listas). Lanza CrossTenantError en el primero ajeno. */
export async function assertFks(
  businessId: string | undefined,
  fks: Array<{ model: TenantModel; id: string | null | undefined; field: string }>,
): Promise<void> {
  for (const f of fks) await assertBelongsToBusiness(f.model, f.id, businessId, f.field);
}
