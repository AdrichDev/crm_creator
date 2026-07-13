'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { MODULES, CATEGORY_LABEL } from '@/lib/config/modules';
import { groupModules } from '@/lib/config/module-category';
import { useProjects, useRole } from '@/lib/tenant-config-context';
import { resolveModuleEmoji } from '@/lib/config/icons';
import { cn } from '@/lib/utils';
import { moduleAllowedForRole, moduleFromPath, memberRoleLabel, DEMO_USERS, type Role } from '@/lib/config/roles';
import { GENERATED_TENANT } from '@/lib/config/generated-tenant';
import { isApiEnabled, apiFetch } from '@/lib/api/client';
import { getAuthProfile } from '@/lib/api/profile';
import { logout, getCurrentUser, type SessionUser } from '@/lib/auth/session';
import { LogOut, Settings } from 'lucide-react';
import { ThemeToggle } from './theme-toggle';

const PANEL_TITLE: Record<Role, string> = {
  admin: 'Centro de Mando',
  trabajador: 'Mi Panel',
  cliente: 'Mi Cuenta',
};

/** Iniciales a partir del nombre completo (2 primeras palabras). */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '–';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export interface FooterUser { nombre: string; iniciales: string; rolLabel: string; email: string; }

/**
 * Identidad del pie del sidebar. Prioridad (evita SUPLANTAR identidad con un fixture):
 *  1) realUser (/auth/me): identidad + rol reales.
 *  2) sessionUser (hay sesión Supabase REAL pero la API no resolvió — caída o sin
 *     NEXT_PUBLIC_API_URL): se muestra el email real SIN rol, nunca el usuario demo.
 *  3) showcase sin sesión NI API: usuario demo del rol (modo demostración legítimo).
 *  4) API disponible pero sin identidad: "Invitado".
 * El usuario demo solo aparece cuando NO hay ninguna sesión autenticada.
 */
export function resolveFooterUser(
  realUser: FooterUser | null,
  sessionUser: SessionUser | null,
  apiOn: boolean,
  demo: { nombre: string; iniciales: string; rolLabel: string; email: string },
): FooterUser {
  if (realUser) return realUser;
  if (sessionUser) {
    const nombre = sessionUser.email || 'Tu cuenta';
    return { nombre, iniciales: initialsOf(nombre), rolLabel: '', email: sessionUser.email };
  }
  if (apiOn) return { nombre: 'Invitado', iniciales: '–', rolLabel: '', email: '' };
  return { nombre: demo.nombre, iniciales: demo.iniciales, rolLabel: demo.rolLabel, email: demo.email };
}

