'use client';

import { useState, useEffect, useRef } from 'react';
import type { Project } from '@/lib/tenant-config-context';
import { VERTICAL_MAP } from '@/lib/config/verticals';
import { apiFetch, isApiEnabled } from '@/lib/api/client';
import type { ClientLite } from '@/lib/clients/picker';
import type { BuildFormat } from '@/lib/export/types';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

const FORMAT_LABEL: Record<BuildFormat, string> = {
  'web-zip': 'Web (ZIP)',
  exe: 'Escritorio (ZIP)',
  apk: 'Android (ZIP)',
  ipa: 'iOS (ZIP)',
};

const ALL_FORMATS: BuildFormat[] = ['web-zip', 'exe', 'apk', 'ipa'];

type SortCol = 'name' | 'client' | 'vertical';

interface ExportTableProps {
  projects: Project[];
  codeMap: Record<string, string>;
  isRunning: boolean;
  exportingProjectId?: string;
  onExport: (projectId: string, formats: BuildFormat[], outputDir: string) => void;
}

function AnimatingDots() {
  const [dots, setDots] = useState('');
  useEffect(() => {
    const id = setInterval(() => {
      setDots(d => d.length >= 3 ? '' : d + '.');
    }, 500);
    return () => clearInterval(id);
  }, []);
  return <span className="inline-block w-4 text-left">{dots}</span>;
}

