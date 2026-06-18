'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { Sidebar } from './sidebar';
import { useProjects } from '@/lib/tenant-config-context';
import { GENERATED_TENANT } from '@/lib/config/generated-tenant';
import { isAuthed } from '@/lib/auth/session';
import { ArrowLeft, Download } from 'lucide-react';
import { generateAndDownload } from '@/lib/generate/build';
import { ROLES, type Role } from '@/lib/config/roles';
import { ThemeToggle } from './theme-toggle';

export function AppShell({ children }: { children: ReactNode }) {
  const { config, ready, hasActive, closeProject, role, setRole } = useProjects();
  const router = useRouter();
  // null = checking, true/false = resolved
  const [authedState, setAuthedState] = useState<boolean | null>(null);

  // Gate de login: solo en builds generados (cliente final) que aún NO tienen
  // landing importada. Al añadir landing (config.branding.designSource) el gate
  // desaparece y manda la landing. La consola fuente nunca se bloquea.
  const needsLogin = !!GENERATED_TENANT && !config.branding.designSource;

  useEffect(() => {
    if (!ready) return;
    if (!hasActive) { router.replace('/'); return; }
    if (!needsLogin) { setAuthedState(true); return; }
    isAuthed().then((authed) => {
      setAuthedState(authed);
      if (!authed) router.replace('/login');
    });
  }, [ready, hasActive, needsLogin, router]);

  if (!ready || !hasActive || (needsLogin && authedState !== true)) {
    return <div className="grid min-h-screen place-items-center bg-ink text-gray-400">Cargando…</div>;
  }

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

            <ThemeToggle />


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
