// Tipos compartidos del exportador multiformato (espejo del back:
// back/src/lib/export-job-manager.ts). Se centralizan aqui tras eliminar
// use-export-stream.ts (flujo NDJSON) en favor del modelo job + polling.

export type BuildFormat = 'web-zip' | 'exe' | 'apk' | 'ipa';

export type PerFormatStatus = 'pending' | 'running' | 'done' | 'error';

export interface PerFormatState {
  status: PerFormatStatus;
  pct: number;
  outputPath?: string;
  error?: string;
}

export interface ExportJob {
  id: string;
  projectId: string;
  formats: BuildFormat[];
  status: 'running' | 'done' | 'error';
  currentFormat?: BuildFormat;
  step?: string; // texto del paso actual
  pct: number; // 0-100 global ponderado por formato
  perFormat: Record<string, PerFormatState>;
  error?: string;
  createdAt: number;
  finishedAt?: number;
}

export interface StartExportParams {
  projectId: string;
  formats: BuildFormat[];
}
