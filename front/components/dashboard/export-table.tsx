'use client';

import { useState, useEffect, useRef } from 'react';
import type { Project } from '@/lib/tenant-config-context';
import { VERTICAL_MAP } from '@/lib/config/verticals';
import { apiFetch, isApiEnabled } from '@/lib/api/client';
import { fetchExportVersions } from '@/lib/api/exports-history';
import type { ClientLite } from '@/lib/clients/picker';
import type { BuildFormat } from '@/lib/export/types';
import { openSaveDialog, isAbortError, toSlug, type SaveFileHandle } from '@/lib/export/download';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

const FORMAT_LABEL: Record<BuildFormat, string> = {
  'web-zip': 'Web (código fuente)',
  exe: 'Windows (.exe)',
  apk: 'Android (APK)',
  ipa: 'iOS (.ipa)',
};

const ALL_FORMATS: BuildFormat[] = ['web-zip', 'exe', 'apk', 'ipa'];

// Sufijo del ZIP que produce cada builder en el back (espejo de export-builders/*).
// Se usa para el nombre sugerido en el diálogo "Guardar como".
const FORMAT_SUFFIX: Record<BuildFormat, string> = {
  'web-zip': 'web-src',
  exe: 'desktop-src',
  apk: 'android-src',
  ipa: 'ios-src',
};

type SortCol = 'name' | 'client' | 'vertical';

interface ExportTableProps {
  projects: Project[];
  codeMap: Record<string, string>;
  isRunning: boolean;
  exportingProjectId?: string;
  onExport: (
    projectId: string,
    formats: BuildFormat[],
    handle: SaveFileHandle | null,
    version?: string,
    changeNote?: string,
  ) => void;
}

// crm-generator-versiones-historico (WU4): a partir del 2º export del proyecto,
// version/changeNote son obligatorios (el back rechaza con 400 si faltan). Mismo
// regex que el back (`/^\d+\.\d+\.\d+$/`) para validar antes de arrancar el job.
const SEMVER_RE = /^\d+\.\d+\.\d+$/;

interface PendingExport {
  projectId: string;
  businessName: string;
  fmt: BuildFormat;
  handle: SaveFileHandle | null;
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
  const [selected, setSelected] = useState<Record<string, BuildFormat>>({});
  const [tenantMap, setTenantMap] = useState<Record<string, string>>({});
  const [sortCol, setSortCol] = useState<SortCol | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  // crm-generator-versiones-historico (WU4): negocios con ≥1 export previo — a
  // partir del 2º, version/changeNote son obligatorios (el back rechaza sin ellos).
  const [businessesWithVersion, setBusinessesWithVersion] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<PendingExport | null>(null);
  const [versionInput, setVersionInput] = useState('');
  const [changeNoteInput, setChangeNoteInput] = useState('');
  const [versionError, setVersionError] = useState<string | null>(null);