export function ExportTable({ projects, codeMap, isRunning, exportingProjectId, onExport }: ExportTableProps) {
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<Record<string, Set<BuildFormat>>>({});
  const [tenantMap, setTenantMap] = useState<Record<string, string>>({});
  const [sortCol, setSortCol] = useState<SortCol | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [pickingFor, setPickingFor] = useState<string | null>(null);

  useEffect(() => {
    if (!isApiEnabled()) return;
    apiFetch<ClientLite[]>('/tenants')
      .then((data) => {
        if (!Array.isArray(data)) return;
        setTenantMap(Object.fromEntries(data.map((c) => [c.id, c.nombre])));
      })
      .catch(() => {});
  }, []);

  const prevExportingIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (prevExportingIdRef.current && !exportingProjectId) {
      // La exportación para este proyecto acaba de terminar (pasó de tener un ID a undefined)
      const finishedProjectId = prevExportingIdRef.current;
      setSelected((prev) => {
        const next = { ...prev };
        delete next[finishedProjectId];
        return next;
      });
    }
    prevExportingIdRef.current = exportingProjectId;
  }, [exportingProjectId]);

  function getFormats(id: string): Set<BuildFormat> {
    return selected[id] ?? new Set<BuildFormat>();
  }

  function toggleFormat(id: string, fmt: BuildFormat) {
    setSelected((prev) => {
      const cur = new Set(prev[id] ?? []);
      if (cur.has(fmt)) cur.delete(fmt); else cur.add(fmt);
      return { ...prev, [id]: cur };
    });
  }

  function handleSort(col: SortCol) {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortCol(col); setSortDir('asc'); }
  }

  async function handleExportRow(projectId: string, fmts: Set<BuildFormat>) {
    if (fmts.size === 0 || isRunning || pickingFor) return;
    let dir: string | null = null;
    if (isApiEnabled()) {
      setPickingFor(projectId);
      try {
        const res = await apiFetch<{ path?: string }>('/exports/pick-folder');
        dir = res?.path ?? null;
      } catch {
        // Cancelado o sin GUI
        dir = null;
      } finally {
        setPickingFor(null);
      }

      // FALLBACK: Si falla el popup nativo (o el usuario canceló sin querer), le damos la opción de pegar la ruta
      if (!dir) {
        dir = window.prompt(
          'No se pudo obtener la ruta automáticamente o cancelaste. Pega la ruta absoluta donde quieres guardar la exportación (ej: C:\\Users\\Adrian\\Desktop):'
        );
        if (!dir) return; // Si vuelve a cancelar, abortamos.
      }
    } else {
      // Modo dev sin API: directorio por defecto.
      dir = './exports';
    }
    onExport(projectId, Array.from(fmts), dir);
  }

  const filtered = projects.filter((p) => {
    const q = filter.toLowerCase();
    const clientName = tenantMap[p.config.business.clienteId ?? ''] ?? '';
    return (
      p.config.business.name.toLowerCase().includes(q) ||
      (p.config.business.vertical ?? '').toLowerCase().includes(q) ||
      clientName.toLowerCase().includes(q)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    if (!sortCol) return 0;
    let va = '';
    let vb = '';
    if (sortCol === 'name') { va = a.config.business.name; vb = b.config.business.name; }
    if (sortCol === 'client') {
      va = tenantMap[a.config.business.clienteId ?? ''] ?? '';
      vb = tenantMap[b.config.business.clienteId ?? ''] ?? '';
    }
    if (sortCol === 'vertical') { va = a.config.business.vertical; vb = b.config.business.vertical; }
    const cmp = va.localeCompare(vb, 'es', { sensitivity: 'base' });
    return sortDir === 'asc' ? cmp : -cmp;
  });

  function SortIcon({ col }: { col: SortCol }) {
    if (sortCol !== col) return <ChevronsUpDown className="inline h-3.5 w-3.5 ml-1 opacity-30" />;
    return sortDir === 'asc'
      ? <ChevronUp className="inline h-3.5 w-3.5 ml-1 opacity-50" />
      : <ChevronDown className="inline h-3.5 w-3.5 ml-1 opacity-50" />;
  }

  return (
    <div className="space-y-4">
      <input
        type="text"
        placeholder="Filtrar proyectos…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-full rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm text-[var(--panel-text)] placeholder:text-[var(--panel-muted)] outline-none focus:border-[var(--panel-muted)]"
      />

      {sorted.length === 0 ? (
        <div className="py-12 text-center text-sm text-[var(--panel-muted)]">
          No hay proyectos que coincidan con el filtro.
        </div>
      ) : (
        <div className="panel export-panel">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th
                    role="columnheader"
                    aria-sort={sortCol === 'name' ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={sortCol === 'name' ? 'sorted' : ''}
                    onClick={() => handleSort('name')}
                  >
                    Proyecto <SortIcon col="name" />
                  </th>
                  <th
                    role="columnheader"
                    aria-sort={sortCol === 'client' ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={sortCol === 'client' ? 'sorted' : ''}
                    onClick={() => handleSort('client')}
                  >
                    Cliente <SortIcon col="client" />
                  </th>
                  <th
                    role="columnheader"
                    aria-sort={sortCol === 'vertical' ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={sortCol === 'vertical' ? 'sorted' : ''}
                    onClick={() => handleSort('vertical')}
                  >
                    Tipo <SortIcon col="vertical" />
                  </th>
                  <th>Formatos</th>
                  <th>Exportar</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((p) => {
                  const v = VERTICAL_MAP[p.config.business.vertical];
                  const clientName = tenantMap[p.config.business.clienteId ?? ''] ?? '—';
                  const fmts = getFormats(p.id);
                  const isPicking = pickingFor === p.id;
                  const isThisExporting = exportingProjectId === p.id;
                  const canExport = fmts.size > 0 && !isRunning && !pickingFor;

                  return (
                    <tr key={p.id}>
                      {/* Columna Proyecto: solo el código crm-XX */}
                      <td>
                        <p className="font-mono text-sm font-medium text-[var(--panel-text)]">
                          {codeMap[p.id] ?? p.id.slice(0, 8)}
                        </p>
                      </td>

                      <td className="text-sm text-[var(--panel-muted)]">
                        {clientName}
                      </td>

                      <td className="text-sm text-[var(--panel-muted)]">
                        {v?.label ?? p.config.business.vertical}
                      </td>

                      <td>
                        <div className="flex flex-wrap gap-2">
                          {ALL_FORMATS.map((fmt) => {
                            const disabled = false; // Ya no hay restriccion de SO porque se exporta codigo fuente
                            return (
                              <label
                                key={fmt}
                                title={disabled ? 'Requiere macOS' : undefined}
                                className="flex items-center gap-1.5 text-xs select-none"
                                style={{
                                  color: fmts.has(fmt) ? 'var(--gold)' : 'var(--panel-muted)',
                                  opacity: disabled ? 0.35 : 1,
                                  cursor: disabled ? 'not-allowed' : 'pointer',
                                }}
                              >
                                <input
                                  type="checkbox"
                                  disabled={disabled}
                                  checked={fmts.has(fmt)}
                                  onChange={() => toggleFormat(p.id, fmt)}
                                  className="rounded accent-[#c5a028]"
                                />
                                {FORMAT_LABEL[fmt]}
                              </label>
                            );
                          })}
                        </div>
                      </td>

                      <td>
                        <button
                          type="button"
                          disabled={(!canExport && !isPicking) || isThisExporting}
                          onClick={() => void handleExportRow(p.id, fmts)}
                          className={
                            isThisExporting
                              ? 'rounded-lg border border-[var(--gold)] bg-[#c5a0281a] px-3 py-1.5 text-xs font-medium text-[var(--gold)] cursor-default transition'
                              : isPicking
                              ? 'rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--panel-muted)] cursor-wait transition'
                              : canExport
                              ? 'rounded-lg border border-[var(--panel-muted)] px-3 py-1.5 text-xs font-medium text-[var(--panel-muted)] transition hover:border-[var(--gold)] hover:text-[var(--gold)]'
                              : 'rounded-lg border border-transparent px-3 py-1.5 text-xs font-medium text-[var(--panel-muted)] opacity-25 cursor-not-allowed'
                          }
                        >
                          {isThisExporting ? (
                            <span className="flex items-center">
                              Exportando<AnimatingDots />
                            </span>
                          ) : isPicking ? (
                            'Eligiendo…'
                          ) : (
                            'Exportar'
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
