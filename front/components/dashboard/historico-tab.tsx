'use client';
// crm-generator-versiones-historico (WU7): pestaña "Histórico" — selector de
// negocio + `LifecycleControl` embebido tal cual (sin refactor, sin tabla de
// eventos nueva: el componente ya la renderiza internamente). Sin lógica de
// gate/hide/disable por rol alrededor (decisión de usuario cerrada, tasks.md
// 7.2): la autorización real la aplican los proxies `/api/operator/**`
// server-side.
//
// El selector solo lista negocios con ≥1 export real (`ExportVersion` vía
// `/exports/versions`): encender/apagar servicio no tiene sentido para un
// proyecto que nunca se generó/desplegó.
import { useEffect, useMemo, useState } from 'react';
import type { Project } from '@/lib/tenant-config-context';
import { LifecycleControl } from '@/app/(operador)/negocios/[id]/lifecycle-control';
import { fetchExportVersions } from '@/lib/api/exports-history';

interface HistoricoTabProps {
  projects: Project[];
}

export function HistoricoTab({ projects }: HistoricoTabProps) {
  const [exportedIds, setExportedIds] = useState<Set<string> | null>(null);
  const [selected, setSelected] = useState<string>('');

  useEffect(() => {
    fetchExportVersions().then((data) => {
      setExportedIds(new Set(data.versions.map((v) => v.businessId)));
    });
  }, []);

  const exported = useMemo(
    () => (exportedIds ? projects.filter((p) => exportedIds.has(p.id)) : []),
    [projects, exportedIds],
  );

  useEffect(() => {
    if (exported.length > 0 && !exported.some((p) => p.id === selected)) {
      setSelected(exported[0].id);
    }
  }, [exported, selected]);

  if (exportedIds === null) {
    return <p className="text-sm text-[var(--panel-muted)]">Cargando…</p>;
  }

  if (exported.length === 0) {
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
          {exported.map((p) => (
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
