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
  // crm-generator-versiones-historico (WU4): obligatorios a partir del 2º export
  // del proyecto (el back rechaza con 400 si faltan/no son mayores); el primer
  // export no los necesita (se resuelve "1.0.0" en el servidor).
  version?: string;
  changeNote?: string;
}
