'use client';

import { useState } from 'react';
import type { Project } from '@/lib/tenant-config-context';
import { VERTICAL_MAP } from '@/lib/config/verticals';
import { Table, Td } from '@/components/ui/primitives';
import type { BuildFormat } from '@/lib/export/use-export-stream';

const FORMAT_LABEL: Record<BuildFormat, string> = {
  'web-zip': 'Web ZIP',
  exe: '.exe',
  apk: '.apk',
  ipa: '.ipa',
};

const ALL_FORMATS: BuildFormat[] = ['web-zip', 'exe', 'apk', 'ipa'];

interface ExportTableProps {
  projects: Project[];
  isRunning: boolean;
  onExport: (projectId: string, formats: BuildFormat[], outputDir: string) => void;
}

export function ExportTable({ projects, isRunning, onExport }: ExportTableProps) {
  const [filter, setFilter] = useState('');
  const [outputDir, setOutputDir] = useState('./exports');
  // Per-row format selection: projectId → selected formats
  const [selected, setSelected] = useState<Record<string, Set<BuildFormat>>>({});

  // Detect Windows to disable .ipa (requires macOS toolchain)
  const isWindows =
    typeof navigator !== 'undefined' && /Win/i.test(navigator.platform);

  function getFormats(id: string): Set<BuildFormat> {
    return selected[id] ?? new Set<BuildFormat>();
  }

  function toggleFormat(id: string, fmt: BuildFormat) {
    setSelected((prev) => {
      const cur = new Set(prev[id] ?? []);
      if (cur.has(fmt)) cur.delete(fmt);
      else cur.add(fmt);
      return { ...prev, [id]: cur };
    });
  }

  const filtered = projects.filter((p) => {
    const q = filter.toLowerCase();
    return (
      p.config.business.name.toLowerCase().includes(q) ||
      (p.config.business.vertical ?? '').toLowerCase().includes(q) ||
      (p.config.business.clienteId ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      {/* Toolbar: filter + output dir */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Filtrar proyectos…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="flex-1 rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm text-[var(--panel-text)] placeholder:text-[var(--panel-muted)] outline-none focus:border-[var(--acc)]"
        />
        <div className="flex items-center gap-2">
          <label className="text-xs whitespace-nowrap" style={{ color: 'var(--panel-muted)' }}>
            Carpeta destino:
          </label>
          <input
            type="text"
            placeholder="./exports"
            value={outputDir}
            onChange={(e) => setOutputDir(e.target.value)}
            className="w-44 rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm text-[var(--panel-text)] placeholder:text-[var(--panel-muted)] outline-none focus:border-[var(--acc)]"
          />
        </div>
      </div>

      {/* Table or empty state */}
      {filtered.length === 0 ? (
        <div
          className="py-12 text-center text-sm"
          style={{ color: 'var(--panel-muted)' }}
        >
          No hay proyectos que coincidan con el filtro.
        </div>
      ) : (
        <Table head={['Proyecto', 'Cliente', 'Tipo de negocio', 'Formatos', 'Exportar']}>
          {filtered.map((p) => {
            const v = VERTICAL_MAP[p.config.business.vertical];
            const fmts = getFormats(p.id);
            const canExport = fmts.size > 0 && !isRunning;

            return (
              <tr key={p.id}>
                <Td>
                  <span
                    className="font-medium text-sm"
                    style={{ color: 'var(--panel-text)' }}
                  >
                    {p.config.business.name}
                  </span>
                </Td>

                <Td>
                  <span className="text-sm" style={{ color: 'var(--panel-muted)' }}>
                    {p.config.business.clienteId ?? '—'}
                  </span>
                </Td>

                <Td>
                  <span className="text-sm" style={{ color: 'var(--panel-text)' }}>
                    {v ? `${v.emoji} ${v.label}` : p.config.business.vertical}
                  </span>
                </Td>

                <Td>
                  <div className="flex flex-wrap gap-2">
                    {ALL_FORMATS.map((fmt) => {
                      const disabled = fmt === 'ipa' && isWindows;
                      return (
                        <label
                          key={fmt}
                          title={disabled ? 'Requiere macOS' : undefined}
                          className="flex items-center gap-1 text-xs cursor-pointer select-none"
                          style={{
                            color: 'var(--panel-text)',
                            opacity: disabled ? 0.4 : 1,
                            cursor: disabled ? 'not-allowed' : 'pointer',
                          }}
                        >
                          <input
                            type="checkbox"
                            disabled={disabled}
                            checked={fmts.has(fmt)}
                            onChange={() => toggleFormat(p.id, fmt)}
                            className="rounded accent-[var(--acc)]"
                          />
                          {FORMAT_LABEL[fmt]}
                        </label>
                      );
                    })}
                  </div>
                </Td>

                <Td>
                  <button
                    type="button"
                    disabled={!canExport}
                    onClick={() => {
                      if (canExport) onExport(p.id, Array.from(fmts), outputDir);
                    }}
                    className="rounded-xl px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed"
                    style={
                      canExport
                        ? { background: 'var(--acc)', color: '#0a0a0a' }
                        : { background: 'rgba(255,255,255,0.1)', color: 'var(--panel-muted)' }
                    }
                  >
                    Exportar
                  </button>
                </Td>
              </tr>
            );
          })}
        </Table>
      )}
    </div>
  );
}
