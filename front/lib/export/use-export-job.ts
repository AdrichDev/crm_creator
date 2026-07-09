'use client';
// Hook de exportacion por job + polling. Reemplaza a use-export-stream (NDJSON).
// start() hace POST /api/exports y arranca un polling de 1.5s a /status; se
// detiene al llegar a done|error. resume() reengancha un job existente (usado por
// el contexto tras GET /active). dismiss() limpia un job terminado.

import { useState, useRef, useCallback, useEffect } from 'react';
import { apiFetch, ApiError } from '@/lib/api/client';
import { downloadExportZip, filenameFromOutputPath, isAbortError, type SaveFileHandle } from './download';
import type { ExportJob, StartExportParams } from './types';

// Intervalo de polling del estado del job (ms).
export const POLL_INTERVAL_MS = 1500;

export interface UseExportJobReturn {
  job: ExportJob | null;
  isRunning: boolean;
  error: string | null;
  downloading: boolean;
  downloadError: string | null;
  start: (params: StartExportParams, handle?: SaveFileHandle | null) => Promise<void>;
  resume: (existing: ExportJob) => void;
  cancel: () => Promise<void>;
  dismiss: () => void;
}

export function useExportJob(): UseExportJobReturn {
  const [job, setJob] = useState<ExportJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const jobIdRef = useRef<string | null>(null);
  // Descarga automática al terminar: handle elegido en el clic de Exportar y el
  // jobId al que corresponde. Solo se auto-descarga un job arrancado en ESTA
  // sesión vía start() (no en resume(), para no bajar al recargar la página).
  const pendingDownloadRef = useRef<{ jobId: string; handle: SaveFileHandle | null } | null>(null);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const triggerDownload = useCallback(async (doneJob: ExportJob) => {
    const pending = pendingDownloadRef.current;
    if (!pending || pending.jobId !== doneJob.id) return;
    pendingDownloadRef.current = null; // Consumir una sola vez.
    // Nombre de fichero a partir del outputPath que fija el back (…-web-src.zip).
    const firstPath = doneJob.formats
      .map((f) => doneJob.perFormat[f]?.outputPath)
      .find((p): p is string => Boolean(p));
    const filename = filenameFromOutputPath(firstPath);
    setDownloading(true);
    setDownloadError(null);
    try {
      await downloadExportZip(doneJob.id, filename, pending.handle);
    } catch (err) {
      // Cancelar el guardado no es error; el resto sí se muestra.
      if (!isAbortError(err)) {
        setDownloadError(err instanceof Error ? err.message : 'Error al descargar el ZIP.');
      }
    } finally {
      setDownloading(false);
    }
  }, []);

  const poll = useCallback(async () => {
    const id = jobIdRef.current;
    if (!id) return;
    try {
      const next = await apiFetch<ExportJob>(`/exports/${id}/status`);
      if (!next) return;
      setJob(next);
      if (next.status === 'done' || next.status === 'error') {
        stopPolling();
      }
      if (next.status === 'done') {
        // Descarga automática al handle elegido (o anchor si no hay handle).
        void triggerDownload(next);
      }
    } catch (err) {
      // 404: el job ya no existe (retencion expirada) → dejar de sondear.
      if (err instanceof ApiError && err.status === 404) {
        stopPolling();
        return;
      }
      // Fallo de red transitorio: no romper el polling; se reintenta al siguiente tick.
    }
  }, [stopPolling, triggerDownload]);

  const startPolling = useCallback(
    (id: string) => {
      jobIdRef.current = id;
      stopPolling();
      intervalRef.current = setInterval(() => {
        void poll();
      }, POLL_INTERVAL_MS);
      // Primer tick inmediato para no esperar 1.5s a la primera lectura.
      void poll();
    },
    [poll, stopPolling],
  );

  const start = useCallback(
    async (params: StartExportParams, handle: SaveFileHandle | null = null) => {
      setError(null);
      setDownloadError(null);
      try {
        const res = await apiFetch<{ jobId: string }>('/exports', {
          method: 'POST',
          body: JSON.stringify(params),
        });
        if (res?.jobId) {
          // Registrar el handle (o null) para auto-descargar al terminar este job.
          pendingDownloadRef.current = { jobId: res.jobId, handle };
          // Estado optimista inicial mientras llega el primer /status.
          setJob({
            id: res.jobId,
            projectId: params.projectId,
            formats: params.formats,
            status: 'running',
            pct: 0,
            perFormat: Object.fromEntries(
              params.formats.map((f) => [f, { status: 'pending', pct: 0 }]),
            ),
            createdAt: Date.now(),
          });
          startPolling(res.jobId);
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          setError('Ya hay una exportación en curso.');
        } else {
          setError(err instanceof Error ? err.message : 'Error al iniciar la exportación.');
        }
      }
    },
    [startPolling],
  );

  const resume = useCallback(
    (existing: ExportJob) => {
      setJob(existing);
      setError(null);
      if (existing.status === 'running') {
        startPolling(existing.id);
      }
    },
    [startPolling],
  );

  const dismiss = useCallback(() => {
    stopPolling();
    jobIdRef.current = null;
    pendingDownloadRef.current = null;
    setJob(null);
    setError(null);
    setDownloadError(null);
  }, [stopPolling]);

  const cancel = useCallback(async () => {
    const id = jobIdRef.current;
    if (!id) return;
    try {
      await apiFetch(`/exports/${id}`, { method: 'DELETE' });
      // El siguiente tick de polling leerá el estado 'error' ('Exportación cancelada')
      // y se detendrá solo, pero forzamos un tick inmediato para más feedback.
      void poll();
    } catch (err) {
      console.error('Error al cancelar exportación:', err);
    }
  }, [poll]);

  // Limpieza del intervalo al desmontar.
  useEffect(() => stopPolling, [stopPolling]);

  return {
    job,
    isRunning: job?.status === 'running',
    error,
    downloading,
    downloadError,
    start,
    resume,
    cancel,
    dismiss,
  };
}
