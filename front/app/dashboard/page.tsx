'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GENERATED_TENANT } from '@/lib/config/generated-tenant';
import { isAuthed, logout } from '@/lib/auth/session';
import { useProjects } from '@/lib/tenant-config-context';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { DashboardTabs } from '@/components/dashboard/dashboard-tabs';
import { Plus } from 'lucide-react';

export default function Consola() {
  const { ready, projects, config, openProject, deleteProject } = useProjects();
  const router = useRouter();
  const [busy] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  // Auth gate: requires active session.
  // Without session → /login. With session on generated build → /panel.
  useEffect(() => {
    if (!ready) return;
    isAuthed().then((authed) => {
      if (!authed) { router.replace('/login'); return; }
      if (GENERATED_TENANT) {
        if (config.branding.designSource) { router.replace('/panel'); return; }
        router.replace('/panel');
        return;
      }
      setAuthChecked(true);
    });
  }, [ready, config, router]);

  function nuevo() { router.push('/onboarding'); }
  async function cerrarSesion() { await logout(); router.replace('/login'); }
  function abrir(id: string) { openProject(id); router.push('/panel'); }
  // UC-1: "Editar" reopens ONBOARDING in edit mode (pre-loaded with the project config).
  function editar(id: string) { router.push(`/onboarding?projectId=${id}`); }

  // Icono "puerta" de salida.
  const LogoutIcon = ({ className = 'h-4 w-4' }: { className?: string }) => (
    <svg aria-hidden="true" className={className} fill="none" stroke="currentColor"
      strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M14 3h5v18h-5" />
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H3" />
    </svg>
  );

  if (!ready || !authChecked) return <div className="grid min-h-screen place-items-center bg-ink text-gray-400">Cargando…</div>;

  return (
    <div className="crm-console">
      {/* Premium dark header */}
      <header className="bg-ink">
        <div className="mx-auto max-w-5xl px-6 py-7">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl gold-gradient text-ink shadow-lg">
                <span className="font-display text-lg font-bold">O</span>
              </div>
              <div>
                <p className="font-display text-xl font-semibold text-[var(--panel-text)]">OperaOS · Consola</p>
                <p className="text-xs text-gray-400">Diseña y genera la app de gestión de cada cliente</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <button onClick={nuevo}
                className="inline-flex items-center gap-2 rounded-xl gold-gradient px-4 py-2.5 text-sm font-semibold text-ink shadow-md transition hover:opacity-90">
                <Plus className="h-4 w-4" /> Nuevo proyecto
              </button>
              <button onClick={cerrarSesion} title="Cerrar sesión" aria-label="Cerrar sesión"
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] px-4 py-2.5 text-sm font-medium text-[var(--panel-muted)] transition hover:border-[var(--acc)] hover:text-[var(--acc)]">
                <LogoutIcon /> Salir
              </button>
            </div>
          </div>
          <div className="mt-5 flex gap-6 text-sm">
            <div><span className="font-display text-2xl text-gold">{projects.length}</span><span className="ml-2 text-gray-400">proyectos</span></div>
            <div><span className="font-display text-2xl text-gold">{projects.filter((p) => p.generatedAt).length}</span><span className="ml-2 text-gray-400">generados</span></div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {/* Informational banner */}
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Generar</strong> descarga la especificación del proyecto (manifest + esquema). Para crear el
          <strong> CRM completo (back + front) con su <code>.env</code></strong>, ejecuta en la raíz:
          <code className="ml-1 rounded bg-amber-100 px-1.5 py-0.5">node generar.mjs</code>
          (o <code className="rounded bg-amber-100 px-1.5 py-0.5">--from manifest.json</code> del paquete).
        </div>

        {/* Main tabbed content: Dashboard (cards) + Exportar (multi-format export) */}
        <DashboardTabs
          projects={projects}
          busy={busy}
          onOpen={abrir}
          onEdit={editar}
          onDelete={deleteProject}
          onNew={nuevo}
        />
      </main>
    </div>
  );
}
