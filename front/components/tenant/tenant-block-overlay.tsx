'use client';
// Puente React ↔ store del kill switch (crm-tenant-lifecycle-gate WU4).
//
// El interceptor de red (lib/api/client.ts) no es un hook: escribe el bloqueo en el
// store de módulo (lib/tenant/blocked-state.ts). Este overlay se suscribe a ese store
// y monta la pantalla full-screen desde cualquier ruta del panel en cuanto una llamada
// devuelve 423/410. Se monta en el root layout (mismo patrón de superficie global que
// DialogProvider) para cubrir el panel sin depender de navegación.
import { useEffect, useState } from 'react';
import {
  getTenantBlocked,
  subscribeTenantBlocked,
  type TenantBlockedVariant,
} from '@/lib/tenant/blocked-state';
import { BlockedScreen } from './blocked-screen';

export function TenantBlockOverlay() {
  const [variant, setVariant] = useState<TenantBlockedVariant | null>(null);

  useEffect(() => {
    // Sincroniza el estado inicial (por si el bloqueo se fijó antes de montar) y
    // se suscribe a cambios posteriores del interceptor.
    setVariant(getTenantBlocked());
    return subscribeTenantBlocked(setVariant);
  }, []);

  if (!variant) return null;
  return <BlockedScreen variant={variant} />;
}
