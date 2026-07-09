'use client';
// Contexto global del exportador: mantiene el job vivo por encima de DashboardTabs
// para que sobreviva a cambios de pestaña. Al montar consulta GET /api/exports/active
// y reengancha el polling si hay un job en curso (o muestra el ultimo terminado
// dentro de la ventana de retencion como descartable).

import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { apiFetch, isApiEnabled } from '@/lib/api/client';
import { useExportJob } from './use-export-job';
import type { SaveFileHandle } from './download';
import type { ExportJob, StartExportParams } from './types';

interface ExportJobContextValue {
  job: ExportJob | null;
  isRunning: boolean;
  error: string | null;
  downloading: boolean;
  downloadError: string | null;
  start: (params: StartExportParams, handle?: SaveFileHandle | null) => Promise<void>;
  cancel: () => Promise<void>;
  dismiss: () => void;
}

const ExportJobContext = createContext<ExportJobContextValue | null>(null);

export function ExportJobProvider({ children }: { children: ReactNode }) {
  const { job, isRunning, error, downloading, downloadError, start, resume, cancel, dismiss } = useExportJob();
  const rehydrated = useRef(false);

  useEffect(() => {
    // Reenganche unico al montar; evita repetir en StrictMode/rerenders.
    if (rehydrated.current) return;
    rehydrated.current = true;
    if (!isApiEnabled()) return;
    apiFetch<ExportJob>('/exports/active')
      .then((active) => {
        if (active) resume(active);
      })
      .catch(() => {
        // Sin job activo o back inaccesible: arranque limpio.
      });
  }, [resume]);

  return (
    <ExportJobContext.Provider value={{ job, isRunning, error, downloading, downloadError, start, cancel, dismiss }}>
      {children}
    </ExportJobContext.Provider>
  );
}

export function useExportJobContext(): ExportJobContextValue {
  const ctx = useContext(ExportJobContext);
  if (!ctx) {
    throw new Error('useExportJobContext debe usarse dentro de ExportJobProvider');
  }
  return ctx;
}
