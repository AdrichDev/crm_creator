'use client';

import { useState, useMemo } from 'react';
import type { Project } from '@/lib/tenant-config-context';
import { MODULES } from '@/lib/config/modules';
import { VERTICAL_MAP } from '@/lib/config/verticals';
import { useDialog } from '@/components/ui/dialog-provider';
import { useExportJobContext } from '@/lib/export/export-job-context';
import type { BuildFormat } from '@/lib/export/types';
import { ExportTable } from './export-table';
import { ExportHeaderProgress } from './export-header-progress';
import { Plus, Pencil, Trash2, FolderOpen } from 'lucide-react';

type Tab = 'dashboard' | 'exportar';

const PAGE_SIZE = 10;

interface DashboardTabsProps {
  projects: Project[];
  busy: string | null;
  onOpen: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
}

export function DashboardTabs({
  projects,
  busy,
  onOpen,
  onEdit,
  onDelete,
  onNew,
}: DashboardTabsProps) {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(0);
  const dialog = useDialog();

  const { isRunning: isExporting, start: startExport } = useExportJobContext();

  // crm-01, crm-02, … estable por fecha de creación
  const codeMap = useMemo(() => {
    const sorted = [...projects].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    return Object.fromEntries(
      sorted.map((p, i) => [p.id, `crm-${String(i + 1).padStart(2, '0')}`]),
    );
  }, [projects]);

  const filtered = projects.filter((p) =>
    p.config.business.name.toLowerCase().includes(filter.toLowerCase()),
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function handleFilterChange(val: string) {
    setFilter(val);
    setPage(0);
  }

  function handleExport(projectId: string, formats: BuildFormat[], outputDir: string) {
    void startExport({ projectId, formats, outputDir });
  }

  function handleDelete(id: string) {
    void dialog
      .confirm({ message: '¿Eliminar proyecto?', danger: true })
      .then((ok) => { if (ok) onDelete(id); });
  }

  const sheetBg = 'var(--sheet-bg)';
  const tabRadius = '8px 8px 0 0';

  return (
    <div>
      {/* Tab labels — no background, just labels + active indicator.
          La barra de progreso del exportador se ancla a la derecha y es
          visible en cualquier pestaña mientras haya un job. */}
      <div className="flex items-end" style={{ gap: '2px' }}>
        {(['dashboard', 'exportar'] as Tab[]).map((t, i) => {
          const active = tab === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              style={active ? {
                background: sheetBg,
                border: '1px solid var(--line)',
                borderBottom: `1px solid ${sheetBg}`,
                borderRadius: tabRadius,
                padding: '9px 22px',
                marginBottom: '-1px',
                position: 'relative',
                zIndex: 1,
              } : {
                background: 'transparent',
                border: '1px solid transparent',
                borderRadius: tabRadius,
                padding: '9px 22px',
                cursor: 'pointer',
              }}
              className={[
                'text-sm select-none transition',
                active
                  ? 'font-semibold text-[var(--panel-text)]'
                  : 'font-medium text-[var(--panel-muted)] hover:text-[var(--panel-text)]',
              ].join(' ')}
            >
              {t === 'dashboard' ? 'Proyecto' : 'Exportar'}
            </button>
          );
        })}

        {/* Barra de progreso global del exportador (visible en toda pestaña) */}
        <div className="flex flex-1 justify-end pb-1 pl-4">
          <ExportHeaderProgress />
        </div>
      </div>

      {/* Sheet — the single container that holds all content */}
      <div style={{
        background: sheetBg,
        border: '1px solid var(--line)',
        borderRadius: tab === 'dashboard' ? '0 8px 8px 8px' : '0 0 8px 8px',
        padding: '24px',
      }}>

        {/* ─── Dashboard tab ─── */}
        {tab === 'dashboard' && (
          <div>
            {/* Filter + New project */}
            <div className="flex items-center gap-3 mb-5">
              <input
                type="text"
                placeholder="Filtrar proyectos…"
                value={filter}
                onChange={(e) => handleFilterChange(e.target.value)}
                className="flex-1 rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm text-[var(--panel-text)] placeholder:text-[var(--panel-muted)] outline-none focus:border-[var(--acc)]"
              />
              <button
                type="button"
                onClick={onNew}
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] bg-transparent px-4 py-2 text-sm font-medium text-[var(--panel-muted)] transition hover:border-[var(--gold)] hover:text-[var(--gold)]"
              >
                <Plus className="h-4 w-4" /> Nuevo proyecto
              </button>
            </div>

            {/* Empty state */}
            {filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--line)] py-20 text-center">
                <p className="font-display text-lg text-[var(--panel-text)]">Aún no hay proyectos</p>
                <p className="mt-1 text-sm text-[var(--panel-muted)]">
                  Crea el primero para un cliente y genera su paquete.
                </p>
                <button
                  type="button"
                  onClick={onNew}
                  className="mt-5 inline-flex items-center gap-2 rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-medium text-[var(--panel-muted)] transition hover:border-[var(--gold)] hover:text-[var(--gold)]"
                >
                  <Plus className="h-4 w-4" /> Nuevo proyecto
                </button>
              </div>
            ) : (
              <>
                {/* Project cards grid — use panel-card bg for contrast against sheet's panel-bg */}
                <div className="grid gap-4 sm:grid-cols-2">
                  {paginated.map((p) => {
                    const v = VERTICAL_MAP[p.config.business.vertical];
                    const active = MODULES.filter((m) => p.config.modules[m.id] && !m.mandatory);
                    const isBusy = busy === p.id;

                    return (
                      <div
                        key={p.id}
                        className="crm-console-card group rounded-2xl p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className="grid h-12 w-12 place-items-center overflow-hidden rounded-xl text-sm font-bold text-white shadow"
                            style={{
                              background: `linear-gradient(135deg, ${p.config.branding.secondary}, ${p.config.branding.primary})`,
                            }}
                          >
                            {p.config.branding.logoImage ? (
                              <img
                                src={p.config.branding.logoImage}
                                alt="logo"
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              p.config.branding.logoText
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-display text-lg font-semibold text-[var(--panel-text)]">
                              {p.config.business.name}
                            </p>
                            <p className="text-xs text-[var(--panel-muted)]">
                              {v?.emoji} {v?.label}
                            </p>
                          </div>
                          {p.generatedAt && (
                            <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700">
                              Generado
                            </span>
                          )}
                        </div>

                        <p className="mt-3 text-xs text-[var(--panel-muted)]">
                          {active.length} módulos:{' '}
                          {active
                            .slice(0, 4)
                            .map((m) => p.config.terminology[m.termKey] ?? m.defaultLabel)
                            .join(', ')}
                          {active.length > 4 ? '…' : ''}
                        </p>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => onOpen(p.id)}
                            disabled={isBusy}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--panel-muted)] transition hover:border-[var(--gold)] hover:text-[var(--gold)] disabled:opacity-40"
                          >
                            <FolderOpen className="h-3.5 w-3.5" /> Abrir
                          </button>
                          <button
                            type="button"
                            onClick={() => onEdit(p.id)}
                            disabled={isBusy}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--panel-muted)] transition hover:border-emerald-500 hover:text-emerald-500 disabled:opacity-40"
                          >
                            <Pencil className="h-3.5 w-3.5" /> Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(p.id)}
                            className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="mt-6 flex items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={page === 0}
                      className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--panel-muted)] transition hover:border-[var(--acc)] hover:text-[var(--acc)] disabled:opacity-40"
                    >
                      Anterior
                    </button>
                    <span className="text-sm text-[var(--panel-muted)]">
                      {page + 1} / {totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1}
                      className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--panel-muted)] transition hover:border-[var(--acc)] hover:text-[var(--acc)] disabled:opacity-40"
                    >
                      Siguiente
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ─── Exportar tab ─── */}
        {tab === 'exportar' && (
          <div>
            <ExportTable
              projects={projects}
              codeMap={codeMap}
              isRunning={isExporting}
              onExport={handleExport}
            />
          </div>
        )}
      </div>
    </div>
  );
}
