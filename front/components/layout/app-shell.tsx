'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { Sidebar } from './sidebar';
import { useProjects } from '@/lib/tenant-config-context';
import { ArrowLeft, Download } from 'lucide-react';
import { generateAndDownload } from '@/lib/generate/build';
import { ROLES, type Role } from '@/lib/config/roles';

export function AppShell({ children }: { children: ReactNode }) {
  const { config, ready, hasActive, closeProject, role, setRole } = useProjects();
  const router = useRouter();

  useEffect(() => {
    if (ready && !hasActive) router.replace('/');
  }, [ready, hasActive, router]);

  if (!ready || !hasActive) return <div className="grid min-h-screen place-items-center bg-ink text-gray-400">Cargando…</div>;

  function volver() { closeProject(); router.push('/'); }

  return (
    <div className="opera-shell">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="opera-header">
          <h1 className="opera-brand-title">
            {config.business.name} <span className="accent">· PANEL</span>
          </h1>

          <div className="flex items-center gap-3">
            <button onClick={volver} className="btn btn-outline btn-sm">
              <ArrowLeft className="h-4 w-4" /> Volver
            </button>

            {/* Selector de perfil (filtrado de vista) */}
            <label className="opera-role-select">
              <span className="hidden text-xs text-gray-400 sm:inline">Ver como</span>
              <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </label>

            {role === 'admin' && (
              <button onClick={() => generateAndDownload(config)} className="btn btn-primary btn-sm">
                <Download className="h-4 w-4" /> Generar paquete
              </button>
            )}
          </div>
        </header>
        <main className="opera-main dark-scroll">
          {config.tenantEnabled === false && (
            <div className="mb-5 rounded-lg border-l-4 border-amber-400 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
              <strong>Tenant en mantenimiento.</strong> Las operaciones pueden estar limitadas mientras se realizan actualizaciones o la sincronización con la base de datos. Reactívalo en Configuración → Estado.
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
