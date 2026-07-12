'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Sidebar } from './sidebar';
import { useProjects } from '@/lib/tenant-config-context';
import { GENERATED_TENANT } from '@/lib/config/generated-tenant';
import { isAuthed } from '@/lib/auth/session';
import { ArrowLeft, Menu } from 'lucide-react';
import { ROLES, type Role } from '@/lib/config/roles';
import { ThemeToggle } from './theme-toggle';
import { NotificationBell } from './notification-bell';

export function AppShell({ children }: { children: ReactNode }) {
  const { config, ready, hasActive, closeProject, role, setRole } = useProjects();
  const router = useRouter();
  // null = checking, true/false = resolved
  const [authedState, setAuthedState] = useState<boolean | null>(null);
  // Drawer de navegación en móvil (< md): el sidebar sale como overlay.
  const [navOpen, setNavOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => { setNavOpen(false); }, [pathname]); // cerrar el drawer al navegar

  // Gate de login: solo en builds generados (cliente final) que aún NO tienen
  // landing importada. Al añadir landing (config.branding.designSource) el gate
  // desaparece y manda la landing. La consola fuente nunca se bloquea.
  const needsLogin = !!GENERATED_TENANT && !config.branding.designSource;

  useEffect(() => {
    if (!ready) return;
    if (!hasActive) { router.replace('/dashboard'); return; }
    if (!needsLogin) { setAuthedState(true); return; }
    isAuthed().then((authed) => {
      setAuthedState(authed);
      if (!authed) router.replace('/login');
    });
  }, [ready, hasActive, needsLogin, router]);

  if (!ready || !hasActive || (needsLogin && authedState !== true)) {
    return <div className="grid min-h-screen place-items-center bg-ink text-gray-400">Cargando…</div>;
  }

  function volver() { closeProject(); router.push('/dashboard'); }

  return (
    <div className="opera-shell">
      <Sidebar mobileOpen={navOpen} onNavigate={() => setNavOpen(false)} />
      {/* Backdrop del drawer móvil: al pulsar fuera, cierra. */}
      {navOpen && <div className="opera-nav-backdrop" onClick={() => setNavOpen(false)} aria-hidden />}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="opera-header">
          <div className="flex min-w-0 items-center gap-2">
            {/* Hamburguesa: solo visible en móvil (CSS). Abre el drawer del sidebar. */}
            <button type="button" className="opera-hamburger" aria-label="Abrir menú" onClick={() => setNavOpen(true)}>
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="opera-brand-title truncate">
              {config.business.name} <span className="accent">· PANEL</span>
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {/* "Volver" (a la consola de proyectos) y "Ver como" son herramientas de la
                PLATAFORMA OperaOS (pruebas): solo se muestran en la consola fuente, NUNCA
                en un CRM exportado (GENERATED_TENANT = build de un solo cliente). */}
            {!GENERATED_TENANT && (
              <button onClick={volver} className="btn btn-outline btn-sm">
                <ArrowLeft className="h-4 w-4" /> Volver
              </button>
            )}

            <ThemeToggle />

            <NotificationBell />

            {!GENERATED_TENANT && (
              <label className="opera-role-select">
                <span className="hidden text-xs text-gray-400 sm:inline">Ver como</span>
                <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                  {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              </label>
            )}
          </div>
        </header>
        <main className="opera-main dark-scroll">
          {/* Wrapper de contenido: ancho máximo centrado en monitores anchos.
              Los modales fixed inset-0 de las páginas no se ven afectados
              (max-width de un ancestro no recorta elementos position:fixed). */}
          <div className="opera-content">
            {config.tenantEnabled === false && (
              <div className="mb-5 rounded-lg border-l-4 border-amber-400 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
                <strong>Tenant en mantenimiento.</strong> Las operaciones pueden estar limitadas mientras se realizan actualizaciones o la sincronización con la base de datos. Reactívalo en Configuración → Estado.
              </div>
            )}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
