'use client';
// Puente React ↔ store del kill switch (crm-tenant-block-scoping).
//
// El interceptor de red (lib/api/client.ts) no es un hook: escribe el bloqueo en el
// store de módulo (lib/tenant/blocked-state.ts). Este overlay se suscribe a ese store
// y monta la pantalla de bloqueo desde cualquier ruta del panel en cuanto una llamada
// devuelve 423/410. Se monta en el root layout (mismo patrón de superficie global que
// DialogProvider).
//
// ACOTADO POR NEGOCIO: el bloqueo lleva el businessId que lo originó y la pantalla solo
// se pinta cuando ese negocio ES el negocio activo — OperaOS (shell, selector, otros
// negocios sanos) nunca queda tapado por la suspensión de un negocio concreto. El cambio
// de negocio activo pasa por reconcileTenantBlock (tenant-config-context.tsx), que limpia
// bloqueos obsoletos y dispara esta suscripción para desmontar sin recarga.
import { useEffect, useState } from 'react';
import {
  getTenantBlocked,
  subscribeTenantBlocked,
  type TenantBlocked,
} from '@/lib/tenant/blocked-state';
import { getActiveBusinessId } from '@/lib/auth/session';
import { BlockedScreen } from './blocked-screen';

export function TenantBlockOverlay() {
  const [blocked, setBlocked] = useState<TenantBlocked | null>(null);

  useEffect(() => {
    // Sincroniza el estado inicial (por si el bloqueo se fijó antes de montar) y
    // se suscribe a cambios posteriores del interceptor / la reconciliación.
    setBlocked(getTenantBlocked());
    return subscribeTenantBlocked(setBlocked);
  }, []);

  if (!blocked || blocked.businessId !== getActiveBusinessId()) return null;
  return <BlockedScreen variant={blocked.variant} />;
}
