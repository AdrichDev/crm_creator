'use client';
// Endpoints client-scoped (rol cliente): el usuario solo ve SUS datos.
import { apiFetch } from './client';

export interface MyBookingRow {
  id: string;
  startAt?: string;
  endAt?: string;
  status?: string;
  service?: { name?: string } | null;
}

export function getMyProfile<T = unknown>(): Promise<T> {
  return apiFetch<T>('/me/profile');
}
export function getMyBookings(): Promise<MyBookingRow[]> {
  return apiFetch<MyBookingRow[]>('/me/bookings');
}
export function getMyPackages<T = unknown[]>(): Promise<T> {
  return apiFetch<T>('/me/packages');
}

/** Mapea el estado de Booking del back al vocabulario del panel de citas. */
export function mapBookingStatus(s?: string): string {
  const m: Record<string, string> = {
    PENDING: 'Pendiente', CONFIRMED: 'Confirmada', CANCELLED: 'Cancelada',
    CANCELED: 'Cancelada', COMPLETED: 'Completada', NO_SHOW: 'Cancelada',
  };
  return (s && m[s]) || 'Pendiente';
}