export function Sidebar({ mobileOpen = false, onNavigate }: { mobileOpen?: boolean; onNavigate?: () => void } = {}) {
  const { config, closeProject } = useProjects();
  const { role } = useRole();
  const pathname = usePathname();
  const router = useRouter();

  // Colapsar/expandir sidebar (paridad con agents-agency: misma clave de
  // localStorage para consistencia entre productos hermanos).
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(localStorage.getItem('sidebar-collapsed') === 'true');
  }, []);
  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('sidebar-collapsed', String(next));
  };

  // Guard centralizado: si el módulo de la ruta actual no está permitido para
  // el rol → redirige al destino apropiado. Así un cliente que escriba
  // /configuracion en la barra de direcciones es redirigido a /cuenta.
  useEffect(() => {
    const moduleId = moduleFromPath(pathname);
    if (moduleId && !moduleAllowedForRole(role, moduleId)) {
      // Para el cliente, la home es /cuenta (Mi Cuenta).
      // Para otros roles sin acceso a una ruta concreta, se va al panel.
      const fallback = role === 'cliente' ? '/cuenta' : '/panel';
      router.replace(fallback);
    }
  }, [pathname, role, router]);

  // Configuración y Mi Cuenta ya viven en el popover de cuenta del pie del sidebar
  // (ver más abajo) — no se duplican como items sueltos en el nav principal.
  const HIDDEN_FROM_NAV = new Set(['configuracion', 'mi-cuenta']);

  // Los módulos obligatorios (dashboard, configuración) se muestran siempre,
  // aunque una config antigua no los tenga marcados — el rol sigue filtrando.
  const active = MODULES.filter(
    (m) => !HIDDEN_FROM_NAV.has(m.id) && (config.modules[m.id] || m.mandatory) && moduleAllowedForRole(role, m.id)
  );
  const groups = groupModules(active, config.business.vertical);

  // Pie del sidebar: usuario REAL de la sesión cuando hay backend; si no
  // (consola fuente demo) se usa el usuario demo del rol activo. Fallback
  // "Invitado" si la sesión no resuelve.
  const apiOn = isApiEnabled();
  const [realUser, setRealUser] = useState<FooterUser | null>(null);
  // Sesión Supabase REAL (email), leída sin red: distingue "login real, API caída" de
  // "modo demo sin sesión" → nunca mostrar el usuario demo si el usuario está autenticado.
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Contactos pendientes de contactar (badge del nav, paridad con agents-agency).
  // Refetch en cada cambio de ruta: sin esto el contador queda obsoleto tras marcar
  // un contacto como "contactado" desde /contactos (mismo gotcha ya resuelto en AA,
  // ver Sidebar.tsx de agents-agency: aa-badge-contactos-pendientes-stale).
  const [pendingContactos, setPendingContactos] = useState(0);
  useEffect(() => {
    if (!apiOn) { setPendingContactos(0); return; }
    let cancelled = false;
    apiFetch<{ count: number }>('/contactos/pending-count')
      .then((d) => { if (!cancelled) setPendingContactos(d.count); })
      .catch(() => { if (!cancelled) setPendingContactos(0); });
    return () => { cancelled = true; };
  }, [apiOn, pathname]);

  useEffect(() => {
    if (!apiOn) { setRealUser(null); return; }
    let cancelled = false;
    getAuthProfile()
      .then((p) => {
        if (cancelled) return;
        const nombre = `${p.firstName} ${p.lastName ?? ''}`.trim() || p.email;
        // rolLabel del rol REAL del usuario (membresía del back), no del selector "Ver como".
        setRealUser({
          nombre,
          iniciales: initialsOf(nombre),
          rolLabel: memberRoleLabel(p.role),
          email: p.email,
        });
      })
      .catch(() => { if (!cancelled) setRealUser(null); });
    return () => { cancelled = true; };
  }, [apiOn]);

  // Sesión Supabase real (email), leída sin red. Refetch por ruta para reflejar el login.
  useEffect(() => {
    let cancelled = false;
    getCurrentUser()
      .then((u) => { if (!cancelled) setSessionUser(u); })
      .catch(() => { if (!cancelled) setSessionUser(null); });
    return () => { cancelled = true; };
  }, [pathname]);

  const demo = DEMO_USERS[role];
  const user = resolveFooterUser(realUser, sessionUser, apiOn, demo);
  const rolLabel = user.rolLabel;

  // Cierra el popover de cuenta al hacer clic fuera o al pulsar Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // "Salir": en un build generado (cliente final) cierra sesión y vuelve al
  // login. En la consola fuente cierra el proyecto y vuelve al dashboard general.
  async function salir() {
    if (GENERATED_TENANT) { await logout(); router.replace('/login'); return; }
    closeProject(); router.push('/dashboard');
  }

  return (
    <aside className={cn('opera-sidebar dark-scroll relative', collapsed && 'opera-sidebar-collapsed', mobileOpen && 'opera-sidebar-mobile-open')}>
      {/* Botón de colapso (paridad visual con agents-agency: misma posición/flechas) */}
      <button
        onClick={toggleCollapse}
        title={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
        className="absolute top-4 right-0 z-10 flex h-8 w-8 items-center justify-center rounded-l-lg border text-base font-bold transition"
        style={{ background: 'var(--hover-bg)', borderColor: 'var(--line)', color: 'var(--acc)' }}
      >
        {collapsed ? '>' : '<'}
      </button>

      {/* Identidad del negocio */}
      <div className={cn('flex items-center gap-3', collapsed ? 'justify-center px-2 pt-16 pb-2' : 'px-5 pt-5')}>
        <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl text-sm font-bold text-white shadow-lg"
          style={config.branding.logoImage ? undefined : { background: 'linear-gradient(135deg, var(--brand-secondary), var(--brand-primary))' }}>
          {config.branding.logoImage
            ? <img src={config.branding.logoImage} alt="logo" className="h-full w-full object-cover" />
            : config.branding.logoText}
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{config.business.name}</p>
            <p className="truncate text-xs capitalize text-gold">{config.business.vertical}</p>
          </div>
        )}
      </div>

      {!collapsed && <p className="opera-sidebar-title">{PANEL_TITLE[role]}</p>}

      <nav className="opera-sidebar-links" onClick={onNavigate}>
        {groups.map((g) => (
          <div key={g.cat}>
            {!collapsed && <p className="group-label">{CATEGORY_LABEL[g.cat]}</p>}
            <ul className="m-0 list-none p-0">
              {g.items.map((m) => {
                const label = config.terminology[m.termKey] ?? m.defaultLabel;
                const isActive = pathname === m.href || (m.href !== '/panel' && pathname.startsWith(m.href));
                return (
                  <li key={m.id}>
                    <Link
                      href={m.href}
                      title={collapsed ? label : undefined}
                      className={cn(isActive && 'active', collapsed && 'relative justify-center')}
                    >
                      <span className="w-5 text-center text-base leading-none">{resolveModuleEmoji(config.business.vertical, m.id, config.moduleEmojis)}</span>
                      {!collapsed && <span className="truncate">{label}</span>}
                      {m.id === 'contactos' && pendingContactos > 0 && (
                        <span
                          title={`${pendingContactos} contacto(s) pendiente(s) de contactar`}
                          className={cn(
                            'grid h-5 min-w-[20px] shrink-0 place-items-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold leading-none text-white',
                            collapsed ? 'absolute right-1 top-1' : 'ml-auto'
                          )}
                        >
                          {pendingContactos}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Usuario logado (según perfil activo) + menú de cuenta (Configuración/Mi Cuenta/Salir) */}
      <div className="opera-sidebar-foot">
        <div className={cn('relative flex items-center px-2 py-2', collapsed ? 'flex-col justify-center gap-2' : 'gap-3')} ref={menuRef}>
          {!collapsed && (
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold text-white shadow"
              style={{ background: 'linear-gradient(135deg, var(--brand-secondary), var(--brand-primary))' }}>
              {user.iniciales}
            </div>
          )}
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{user.nombre}</p>
              <p className="truncate text-[11px] text-gold">{rolLabel}</p>
            </div>
          )}

          {collapsed && (
            <button
              onClick={() => setMenuOpen((v) => !v)}
              title="Cuenta"
              aria-expanded={menuOpen}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold text-white shadow"
              style={{ background: 'linear-gradient(135deg, var(--brand-secondary), var(--brand-primary))' }}
            >
              {user.iniciales}
            </button>
          )}

          {/* Modo oscuro/claro: en MÓVIL vive aquí (junto a la cuenta), no en el header
              estrecho donde causaba wrap. En desktop (md+) sigue en el header. */}
          {!collapsed && (
            <span className="inline-flex md:hidden"><ThemeToggle /></span>
          )}

          {!collapsed && (
            <button
              onClick={() => setMenuOpen((v) => !v)}
              title="Cuenta"
              aria-expanded={menuOpen}
              className="rounded-lg p-2 text-gray-400 transition hover:bg-[var(--hover-bg)] hover:text-[var(--acc)]"
            >
              <Settings className="h-4 w-4" />
            </button>
          )}

          {menuOpen && (
            <div
              className={cn('absolute bottom-full mb-2 w-56 rounded-xl shadow-xl z-20 overflow-hidden', collapsed ? 'left-0' : 'right-0')}
              style={{ background: 'var(--panel-card)', border: '1px solid var(--line)' }}
            >
              <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--line)' }}>
                <p className="truncate text-[11px] text-gray-400">{user.email || 'sin sesión'}</p>
              </div>
              <div className="py-1">
                {moduleAllowedForRole(role, 'configuracion') && (
                  <Link
                    href="/configuracion"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-gray-300 transition hover:bg-[var(--hover-bg)] hover:text-[var(--hover-text)]"
                  >
                    <span className="text-base">⚙️</span> Configuración
                  </Link>
                )}
                <Link
                  href="/cuenta"
                  className="flex items-center gap-2 px-3 py-2 text-sm text-gray-300 transition hover:bg-[var(--hover-bg)] hover:text-[var(--hover-text)]"
                >
                  <span className="text-base">👤</span> Mi Cuenta
                </Link>
              </div>
              <div className="py-1 flex items-center justify-center gap-3 text-[11px] text-gray-400" style={{ borderTop: '1px solid var(--line)' }}>
                <Link href="/privacidad" className="transition hover:text-[var(--acc)]">Privacidad</Link>
                <span aria-hidden>·</span>
                <Link href="/aviso-legal" className="transition hover:text-[var(--acc)]">Aviso legal</Link>
              </div>
              <div className="py-1" style={{ borderTop: '1px solid var(--line)' }}>
                <button
                  onClick={salir}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-400 transition hover:bg-red-500/10"
                >
                  <LogOut className="h-4 w-4" /> Cerrar sesión
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
