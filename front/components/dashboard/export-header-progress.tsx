'use client';
// Barra fina de progreso del exportador en la fila de tabs del dashboard.
// Visible en TODAS las pestañas mientras haya job. Estados:
//  - running → barra con % + formato actual + paso.
//  - done    → verde clicable (despliega rutas de salida por formato).
//  - error   → rojo clicable (despliega detalle del error).
// Boton descartar (x) para limpiar un job terminado.

import { useState } from 'react';
import { X } from 'lucide-react';
import { useExportJobContext } from '@/lib/export/export-job-context';
import type { BuildFormat } from '@/lib/export/types';

const FORMAT_LABEL: Record<BuildFormat, string> = {
  'web-zip': 'Web ZIP',
  exe: 'Escritorio (ZIP)',
  apk: 'Android (ZIP)',
  ipa: 'iOS (ZIP)',
};

export function ExportHeaderProgress() {
  const { job, error: globalError, dismiss, cancel } = useExportJobContext();
  const [open, setOpen] = useState(false);

  if (!job && !globalError) return null;

  const isRunning = job?.status === 'running';
  const isDone = job?.status === 'done';
  const isError = job?.status === 'error' || !!globalError;
  const clickable = isDone || isError;

  const barColor = isDone
    ? '#22c55e' // green-500
    : isError
      ? '#ef4444' // red-500
      : 'var(--acc)';

  const label = isRunning
    ? `${job?.currentFormat ? FORMAT_LABEL[job.currentFormat] : 'Exportando'}${job?.step ? ` · ${job.step}` : ''}`
    : isDone
      ? 'Exportación completada'
      : 'Exportación fallida';

  return (
    <div className="relative w-full max-w-xs" data-testid="export-header-progress">
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!clickable}
          onClick={() => clickable && setOpen((v) => !v)}
          className={
            'min-w-0 flex-1 text-left ' + (clickable ? 'cursor-pointer' : 'cursor-default')
          }
          aria-label={label}
        >
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="truncate" style={{ color: 'var(--panel-muted)' }}>
              {label}
            </span>
            <span className="tabular-nums font-medium" style={{ color: barColor }}>
              {job?.pct ?? 0}%
            </span>
          </div>
          <div
            className="mt-1 h-1 rounded-full overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.12)' }}
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${job?.pct ?? 100}%`, background: barColor }}
            />
          </div>
        </button>

        {clickable && (
          <button
            type="button"
            onClick={dismiss}
            aria-label="Descartar"
            className="flex-shrink-0 rounded p-0.5 text-[var(--panel-muted)] transition hover:text-[var(--panel-text)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        {isRunning && (
          <button
            type="button"
            onClick={() => void cancel()}
            aria-label="Cancelar exportación"
            className="flex-shrink-0 rounded p-0.5 text-[var(--panel-muted)] transition hover:text-[var(--panel-text)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Detalle desplegable (rutas de salida o error) */}
      {open && clickable && (
        <div
          className="absolute right-0 z-50 mt-2 w-72 rounded-xl border border-[var(--line)] p-3 text-xs shadow-xl"
          style={{ background: 'var(--panel-bg)', color: 'var(--panel-text)' }}
        >
          {isError && (job?.error || globalError) && (
            <p className="mb-2 break-words" style={{ color: '#f87171' }}>
              {job?.error || globalError}
            </p>
          )}
          <div className="space-y-1.5">
            {job?.formats.map((fmt) => {
              const pf = job.perFormat[fmt];
              return (
                <div key={fmt} className="flex flex-col">
                  <span className="font-medium">{FORMAT_LABEL[fmt]}</span>
                  {pf?.outputPath && (
                    <span className="break-all text-green-400">{pf.outputPath}</span>
                  )}
                  {pf?.error && <span className="break-words text-red-400">{pf.error}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
