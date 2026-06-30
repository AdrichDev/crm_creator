'use client';
import { useState } from 'react';
import { useDialog } from '@/components/ui/dialog-provider';
import { Table, Td } from '@/components/ui/primitives';
import { StarRating } from '@/components/stats/star-rating';
import { StudyWebStatusBadge } from '@/components/stats/study-web-status-badge';
import {
  discoverProspects, purgeOutOfRadius, patchProspectStatus, downloadProspectsCsv,
  type Prospect, type ProspectStatus, type WebsiteStatus,
} from '@/lib/api/market-studies';

// Tabla de prospección REMOTA (modelo AA). Descubre prospectos (Google Places en
// AA), limpia fuera de radio, exporta CSV y cambia estado. Tematizada al CRM.
// Nota: sin paginación (el CRM no tiene helper); muestra la lista filtrada.

type WebFilter = 'all' | WebsiteStatus;

const STATUS_LABELS: Record<ProspectStatus, string> = {
  new: 'Nuevo',
  contacted: 'Contactado',
  discarded: 'Descartado',
};

const FILTERS: { label: string; value: WebFilter }[] = [
  { label: 'Todos', value: 'all' },
  { label: 'Sin web', value: 'no_web' },
  { label: 'Web sin chatbot', value: 'web_no_chatbot' },
  { label: 'Web con chatbot', value: 'web_chatbot' },
];

