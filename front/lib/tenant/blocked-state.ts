// Estado global de bloqueo del tenant (kill switch — crm-tenant-lifecycle-gate WU4).
//
// Vive a nivel de MÓDULO, no en React: el interceptor de red (lib/api/client.ts) es
// una función plana —no un hook— y debe poder disparar el bloqueo desde cualquier
// llamada al back. Un provider de React (components/tenant/tenant-block-overlay.tsx)
// se suscribe para pintar la pantalla full-screen. Es el mismo patrón de superficie
// global que DialogProvider, pero con un store pub/sub que puentea el carril de fetch.

export type TenantBlockedVariant = 'suspended' | 'terminated';

let current: TenantBlockedVariant | null = null;
const listeners = new Set<(v: TenantBlockedVariant | null) => void>();

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
export function setTenantBlocked(variant: TenantBlockedVariant | null): void {
  if (current === variant) return;
  current = variant;
  for (const l of listeners) l(current);
}

/** Estado de bloqueo actual (lectura síncrona para el primer render del provider). */
export function getTenantBlocked(): TenantBlockedVariant | null {
  return current;
}

/** Suscribe un listener a los cambios de bloqueo. Devuelve la función de baja. */
export function subscribeTenantBlocked(
  cb: (v: TenantBlockedVariant | null) => void,
): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
