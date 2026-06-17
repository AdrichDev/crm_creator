'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useTenantConfig, useRole } from '@/lib/tenant-config-context';
import type { ModuleId } from '@/lib/config/modules';
import { moduleAllowedForRole } from '@/lib/config/roles';

// Redirige al panel si el módulo está desactivado en el negocio
// o si el perfil activo no tiene acceso a él.
export function ModuleGuard({ module, children }: { module: ModuleId; children: ReactNode }) {
  const { config, ready } = useTenantConfig();
  const { role } = useRole();
  const router = useRouter();
  const enabled = config.modules[module] && moduleAllowedForRole(role, module);
  useEffect(() => {
    if (ready && !enabled) router.replace('/panel');
  }, [ready, enabled, router]);
  if (!ready || !enabled) return null;
  return <>{children}</>;
}
