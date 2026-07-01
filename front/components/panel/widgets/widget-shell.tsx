import type { ReactNode } from 'react';
import { Icon } from '@/components/ui/icon';

/** Cabecera icono+label común a los widgets "glanceable" (todos salvo Agenda). */
export function WidgetShell({ icon, label, children }: { icon: string; label: string; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center gap-2 pr-8">
        <div
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white"
          style={{ background: 'linear-gradient(135deg, var(--acc), var(--brand-secondary, var(--acc)))' }}
        >
          <Icon name={icon} className="h-4 w-4" />
        </div>
        <p className="truncate text-xs font-semibold uppercase tracking-wide text-[var(--panel-muted)]">{label}</p>
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}
