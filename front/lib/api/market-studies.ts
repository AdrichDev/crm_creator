'use client';
// Cliente del CRM para los estudios de mercado. Pega al PROXY del propio Next
// (`/api/market-studies/*`), que a su vez reenvía a agents-agency con el service
// token (lib/server/aa.ts). NO usa apiFetch (ese apunta al back Express del CRM).
// Los tipos reflejan la respuesta REAL de AA (back/src/routes/market-studies.ts).

export interface MarketStudyInputs {
  zone: string;
  postalCode?: string;
  radiusKm: number;
  expansionZones: string[];
  targetSectors: string[];
  avgBudget?: number;
}

export interface StudySection {
  key: string;
  title: string;
  markdown: string;
}

export type ProspectStatus = 'new' | 'contacted' | 'discarded';
export type WebsiteStatus = 'no_web' | 'web_no_chatbot' | 'web_chatbot';

export interface Prospect {
  placeId: string;
  name: string;
  address?: string;
  phone?: string;
  rating?: number;
  sector?: string;
  candidateServices?: string[];
  status: ProspectStatus;
  websiteStatus?: WebsiteStatus;
  websiteUrl?: string;
  opportunityScore?: number;
  unverified?: boolean;
  lat?: number;
  lng?: number;
  distanceKm?: number;
  outOfRadius?: boolean;
}

export interface Study {
  id: string;
  title: string;
  inputs: MarketStudyInputs;
  sections: StudySection[];
  prospects: Prospect[];
  status: string;
  successScore?: number | null;
  createdAt: string;
  updatedAt: string;
  placesConfigured?: boolean;
  placesWarning?: string;
  generatedPrompt?: string;
}

/** Resumen de estudio devuelto por GET /api/market-studies. */
export interface StudySummary {
  id: string;
  title: string;
  status: string;
  successScore?: number | null;
  createdAt: string;
}

const BASE = '/api/market-studies';

async function msFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  const res = await fetch(`${BASE}${path}`, { ...init, headers, cache: 'no-store' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = typeof body?.error === 'string' ? body.error : `Error ${res.status}`;
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── Estudios ────────────────────────────────────────────────────────────────

export function listStudies(): Promise<StudySummary[]> {
  return msFetch<StudySummary[]>('');
}

export function getStudy(id: string): Promise<Study> {
  return msFetch<Study>(`/${id}`);
}

export function createStudy(payload: {
  title: string;
  inputs: MarketStudyInputs;
  model?: string;
  reasoningEffort?: string;
}): Promise<Study> {
  return msFetch<Study>('', { method: 'POST', body: JSON.stringify(payload) });
}

export function patchStudy(
  id: string,
  patch: Partial<{ title: string; successScore: number | null; inputs: MarketStudyInputs; model: string; reasoningEffort: string }>,
): Promise<Study> {
  return msFetch<Study>(`/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

export function generateStudy(
  id: string,
  body: { feedback?: string; refreshProspects?: boolean; generatePrompt?: boolean } = {},
): Promise<Study> {
  return msFetch<Study>(`/${id}/generate`, { method: 'POST', body: JSON.stringify(body) });
}

// ── Secciones ─────────────────────────────────────────────────────────────

export function patchSection(id: string, key: string, markdown: string): Promise<{ ok: boolean; section: StudySection }> {
  return msFetch(`/${id}/sections/${key}`, { method: 'PATCH', body: JSON.stringify({ markdown }) });
}

export function regenerateSection(id: string, key: string): Promise<{ ok: boolean; section: StudySection }> {
  return msFetch(`/${id}/sections/${key}/regenerate`, { method: 'POST' });
}

// ── Prospectos ──────────────────────────────────────────────────────────────

export function discoverProspects(id: string): Promise<{ prospects: Prospect[]; partial?: boolean; warning?: string }> {
  return msFetch(`/${id}/prospect`, { method: 'POST' });
}

export function purgeOutOfRadius(id: string): Promise<{ ok: boolean; prospects: Prospect[]; removed: number }> {
  return msFetch(`/${id}/prospects/purge-out-of-radius`, { method: 'POST' });
}

export function patchProspectStatus(id: string, placeId: string, status: ProspectStatus): Promise<{ ok: boolean; prospect: Prospect }> {
  return msFetch(`/${id}/prospects/${placeId}`, { method: 'PATCH', body: JSON.stringify({ status }) });
}

/** URL de exportación CSV (pasa por el proxy GET → AA). */
export function prospectsExportUrl(id: string): string {
  return `${BASE}/${id}/prospects/export`;
}
