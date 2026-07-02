'use client';
// crm-citas-google-calendar (WU4.1): autoservicio del feed ICS + preferencia de push.
// GET /calendar/status → estado (sin exponer el token en claro).
// POST /calendar/token → genera/regenera (el valor en claro solo viene en ESTA respuesta).
// DELETE /calendar/token → revoca.
// PATCH /calendar/preferences → toggle "enviar a mi calendario".
import { apiFetch, apiBaseUrl } from './client';

export interface CalendarStatus {
  hasToken: boolean;
  pushEnabled: boolean;
}

export interface CalendarTokenResult {
  /** Valor en claro — mostrar UNA sola vez, nunca se puede volver a recuperar. */
  token: string;
  /** Ruta relativa de la API; se ancla con NEXT_PUBLIC_API_URL para la URL completa. */
  path: string;
  regenerated: boolean;
}

/** Estado actual: si hay token configurado y si el push está activo. */
export async function getCalendarStatus(): Promise<CalendarStatus> {
  return apiFetch<CalendarStatus>('/calendar/status');
}

/** Genera (o regenera, invalidando el anterior) el token del feed ICS. */
export async function generateCalendarToken(): Promise<CalendarTokenResult> {
  return apiFetch<CalendarTokenResult>('/calendar/token', { method: 'POST' });
}

/** Revoca el token: el feed queda muerto al instante. */
export async function revokeCalendarToken(): Promise<void> {
  await apiFetch<void>('/calendar/token', { method: 'DELETE' });
}

/** Activa/desactiva el push de citas confirmadas/recordatorios a Google Calendar. */
export async function updateCalendarPushEnabled(pushEnabled: boolean): Promise<{ pushEnabled: boolean }> {
  return apiFetch<{ pushEnabled: boolean }>('/calendar/preferences', {
    method: 'PATCH',
    body: JSON.stringify({ pushEnabled }),
  });
}

/** Construye la URL absoluta del feed ICS a partir del path relativo devuelto por el back. */
export function calendarFeedUrl(path: string): string {
  const base = apiBaseUrl() ?? '';
  return `${base}/api${path}`;
}