export function StudyProspectsTable({
  studyId,
  prospects: initial,
  onUpdate,
}: {
  studyId: string;
  prospects: Prospect[];
  onUpdate: (p: Prospect[]) => void;
}) {
  const dialog = useDialog();
  const [prospects, setProspects] = useState<Prospect[]>(initial);
  const [searching, setSearching] = useState(false);
  const [purging, setPurging] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [webFilter, setWebFilter] = useState<WebFilter>('all');

  const outOfRadiusCount = prospects.filter((p) => p.outOfRadius).length;

  async function purge() {
    const ok = await dialog.confirm({ message: `Se eliminarán ${outOfRadiusCount} prospecto(s) fuera del radio actual (los contactados se conservan). ¿Continuar?`, danger: true });
    if (!ok) return;
    setPurging(true);
    try {
      const result = await purgeOutOfRadius(studyId);
      setProspects(result.prospects);
      onUpdate(result.prospects);
    } catch {
      setWarning('Error al limpiar los prospectos fuera de radio');
    } finally {
      setPurging(false);
    }
  }

  async function discover() {
    setSearching(true);
    setWarning(null);
    try {
      const result = await discoverProspects(studyId);
      setProspects(result.prospects);
      onUpdate(result.prospects);
      if (result.warning) setWarning(result.warning);
    } catch {
      setWarning('Error en la búsqueda de prospectos');
    } finally {
      setSearching(false);
    }
  }

  async function updateStatus(placeId: string, status: ProspectStatus) {
    try {
      await patchProspectStatus(studyId, placeId, status);
      const updated = prospects.map((p) => (p.placeId === placeId ? { ...p, status } : p));
      setProspects(updated);
      onUpdate(updated);
    } catch {
      await dialog.alert('Error al actualizar el estado');
    }
  }

  const sorted = [...prospects].sort((a, b) => (b.opportunityScore ?? 0) - (a.opportunityScore ?? 0));
  const filtered = webFilter === 'all' ? sorted : sorted.filter((p) => p.websiteStatus === webFilter);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-[var(--panel-text)]">Prospectos ({prospects.length})</h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={discover}
            disabled={searching}
            className="rounded-lg border border-[var(--line,rgba(255,255,255,0.1))] px-3 py-1.5 text-xs text-[var(--panel-muted)] transition-colors hover:text-[var(--panel-text)] disabled:opacity-50"
          >
            {searching ? 'Buscando…' : 'Descubrir prospectos'}
          </button>
          {prospects.length > 0 && (
            <button
              type="button"
              onClick={() => { void downloadProspectsCsv(studyId); }}
              className="rounded-lg border border-[var(--line,rgba(255,255,255,0.1))] px-3 py-1.5 text-xs transition-colors"
              style={{ color: 'var(--acc)' }}
            >
              Exportar CSV
            </button>
          )}
        </div>
      </div>

      {prospects.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setWebFilter(f.value)}
              className="rounded-full px-3 py-1 text-xs font-medium transition-colors"
              style={webFilter === f.value
                ? { background: 'color-mix(in srgb, var(--acc) 16%, transparent)', color: 'var(--acc)', border: '1px solid color-mix(in srgb, var(--acc) 30%, transparent)' }
                : { color: 'var(--panel-muted)', border: '1px solid var(--line, rgba(255,255,255,0.08))' }}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {warning && (
        <div className="rounded-[10px] border border-amber-500/20 bg-amber-500/5 p-3">
          <p className="text-xs text-amber-500">{warning}</p>
        </div>
      )}

      {outOfRadiusCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-orange-500/20 bg-orange-500/5 p-3">
          <p className="text-xs text-orange-400">
            {outOfRadiusCount} prospecto(s) quedan fuera del radio actual del estudio.
          </p>
          <button
            type="button"
            onClick={purge}
            disabled={purging}
            className="rounded-lg border border-orange-500/30 px-3 py-1.5 text-xs text-orange-400 hover:bg-orange-500/10 disabled:opacity-50"
          >
            {purging ? 'Limpiando…' : 'Limpiar fuera de radio'}
          </button>
        </div>
      )}

      {prospects.length === 0 && !searching && (
        <p className="text-sm text-[var(--panel-muted)]">
          Sin prospectos todavía. Pulsa &quot;Descubrir prospectos&quot; para buscar negocios en la zona.
        </p>
      )}

      {filtered.length > 0 ? (
        <Table head={['Negocio', 'Sector', 'Dirección', 'Distancia', 'Rating', 'Web', 'Oportunidad', 'Estado']}>
          {filtered.map((p) => (
            <tr key={p.placeId}>
              <Td className="font-medium text-[var(--panel-text)]">
                {p.websiteUrl ? (
                  <a href={p.websiteUrl} target="_blank" rel="noopener noreferrer"
                    className="underline" style={{ color: 'var(--acc)' }} title={`Abrir ${p.websiteUrl}`}>
                    {p.name}
                  </a>
                ) : p.name}
              </Td>
              <Td>{p.sector ?? '—'}</Td>
              <Td className="max-w-[140px] truncate">{p.address ?? '—'}</Td>
              <Td>
                {p.distanceKm != null ? (
                  <span className={p.outOfRadius ? 'text-orange-400' : 'text-[var(--panel-muted)]'}>
                    {p.distanceKm} km{p.outOfRadius ? ' ⚠' : ''}
                  </span>
                ) : '—'}
              </Td>
              <Td>{p.rating != null ? `${p.rating} ★` : '—'}</Td>
              <Td><StudyWebStatusBadge status={p.websiteStatus} /></Td>
              <Td><StarRating value={p.opportunityScore ?? null} size="sm" /></Td>
              <Td>
                <select
                  value={p.status}
                  onChange={(e) => updateStatus(p.placeId, e.target.value as ProspectStatus)}
                  className="cursor-pointer border-0 bg-transparent text-xs font-medium focus:outline-none"
                  style={{ color: 'var(--panel-text)' }}
                >
                  {(Object.entries(STATUS_LABELS) as [ProspectStatus, string][]).map(([val, label]) => (
                    <option key={val} value={val} style={{ background: 'var(--panel-card)', color: 'var(--panel-text)' }}>
                      {label}
                    </option>
                  ))}
                </select>
              </Td>
            </tr>
          ))}
        </Table>
      ) : prospects.length > 0 ? (
        <p className="text-xs text-[var(--panel-muted)]">Sin prospectos con ese filtro.</p>
      ) : null}
    </div>
  );
}
