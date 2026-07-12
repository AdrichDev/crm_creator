'use client';
// crm-generator-versiones-historico (WU6): pestaña "Generados" — historial de
// versiones (todas las exportaciones, no solo la última). Descargar trae el
// artefacto EXACTO de esa versión (GET /versions/:id/download → URL firmada),
// sin regenerar/rebuild (spec dashboard-generados, "Download old version
// returns original source").
import { useEffect, useState } from 'react';
import { fetchExportVersions, downloadExportVersion, type ExportVersionView } from '@/lib/api/exports-history';

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' });
}

// `lifecycle` nace 'ACTIVE' incluso sin desplegar nunca — usar `hasStateEvents`
// (no `lifecycle`) para distinguir "sin desplegar" de "ACTIVE real".
function statusLabel(v: ExportVersionView): string {
  if (!v.hasStateEvents) return 'sin desplegar';
  return v.lifecycle;
}

export function GeneradosTab() {
  const [versions, setVersions] = useState<ExportVersionView[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchExportVersions()
      .then((data) => setVersions(data.versions))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="text-sm text-[var(--panel-muted)]">Cargando…</p>;
  }

  if (versions.length === 0) {
    return <p className="text-sm text-[var(--panel-muted)]">Todavía no hay exportaciones generadas.</p>;
  }

  return (
    <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-[var(--panel-muted)]">
          <th className="py-2">Cliente</th>
          <th className="py-2">Fecha</th>
          <th className="py-2">Versión</th>
          <th className="py-2">Estado</th>
          <th className="py-2" />
        </tr>
      </thead>
      <tbody>
        {versions.map((v) => (
          <tr key={v.id} className="border-t border-[var(--line)]">
            <td className="py-2">{v.businessName}</td>
            <td className="py-2">{formatDateTime(v.createdAt)}</td>
            <td className="py-2">{v.version}</td>
            <td className="py-2">{statusLabel(v)}</td>
            <td className="py-2">
              <button
                type="button"
                onClick={() => void downloadExportVersion(v.id)}
                className="rounded-lg border border-[var(--line)] px-3 py-1 text-xs text-[var(--panel-text)]"
              >
                Descargar
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}
