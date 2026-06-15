'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { MODULES, CATEGORY_LABEL, type ModuleCategory } from '@/lib/config/modules';
import { useProjects } from '@/lib/tenant-config-context';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';
import { LayoutGrid } from 'lucide-react';

export function Sidebar() {
  const { config, closeProject } = useProjects();
  const pathname = usePathname();
  const router = useRouter();

  const active = MODULES.filter((m) => config.modules[m.id]);
  const groups = (Object.keys(CATEGORY_LABEL) as ModuleCategory[])
    .map((cat) => ({ cat, items: active.filter((m) => m.category === cat) }))
    .filter((g) => g.items.length > 0);

  function toConsole() { closeProject(); router.push('/'); }

  return (
    <aside className="dark-scroll hidden w-64 shrink-0 flex-col border-r border-line bg-ink md:flex">
      {/* Identidad del proyecto */}
      <div className="flex items-center gap-3 px-5 py-5">
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

      {/* Volver al dashboard general */}
      <div className="px-3 pb-2">
        <button onClick={toConsole}
          className="flex w-full items-center gap-2.5 rounded-xl border border-line px-3 py-2 text-sm text-gray-300 transition hover:border-[var(--gold)] hover:text-gold">
          <LayoutGrid className="h-4 w-4" /> Todos los proyectos
        </button>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6">
        {groups.map((g) => (
          <div key={g.cat}>
            <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">{CATEGORY_LABEL[g.cat]}</p>
            <ul className="space-y-0.5">
              {g.items.map((m) => {
                const label = config.terminology[m.termKey] ?? m.defaultLabel;
                const isActive = pathname === m.href || (m.href !== '/panel' && pathname.startsWith(m.href));
                return (
                  <li key={m.id}>
                    <Link href={m.href}
                      className={cn('flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition',
                        isActive
                          ? 'bg-ink-2 text-gold ring-1 ring-[var(--gold)]/30'
                          : 'text-gray-400 hover:bg-white/5 hover:text-white')}>
                      <Icon name={m.icon} className="h-4 w-4" />
                      <span className="truncate">{label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-line px-5 py-3">
        <p className="font-display text-sm text-gold">OperaOS</p>
        <p className="text-[11px] text-gray-500">Business OS para negocios locales</p>
      </div>
    </aside>
  );
}
