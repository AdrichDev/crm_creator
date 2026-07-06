'use client';
import { apiFetch } from '@/lib/api/client';
import type {
  ComercialCustomer, ComercialContacto, VisitStateDto, VisitDto, CustomerNoteDto, ReminderDto, ReminderSummaryDto,
} from './types';

interface Listed<T> { items: T[]; total?: number; }

// ---- Clientes (comercial) ----
export interface CustomerFilters {
  estadoVisitaId?: string;
  categoriaAbc?: string;
  tipoRegistro?: string;
  localidad?: string;
  provincia?: string;
  codigoPostal?: string;
  near?: { lat: number; lng: number; radiusKm?: number };
  search?: string;
  page?: number;
  limit?: number;
}

export async function fetchCustomers(f: CustomerFilters = {}): Promise<{ items: ComercialCustomer[]; total: number }> {
  const p = new URLSearchParams();
  p.set('page', String(f.page ?? 1));
  p.set('limit', String(f.limit ?? 500));
  if (f.search) p.set('search', f.search);
  if (f.estadoVisitaId) p.set('estadoVisitaId', f.estadoVisitaId);
  if (f.categoriaAbc) p.set('categoriaAbc', f.categoriaAbc);
  if (f.tipoRegistro) p.set('tipoRegistro', f.tipoRegistro);
  if (f.localidad) p.set('localidad', f.localidad);
  if (f.provincia) p.set('provincia', f.provincia);
  if (f.codigoPostal) p.set('codigoPostal', f.codigoPostal);
  if (f.near) {
    p.set('near', `${f.near.lat},${f.near.lng}`);
    if (f.near.radiusKm) p.set('radiusKm', String(f.near.radiusKm));
  }
  const res = await apiFetch<{ items: ComercialCustomer[]; total: number }>(`/customers?${p.toString()}`);
  return { items: res.items ?? [], total: res.total ?? 0 };
}

export async function patchCustomer(id: string, data: Record<string, unknown>): Promise<ComercialCustomer> {
  return apiFetch<ComercialCustomer>(`/customers/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function createCustomer(data: Record<string, unknown>): Promise<ComercialCustomer> {
  return apiFetch<ComercialCustomer>('/customers', { method: 'POST', body: JSON.stringify(data) });
}

export async function convertProspect(id: string): Promise<ComercialCustomer> {
  return apiFetch<ComercialCustomer>(`/customers/${id}/convert`, { method: 'POST', body: '{}' });
}

export interface ImportResult {
  creados: number;
  duplicados: Array<{ row: Record<string, unknown>; matchId: string; motivo: string }>;
  totalFilas: number;
}
export async function importCustomers(rows: Record<string, unknown>[], force = false): Promise<ImportResult> {
  return apiFetch<ImportResult>('/customers/import', { method: 'POST', body: JSON.stringify({ rows, force }) });
}

// Re-geolocalización batch (crm-geo-real-clientes): re-intenta PENDING/FAILED con
// dirección; force=true incluye también los OK (corrige coords sembradas a mano).
export interface GeocodeRerunResult { ok: number; failed: number; skipped: number; }
export async function geocodeRerun(force = false): Promise<GeocodeRerunResult> {
  return apiFetch<GeocodeRerunResult>('/customers/geocode/rerun', { method: 'POST', body: JSON.stringify({ force }) });
}

// ---- Contactos geolocalizados en el mapa (crm-operaos 9.12) ----
// Trae los contactos del negocio para pintarlos como una segunda capa de marcadores.
// La ficha del contacto vive en /contactos; aquí sólo se necesitan sus coordenadas.
export async function fetchContactos(limit = 500): Promise<ComercialContacto[]> {
  const res = await apiFetch<{ items: ComercialContacto[] }>(`/contactos?limit=${limit}`);
  return res.items ?? [];
}

// Re-geolocalización batch de contactos (mismo contrato que /customers/geocode/rerun):
// re-intenta PENDING/FAILED con dirección; force=true incluye también los OK.
export async function contactosGeocodeRerun(force = false): Promise<GeocodeRerunResult> {
  return apiFetch<GeocodeRerunResult>('/contactos/geocode/rerun', { method: 'POST', body: JSON.stringify({ force }) });
}

// ---- Estados de visita ----
export async function fetchVisitStates(): Promise<VisitStateDto[]> {
  const res = await apiFetch<Listed<VisitStateDto>>('/visit-states');
  return res.items ?? [];
}
export async function createVisitState(data: Partial<VisitStateDto>): Promise<VisitStateDto> {
  return apiFetch<VisitStateDto>('/visit-states', { method: 'POST', body: JSON.stringify(data) });
}
export async function patchVisitState(id: string, data: Partial<VisitStateDto>): Promise<VisitStateDto> {
  return apiFetch<VisitStateDto>(`/visit-states/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}
export async function deleteVisitState(id: string): Promise<void> {
  await apiFetch(`/visit-states/${id}`, { method: 'DELETE' });
}

// ---- Notas (inmutables) ----
export async function fetchNotes(customerId: string): Promise<CustomerNoteDto[]> {
  const res = await apiFetch<Listed<CustomerNoteDto>>(`/customer-notes?customerId=${customerId}`);
  return res.items ?? [];
}
export async function createNote(customerId: string, texto: string): Promise<CustomerNoteDto> {
  return apiFetch<CustomerNoteDto>('/customer-notes', { method: 'POST', body: JSON.stringify({ customerId, texto }) });
}

// ---- Visitas ----
export async function fetchVisits(customerId: string): Promise<VisitDto[]> {
  const res = await apiFetch<Listed<VisitDto>>(`/visits?customerId=${customerId}`);
  return res.items ?? [];
}
export async function createVisit(data: Record<string, unknown>): Promise<VisitDto> {
  return apiFetch<VisitDto>('/visits', { method: 'POST', body: JSON.stringify(data) });
}

// ---- Recordatorios ----
export async function fetchReminders(customerId?: string, vencidos = false): Promise<ReminderDto[]> {
  const p = new URLSearchParams();
  if (customerId) p.set('customerId', customerId);
  if (vencidos) p.set('vencidos', '1');
  const res = await apiFetch<Listed<ReminderDto>>(`/reminders?${p.toString()}`);
  return res.items ?? [];
}
export async function createReminder(data: Record<string, unknown>): Promise<ReminderDto> {
  return apiFetch<ReminderDto>('/reminders', { method: 'POST', body: JSON.stringify(data) });
}
export async function patchReminder(id: string, data: Record<string, unknown>): Promise<ReminderDto> {
  return apiFetch<ReminderDto>(`/reminders/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}
// Contadores para el panel de seguimiento y la campana (agregado ligero, sin listas).
export async function fetchReminderSummary(): Promise<ReminderSummaryDto> {
  return apiFetch<ReminderSummaryDto>('/reminders/summary');
}
