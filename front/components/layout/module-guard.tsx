'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useTenantConfig } from '@/lib/tenant-config-context';
import type { ModuleId } from '@/lib/config/modules';

// Si el módulo está desactivado, redirige al panel.
export function ModuleGuard({ module, children }: { module: ModuleId; children: ReactNode }) {
  const { config, ready } = useTenantConfig();
  const router = useRouter();
  const enabled = config.modules[module];
  useEffect(() => {
    if (ready && !enabled) router.replace('/panel');
  }, [ready, enabled, router]);
  if (!ready || !enabled) return null;
  return <>{children}</>;
}
