'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useTenantConfig, useRole } from '@/lib/tenant-config-context';
import { MODULE_MAP, type ModuleId } from '@/lib/config/modules';
import { moduleAllowedForRole } from '@/lib/config/roles';

// Redirige al panel si el módulo está desactivado en el negocio
// o si el perfil activo no tiene acceso a él. Los módulos `mandatory` pasan
// aunque una config antigua (previa a la existencia del módulo) no los tenga
// marcados en `config.modules` — mismo fallback que ya usa el sidebar.
export function ModuleGuard({ module, children }: { module: ModuleId; children: ReactNode }) {
  const { config, ready } = useTenantConfig();
  const { role } = useRole();
  const router = useRouter();
  const enabled = (config.modules[module] || MODULE_MAP[module]?.mandatory) && moduleAllowedForRole(role, module);
  useEffect(() => {
    if (ready && !enabled) router.replace('/panel');
  }, [ready, enabled, router]);
  if (!ready || !enabled) return null;
  return <>{children}</>;
}
