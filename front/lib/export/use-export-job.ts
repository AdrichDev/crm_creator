'use client';
// Hook de exportacion por job + polling. Reemplaza a use-export-stream (NDJSON).
// start() hace POST /api/exports y arranca un polling de 1.5s a /status; se
// detiene al llegar a done|error. resume() reengancha un job existente (usado por
// el contexto tras GET /active). dismiss() limpia un job terminado.

import { useState, useRef, useCallback, useEffect } from 'react';
import { apiFetch, ApiError } from '@/lib/api/client';
import type { ExportJob, StartExportParams } from './types';

// Intervalo de polling del estado del job (ms).
export const POLL_INTERVAL_MS = 1500;

export interface UseExportJobReturn {
  job: ExportJob | null;
  isRunning: boolean;
  error: string | null;
  start: (params: StartExportParams) => Promise<void>;
  resume: (existing: ExportJob) => void;
  dismiss: () => void;
}

export function useExportJob(): UseExportJobReturn {
  const [job, setJob] = useState<ExportJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const jobIdRef = useRef<string | null>(null);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
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
    } catch (err) {
      // 404: el job ya no existe (retencion expirada) → dejar de sondear.
      if (err instanceof ApiError && err.status === 404) {
        stopPolling();
        return;
      }
      // Fallo de red transitorio: no romper el polling; se reintenta al siguiente tick.
    }
  }, [stopPolling]);

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
    async (params: StartExportParams) => {
      setError(null);
      try {
        const res = await apiFetch<{ jobId: string }>('/exports', {
          method: 'POST',
          body: JSON.stringify(params),
        });
        if (res?.jobId) {
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
    setJob(null);
    setError(null);
  }, [stopPolling]);

  // Limpieza del intervalo al desmontar.
  useEffect(() => stopPolling, [stopPolling]);

  return {
    job,
    isRunning: job?.status === 'running',
    error,
    start,
    resume,
    dismiss,
  };
}
