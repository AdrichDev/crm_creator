// Estado de bloqueo del tenant ACOTADO POR NEGOCIO (kill switch — crm-tenant-block-scoping).
//
// Vive a nivel de MÓDULO, no en React: el interceptor de red (lib/api/client.ts) es
// una función plana —no un hook— y debe poder disparar el bloqueo desde cualquier
// llamada al back. Un provider de React (components/tenant/tenant-block-overlay.tsx)
// se suscribe para pintar la pantalla de bloqueo. Es el mismo patrón de superficie
// global que DialogProvider, pero con un store pub/sub que puentea el carril de fetch.
//
// A diferencia del diseño original (crm-tenant-lifecycle-gate WU4, flag global de
// variante), el estado lleva el `businessId` que originó el 423/410: los negocios se
// suspenden UNO a UNO, OperaOS nunca. El overlay solo se monta cuando el negocio
// bloqueado coincide con el negocio activo.

export type TenantBlockedVariant = 'suspended' | 'terminated';

/** Bloqueo vigente: variante del gate + negocio que devolvió el 423/410. */
export interface TenantBlocked {
  variant: TenantBlockedVariant;
  businessId: string;
}

let current: TenantBlocked | null = null;
const listeners = new Set<(v: TenantBlocked | null) => void>();

/**
 * Clasifica una respuesta de error por el CÓDIGO del body, NO por el status a secas.
 * Solo bloquean dos casos del gate del tenant:
 *   - 423 `tenant_suspended`  → variante suspendido.
 *   - 410 `tenant_terminated` → variante cuenta cerrada.
 * Otros 410 del carril auth (`login_moved` / `use_sdk`) devuelven null: NO bloquean.
 */
export function classifyBlocked(status: number, code?: string): TenantBlockedVariant | null {
  if (status === 423 && code === 'tenant_suspended') return 'suspended';
  if (status === 410 && code === 'tenant_terminated') return 'terminated';
  return null;
}

/** Fija (o limpia con null) el estado de bloqueo y notifica a los suscriptores. */
export function setTenantBlocked(value: TenantBlocked | null): void {
  if (current === value) return;
  if (current && value && current.variant === value.variant && current.businessId === value.businessId) return;
  current = value;
  for (const l of listeners) l(current);
}

/** Estado de bloqueo actual (lectura síncrona para el primer render del provider). */
export function getTenantBlocked(): TenantBlocked | null {
  return current;
}

/**
 * Reconciliación al cambiar de negocio activo: si el bloqueo almacenado pertenece a
 * OTRO negocio, se limpia — un bloqueo obsoleto del negocio anterior no debe persistir
 * contra el negocio recién activado. La llama openProject (tenant-config-context.tsx).
 */
export function reconcileTenantBlock(activeBusinessId: string): void {
  if (current && current.businessId !== activeBusinessId) {
    setTenantBlocked(null);
  }
}

/** Suscribe un listener a los cambios de bloqueo. Devuelve la función de baja. */
export function subscribeTenantBlocked(
  cb: (v: TenantBlocked | null) => void,
): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
