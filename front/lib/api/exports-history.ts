'use client';
// Cliente de historial de versiones del generador (crm-generator-versiones-historico
// WU5). Reutiliza apiFetch (Bearer de sesión + x-business-id) — mismo carril que el
// resto de la API tenant-facing, ver client.ts. Sin lógica de negocio: solo transporta.
import { apiFetch, isApiEnabled } from '@/lib/api/client';
import type { TenantLifecycle } from '@/lib/api/tenant-status';

export interface ExportVersionView {
  id: string;
  businessId: string;
  businessName: string;
  version: string;
  changeNote: string | null;
  createdAt: string;
  lifecycle: TenantLifecycle;
  /**
   * `true` si el negocio tiene ≥1 `TenantStateEvent` registrado. `lifecycle` nace
   * `ACTIVE` por defecto incluso sin desplegar nunca — usar este campo (no
   * `lifecycle`) para distinguir "sin desplegar" de "ACTIVE real" en la UI.
   */
  hasStateEvents: boolean;
}

export interface ExportVersionsResponse {
  versions: ExportVersionView[];
  /** Proyectos distintos con ≥1 export (no el total de filas/exports). */
  distinctCount: number;
}

const EMPTY: ExportVersionsResponse = { versions: [], distinctCount: 0 };

/** Historial completo de versiones (scoping por membership, lo resuelve el back). */
export async function fetchExportVersions(): Promise<ExportVersionsResponse> {
  if (!isApiEnabled()) return EMPTY;
  try {
    const data = await apiFetch<ExportVersionsResponse>('/exports/versions');
    return {
      versions: data?.versions ?? [],
      distinctCount: data?.distinctCount ?? 0,
    };
  } catch {
    return EMPTY;
  }
}

/** URL firmada (TTL corto) para descargar el artefacto exacto de una versión. */
export async function fetchExportVersionDownloadUrl(versionId: string): Promise<string | null> {
  if (!isApiEnabled()) return null;
  try {
    const { url } = await apiFetch<{ url: string }>(
      `/exports/versions/${encodeURIComponent(versionId)}/download`,
    );
    return url;
  } catch {
    return null;
  }
}

/**
 * Descarga el artefacto exacto de una versión ya generada — SIN regenerar/rebuild
 * (spec `dashboard-generados`, escenario "Download old version returns original
 * source"). Resuelve la URL firmada y abre una pestaña nueva; no toca export-job-manager.
 */
export async function downloadExportVersion(versionId: string): Promise<void> {
  const url = await fetchExportVersionDownloadUrl(versionId);
  if (!url) return;
  if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener,noreferrer');
}
