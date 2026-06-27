'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { MODULES, CATEGORY_LABEL, type ModuleCategory } from '@/lib/config/modules';
import { useProjects, useRole } from '@/lib/tenant-config-context';
import { resolveModuleEmoji } from '@/lib/config/icons';
import { cn } from '@/lib/utils';
import { moduleAllowedForRole, moduleFromPath, memberRoleLabel, DEMO_USERS, type Role } from '@/lib/config/roles';
import { GENERATED_TENANT } from '@/lib/config/generated-tenant';
import { isApiEnabled } from '@/lib/api/client';
import { getAuthProfile } from '@/lib/api/profile';
import { logout } from '@/lib/auth/session';
import { LogOut } from 'lucide-react';

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

export function Sidebar() {
  const { config, closeProject } = useProjects();
  const { role } = useRole();
  const pathname = usePathname();
  const router = useRouter();

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

  // Los módulos obligatorios (dashboard, configuración) se muestran siempre,
  // aunque una config antigua no los tenga marcados — el rol sigue filtrando.
  const active = MODULES.filter((m) => (config.modules[m.id] || m.mandatory) && moduleAllowedForRole(role, m.id));
  const groups = (Object.keys(CATEGORY_LABEL) as ModuleCategory[])
    .map((cat) => ({ cat, items: active.filter((m) => m.category === cat) }))
    .filter((g) => g.items.length > 0);

  // Pie del sidebar: usuario REAL de la sesión cuando hay backend; si no
  // (consola fuente demo) se usa el usuario demo del rol activo. Fallback
  // "Invitado" si la sesión no resuelve.
  const apiOn = isApiEnabled();
  const [realUser, setRealUser] = useState<{ nombre: string; iniciales: string; rolLabel: string } | null>(null);

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
        });
      })
      .catch(() => { if (!cancelled) setRealUser(null); });
    return () => { cancelled = true; };
  }, [apiOn]);

  const demo = DEMO_USERS[role];
  const user = apiOn
    ? (realUser ?? { nombre: 'Invitado', iniciales: '–', rolLabel: '' })
    : { nombre: demo.nombre, iniciales: demo.iniciales, rolLabel: demo.rolLabel };
  const rolLabel = user.rolLabel;

  // "Salir": en un build generado (cliente final) cierra sesión y vuelve al
  // login. En la consola fuente cierra el proyecto y vuelve al dashboard general.
  async function salir() {
    if (GENERATED_TENANT) { await logout(); router.replace('/login'); return; }
    closeProject(); router.push('/dashboard');
  }

  return (
    <aside className="opera-sidebar dark-scroll">
      {/* Identidad del negocio */}
      <div className="flex items-center gap-3 px-5 pt-5">
        <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl text-sm font-bold text-white shadow-lg"
          style={config.branding.logoImage ? undefined : { background: 'linear-gradient(135deg, var(--brand-secondary), var(--brand-primary))' }}>
          {config.branding.logoImage
            ? <img src={config.branding.logoImage} alt="logo" className="h-full w-full object-cover" />
            : config.branding.logoText}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{config.business.name}</p>
          <p className="truncate text-xs capitalize text-gold">{config.business.vertical}</p>
        </div>
      </div>

      <p className="opera-sidebar-title">{PANEL_TITLE[role]}</p>

      <nav className="opera-sidebar-links">
        {groups.map((g) => (
          <div key={g.cat}>
            <p className="group-label">{CATEGORY_LABEL[g.cat]}</p>
            <ul className="m-0 list-none p-0">
              {g.items.map((m) => {
                const label = config.terminology[m.termKey] ?? m.defaultLabel;
                const isActive = pathname === m.href || (m.href !== '/panel' && pathname.startsWith(m.href));
                return (
                  <li key={m.id}>
                    <Link href={m.href} className={cn(isActive && 'active')}>
                      <span className="w-5 text-center text-base leading-none">{resolveModuleEmoji(config.business.vertical, m.id, config.moduleEmojis)}</span>
                      <span className="truncate">{label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Usuario logado (según perfil activo) + salir */}
      <div className="opera-sidebar-foot">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold text-white shadow"
            style={{ background: 'linear-gradient(135deg, var(--brand-secondary), var(--brand-primary))' }}>
            {user.iniciales}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{user.nombre}</p>
            <p className="truncate text-[11px] text-gold">{rolLabel}</p>
          </div>
          <button onClick={salir} title="Salir"
            className="rounded-lg p-2 text-gray-400 transition hover:bg-white/5 hover:text-red-400">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
