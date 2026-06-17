'use client';
import { useState } from 'react';
import { Table, Td, Button } from '@/components/ui/primitives';
import { StarRating } from '@/components/stats/star-rating';
import { ProspectStatusBadge, WebStatusBadge } from '@/components/stats/prospect-badges';
import {
  PROSPECT_STATUS_LABELS,
  type Prospect, type ProspectStatus,
} from '@/lib/stats/study-types';

// Tabla de prospección. Lista prospectos del estudio, ordenados por
// oportunidad. Permite valorar la oportunidad por estrellas y cambiar el
// estado. Persistencia delegada al padre vía onChange (store mock).

type WebFilter = 'all' | NonNullable<Prospect['websiteStatus']>;

const FILTERS: { label: string; value: WebFilter }[] = [
  { label: 'Todos', value: 'all' },
  { label: 'Sin web', value: 'no_web' },
  { label: 'Web sin chatbot', value: 'web_no_chatbot' },
  { label: 'Web con chatbot', value: 'web_chatbot' },
];

export function ProspectsTable({
  prospects,
  onChange,
}: {
  prospects: Prospect[];
  onChange: (next: Prospect[]) => void;
}) {
  const [webFilter, setWebFilter] = useState<WebFilter>('all');

  function patch(id: string, p: Partial<Prospect>) {
    onChange(prospects.map((it) => (it.id === id ? { ...it, ...p } : it)));
  }

  const sorted = [...prospects].sort(
    (a, b) => (b.opportunityScore ?? 0) - (a.opportunityScore ?? 0),
  );
  const filtered = webFilter === 'all' ? sorted : sorted.filter((p) => p.websiteStatus === webFilter);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-[var(--panel-text)]">
          Prospectos ({prospects.length})
        </h3>
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

      {prospects.length === 0 ? (
        <p className="text-sm text-[var(--panel-muted)]">
          Sin prospectos todavía. Añade negocios de la zona para empezar la prospección.
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-[var(--panel-muted)]">Sin prospectos con ese filtro.</p>
      ) : (
        <Table head={['Negocio', 'Sector', 'Dirección', 'Rating', 'Web', 'Oportunidad', 'Estado']}>
          {filtered.map((p) => (
            <tr key={p.id}>
              <Td className="font-medium text-[var(--panel-text)]">
                {p.websiteUrl ? (
                  <a href={p.websiteUrl} target="_blank" rel="noopener noreferrer"
                    className="underline" style={{ color: 'var(--acc)' }} title={`Abrir ${p.websiteUrl}`}>
                    {p.name}
                  </a>
                ) : p.name}
              </Td>
              <Td>{p.sector ?? '—'}</Td>
              <Td className="max-w-[160px] truncate">{p.address ?? '—'}</Td>
              <Td>{p.rating != null ? `${p.rating} ★` : '—'}</Td>
              <Td><WebStatusBadge status={p.websiteStatus} /></Td>
              <Td>
                <StarRating
                  value={p.opportunityScore ?? null}
                  editable
                  onChange={(v) => patch(p.id, { opportunityScore: v })}
                  size="sm"
                />
              </Td>
              <Td>
                <select
                  value={p.status}
                  onChange={(e) => patch(p.id, { status: e.target.value as ProspectStatus })}
                  className="cursor-pointer border-0 bg-transparent text-xs font-medium focus:outline-none"
                  style={{ color: 'var(--panel-text)' }}
                >
                  {(Object.entries(PROSPECT_STATUS_LABELS) as [ProspectStatus, string][]).map(([val, label]) => (
                    <option key={val} value={val} style={{ background: 'var(--panel-card)', color: 'var(--panel-text)' }}>
                      {label}
                    </option>
                  ))}
                </select>
              </Td>
            </tr>
          ))}
        </Table>
      )}

      {prospects.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--panel-muted)]">
          {(Object.keys(PROSPECT_STATUS_LABELS) as ProspectStatus[]).map((s) => (
            <span key={s} className="inline-flex items-center gap-1">
              <ProspectStatusBadge status={s} />
              {prospects.filter((p) => p.status === s).length}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