  useEffect(() => {
    if (!isApiEnabled()) return;
    apiFetch<ClientLite[]>('/tenants')
      .then((data) => {
        if (!Array.isArray(data)) return;
        setTenantMap(Object.fromEntries(data.map((c) => [c.id, c.nombre])));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchExportVersions()
      .then((data) => setBusinessesWithVersion(new Set(data.versions.map((v) => v.businessId))))
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

  // Se exporta UN formato por vez (/download devuelve un único ZIP). Default: web-zip.
  function getFormat(id: string): BuildFormat {
    return selected[id] ?? 'web-zip';
  }

  function setFormatFor(id: string, fmt: BuildFormat) {
    setSelected((prev) => ({ ...prev, [id]: fmt }));
  }

  function handleSort(col: SortCol) {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortCol(col); setSortDir('asc'); }
  }

  async function handleExportRow(projectId: string, businessName: string, fmt: BuildFormat) {
    if (isRunning) return;
    // Flujo de un botón: abrimos el diálogo nativo "Guardar como" AQUÍ (en el gesto
    // del clic) y guardamos el handle. Al terminar el job se escribe el ZIP en él
    // sin nuevo gesto. Si el navegador no soporta la API, handle=null → descarga por
    // anchor al terminar. Si el usuario cancela el diálogo, NO se arranca el job.
    // Se exporta un único formato; el nombre sugerido refleja ese formato.
    const suffix = FORMAT_SUFFIX[fmt] ?? 'src';
    let handle: SaveFileHandle | null = null;
    try {
      handle = await openSaveDialog(`${toSlug(businessName)}-${suffix}.zip`);
    } catch (err) {
      if (isAbortError(err)) return; // Cancelado → abortar sin exportar.
      handle = null; // Otro fallo del diálogo: seguimos con descarga por anchor.
    }
    // crm-generator-versiones-historico (WU4): primer export del proyecto no
    // pregunta (el back resuelve "1.0.0" solo); a partir del 2º, el diálogo de
    // versión es obligatorio antes de arrancar el job.
    if (businessesWithVersion.has(projectId)) {
      setVersionInput('');
      setChangeNoteInput('');
      setVersionError(null);
      setPending({ projectId, businessName, fmt, handle });
      return;
    }
    onExport(projectId, [fmt], handle);
  }

  function confirmVersionPrompt() {
    if (!pending) return;
    if (!SEMVER_RE.test(versionInput.trim())) {
      setVersionError('Formato esperado: x.y.z (p. ej. 1.1.0)');
      return;
    }
    onExport(
      pending.projectId,
      [pending.fmt],
      pending.handle,
      versionInput.trim(),
      changeNoteInput.trim() || undefined,
    );
    setPending(null);
  }

  function cancelVersionPrompt() {
    setPending(null);
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
                  <th>Formato</th>
                  <th>Exportar</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((p) => {
                  const v = VERTICAL_MAP[p.config.business.vertical];
                  const clientName = tenantMap[p.config.business.clienteId ?? ''] ?? '—';
                  const selectedFmt = getFormat(p.id);
                  const isThisExporting = exportingProjectId === p.id;
                  const canExport = !isRunning;

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
                          {ALL_FORMATS.map((fmt) => (
                            <label
                              key={fmt}
                              className="flex items-center gap-1.5 text-xs select-none"
                              style={{
                                color: selectedFmt === fmt ? 'var(--gold)' : 'var(--panel-muted)',
                                cursor: 'pointer',
                              }}
                            >
                              <input
                                type="radio"
                                name={`fmt-${p.id}`}
                                checked={selectedFmt === fmt}
                                onChange={() => setFormatFor(p.id, fmt)}
                                className="accent-[#c5a028]"
                              />
                              {FORMAT_LABEL[fmt]}
                            </label>
                          ))}
                        </div>
                      </td>

                      <td>
                        <button
                          type="button"
                          disabled={!canExport || isThisExporting}
                          onClick={() => void handleExportRow(p.id, p.config.business.name, selectedFmt)}
                          className={
                            isThisExporting
                              ? 'rounded-lg border border-[var(--gold)] bg-[#c5a0281a] px-3 py-1.5 text-xs font-medium text-[var(--gold)] cursor-default transition'
                              : canExport
                              ? 'rounded-lg border border-[var(--panel-muted)] px-3 py-1.5 text-xs font-medium text-[var(--panel-muted)] transition hover:border-[var(--gold)] hover:text-[var(--gold)]'
                              : 'rounded-lg border border-transparent px-3 py-1.5 text-xs font-medium text-[var(--panel-muted)] opacity-25 cursor-not-allowed'
                          }
                        >
                          {isThisExporting ? (
                            <span className="flex items-center">
                              Exportando<AnimatingDots />
                            </span>
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

      {/* crm-generator-versiones-historico (WU4): diálogo de version/changeNote —
          solo aparece a partir del 2º export del proyecto. */}
      {pending && (
        <div className="opera-modal-backdrop">
          <div className="opera-modal w-full max-w-sm">
            <div className="opera-modal-header">
              <h3 className="opera-modal-title">Nueva versión — {pending.businessName}</h3>
            </div>
            <div className="opera-modal-body">
              <label className="block text-xs font-medium text-[var(--panel-muted)] mb-1" htmlFor="export-version-input">
                Versión (x.y.z)
              </label>
              <input
                id="export-version-input"
                type="text"
                placeholder="1.1.0"
                value={versionInput}
                onChange={(e) => { setVersionInput(e.target.value); setVersionError(null); }}
                className="w-full rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-sm text-[var(--panel-text)] outline-none focus:border-[var(--acc)]"
              />
              {versionError && <p className="mt-1 text-xs text-red-500">{versionError}</p>}

              <label className="block text-xs font-medium text-[var(--panel-muted)] mt-3 mb-1" htmlFor="export-changenote-input">
                Notas del cambio (opcional)
              </label>
              <textarea
                id="export-changenote-input"
                value={changeNoteInput}
                onChange={(e) => setChangeNoteInput(e.target.value)}
                rows={3}
                maxLength={500}
                className="w-full rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-sm text-[var(--panel-text)] outline-none focus:border-[var(--acc)]"
              />
            </div>
            <div className="opera-modal-foot">
              <button
                type="button"
                onClick={cancelVersionPrompt}
                className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm text-[var(--panel-muted)]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmVersionPrompt}
                className="rounded-lg border border-[var(--gold)] px-4 py-2 text-sm font-medium text-[var(--gold)]"
              >
                Exportar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
