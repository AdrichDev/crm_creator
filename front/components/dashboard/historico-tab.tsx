'use client';
// crm-generator-versiones-historico (WU7): pestaña "Histórico" — selector de
// negocio + `LifecycleControl` embebido tal cual (sin refactor, sin tabla de
// eventos nueva: el componente ya la renderiza internamente). Sin lógica de
// gate/hide/disable por rol alrededor (decisión de usuario cerrada, tasks.md
// 7.2): la autorización real la aplican los proxies `/api/operator/**`
// server-side.
import { useState } from 'react';
import type { Project } from '@/lib/tenant-config-context';
import { LifecycleControl } from '@/app/(operador)/negocios/[id]/lifecycle-control';

interface HistoricoTabProps {
  projects: Project[];
}

export function HistoricoTab({ projects }: HistoricoTabProps) {
  const [selected, setSelected] = useState<string>(projects[0]?.id ?? '');

  if (projects.length === 0) {
    return <p className="text-sm text-[var(--panel-muted)]">No hay proyectos generados todavía.</p>;
  }

  return (
    <div className="space-y-4">
      <label className="flex flex-col gap-1 text-xs text-[var(--panel-muted)] max-w-sm">
        Negocio
        <select
          aria-label="Negocio"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-sm text-[var(--panel-text)]"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.config.business.name}
            </option>
          ))}
        </select>
      </label>

      {selected && <LifecycleControl businessId={selected} />}
    </div>
  );
}
