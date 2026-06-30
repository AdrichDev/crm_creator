'use client';

import type { ProgressEvent, BuildFormat } from '@/lib/export/use-export-stream';

interface ExportProgressProps {
  events: ProgressEvent[];
  isRunning: boolean;
  formats: BuildFormat[];
  onClose: () => void;
}

const FORMAT_LABEL: Record<BuildFormat, string> = {
  'web-zip': 'Web ZIP',
  exe: 'Ejecutable (.exe)',
  apk: 'Android (.apk)',
  ipa: 'iOS (.ipa)',
};

type FormatStatus = 'pending' | 'running' | 'done' | 'error';

export function ExportProgress({ events, isRunning, formats, onClose }: ExportProgressProps) {
  const completeEvent = events.find(
    (e): e is Extract<ProgressEvent, { type: 'complete' }> => e.type === 'complete',
  );
  const fatalEvent = events.find(
    (e): e is Extract<ProgressEvent, { type: 'fatal' }> => e.type === 'fatal',
  );
  const latestProgress = [...events].reverse().find(
    (e): e is Extract<ProgressEvent, { type: 'progress' }> => e.type === 'progress',
  );

  const pct = latestProgress?.pct ?? 0;
  const step = latestProgress?.step ?? '';

  const canClose = !isRunning || !!completeEvent || !!fatalEvent;

  function getFormatStatus(fmt: BuildFormat): FormatStatus {
    if (events.some((e) => e.type === 'format-done' && e.format === fmt)) return 'done';
    if (events.some((e) => e.type === 'format-error' && e.format === fmt)) return 'error';
    if (events.some((e) => e.type === 'format-start' && e.format === fmt)) return 'running';
    return 'pending';
  }

  function getFormatError(fmt: BuildFormat): string {
    const ev = events.find(
      (e): e is Extract<ProgressEvent, { type: 'format-error' }> =>
        e.type === 'format-error' && e.format === fmt,
    );
    return ev?.message ?? '';
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className="rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6"
        style={{ background: 'var(--panel-bg)', color: 'var(--panel-text)' }}
      >
        <p className="text-base font-semibold mb-5" style={{ color: 'var(--panel-text)' }}>
          Exportando proyecto
        </p>

        {/* Per-format status list */}
        <div className="space-y-3 mb-5">
          {formats.map((fmt) => {
            const status = getFormatStatus(fmt);
            return (
              <div key={fmt} className="flex items-center gap-3">
                {/* Status indicator */}
                <span className="flex w-5 items-center justify-center text-sm flex-shrink-0">
                  {status === 'pending' && (
                    <span style={{ color: 'var(--panel-muted)' }}>&#8987;</span>
                  )}
                  {status === 'running' && (
                    <span
                      className="inline-block w-4 h-4 rounded-full animate-spin border-2 border-t-transparent"
                      style={{ borderColor: 'var(--acc)', borderTopColor: 'transparent' }}
                    />
                  )}
                  {status === 'done' && (
                    <span className="text-green-400 font-bold">&#10003;</span>
                  )}
                  {status === 'error' && (
                    <span className="text-red-400 font-bold">&#10007;</span>
                  )}
                </span>

                {/* Format label */}
                <span className="flex-1 text-sm" style={{ color: 'var(--panel-text)' }}>
                  {FORMAT_LABEL[fmt]}
                </span>

                {/* Contextual right text */}
                {status === 'error' && (
                  <span
                    className="text-xs truncate max-w-[200px]"
                    style={{ color: 'var(--acc-light, #f87171)' }}
                    title={getFormatError(fmt)}
                  >
                    {getFormatError(fmt)}
                  </span>
                )}
                {status === 'running' && step && (
                  <span className="text-xs" style={{ color: 'var(--panel-muted)' }}>
                    {step}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Global progress bar for the currently active format */}
        {isRunning && !completeEvent && (
          <div className="mb-5">
            <div
              className="flex justify-between text-xs mb-1.5"
              style={{ color: 'var(--panel-muted)' }}
            >
              <span>{step || 'Procesando…'}</span>
              <span>{pct}%</span>
            </div>
            <div
              className="h-2 rounded-full overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.1)' }}
            >
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${pct}%`, background: 'var(--acc)' }}
              />
            </div>
          </div>
        )}

        {/* Fatal error message */}
        {fatalEvent && (
          <div
            className="mb-4 rounded-lg px-3 py-2 text-sm"
            style={{ background: 'rgba(248,113,113,0.1)', color: '#f87171' }}
          >
            {fatalEvent.message}
          </div>
        )}

        {/* Output paths after completion */}
        {completeEvent && (
          <div
            className="mb-5 rounded-lg px-3 py-2 text-xs space-y-1"
            style={{ background: 'rgba(255,255,255,0.05)' }}
          >
            {completeEvent.results.map((r) => (
              <div key={r.format} className={r.success ? 'text-green-400' : 'text-red-400'}>
                <span className="font-medium">{FORMAT_LABEL[r.format]}: </span>
                <span className="break-all">{r.success ? r.outputPath : r.error}</span>
              </div>
            ))}
          </div>
        )}

        {/* Close action */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={!canClose}
            className="px-4 py-2 rounded-xl text-sm font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed"
            style={
              canClose
                ? { background: 'var(--acc)', color: '#0a0a0a' }
                : { background: 'rgba(255,255,255,0.1)', color: 'var(--panel-muted)' }
            }
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
