'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { MODULES, CATEGORY_LABEL, type ModuleCategory } from '@/lib/config/modules';
import { useProjects, useRole } from '@/lib/tenant-config-context';
import { resolveModuleEmoji } from '@/lib/config/icons';
import { cn } from '@/lib/utils';
import { moduleAllowedForRole, DEMO_USERS, type Role } from '@/lib/config/roles';
import { GENERATED_TENANT } from '@/lib/config/generated-tenant';
import { logout } from '@/lib/auth/session';
import { LogOut } from 'lucide-react';

const PANEL_TITLE: Record<Role, string> = {
  admin: 'Centro de Mando',
  trabajador: 'Mi Panel',
  cliente: 'Mi Cuenta',
};

export function Sidebar() {
  const { config, closeProject } = useProjects();
  const { role } = useRole();
  const pathname = usePathname();
  const router = useRouter();

  // Los módulos obligatorios (dashboard, configuración) se muestran siempre,
  // aunque una config antigua no los tenga marcados — el rol sigue filtrando.
  const active = MODULES.filter((m) => (config.modules[m.id] || m.mandatory) && moduleAllowedForRole(role, m.id));
  const groups = (Object.keys(CATEGORY_LABEL) as ModuleCategory[])
    .map((cat) => ({ cat, items: active.filter((m) => m.category === cat) }))
    .filter((g) => g.items.length > 0);

  const user = DEMO_USERS[role];

  // "Salir": en un build generado (cliente final) cierra sesión y vuelve al
  // login. En la consola fuente cierra el proyecto y vuelve al dashboard general.
  function salir() {
    if (GENERATED_TENANT) { logout(); router.replace('/login'); return; }
    closeProject(); router.push('/');
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
            <p className="truncate text-[11px] text-gold">{user.rolLabel}</p>
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
