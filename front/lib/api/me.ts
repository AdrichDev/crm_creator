'use client';
// Endpoints client-scoped (rol cliente): el usuario solo ve SUS datos, vía REST
// (fuente única). El back resuelve la pertenencia por userId y devuelve el shape
// castellano ya listo para mostrar.
import { apiFetch } from './client';

export interface MyProfile {
  id: string;
  nombre: string;
  email: string;
  telefono: string;
}

export interface MyBookingRow {
  id: string;
  servicio: string;
  empleado: string;
  fecha: string;
  hora: string;
  estado: string;
}

export interface MyPackageRow {
  id: string;
  paquete: string;
  sesionesTotal: number;
  sesionesUsadas: number;
  restantes: number;
  estado: string;
  expiraEn: string | null;
}

/** Ficha del cliente logueado, o null si no tiene Customer en el negocio. */
export function getMyProfile(): Promise<MyProfile | null> {
  return apiFetch<MyProfile | null>('/me/profile');
}
export function getMyBookings(): Promise<MyBookingRow[]> {
  return apiFetch<MyBookingRow[]>('/me/bookings');
}
export function getMyPackages(): Promise<MyPackageRow[]> {
  return apiFetch<MyPackageRow[]>('/me/packages');
}
