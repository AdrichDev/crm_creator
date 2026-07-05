'use client';
import type { ReactNode } from 'react';
import type { SectorFieldsDef } from '@/lib/config/citas-sector-fields';
import { DOW_FULL } from '@/lib/config/constants';

/** Color de borde izquierdo de tarjeta según estado de cita. */
export const estadoTone = (s: string): string =>
  s === 'Completada' ? '#6aa8ff' : s === 'Cancelada' ? '#ff4757' : 'var(--acc)';

/** Badge tone según estado. */
export const tone = (s: string): string =>
  s === 'Confirmada' ? 'green' : s === 'Pendiente' ? 'amber' : s === 'Completada' ? 'blue' : 'red';

/** Día de la semana en español desde fecha YYYY-MM-DD. */
export function diaSemanaLabel(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  return DOW_FULL[(dt.getDay() + 6) % 7];
}

/** Extrae canal desde "Canal: Videollamada" en notes. */
export function extractCanal(notes?: string | null): string {
  const m = notes?.match(/Canal:\s*(.+)/);
  return m?.[1]?.trim() ?? '—';
}

/** Metadatos secundarios de tarjeta según vertical sectorial (entrenamiento/clase/reunión). */
export function metaFields(
  c: { recurso?: string | null; fecha: string; empleado?: string | null; aforo?: number | null; notes?: string | null; servicio?: string | null },
  sector?: SectorFieldsDef
): [string, string][] {
  if (sector?.formComponent === 'entrenamiento') {
    return [['Campo', c.recurso ?? '—'], ['Día', diaSemanaLabel(c.fecha)], ['Entrenador', c.empleado || '—']];
  }
  if (sector?.formComponent === 'clase') {
    return [['Instructor', c.empleado || '—'], ['Sala', c.recurso ?? '—'], ['Día', diaSemanaLabel(c.fecha)], ['Aforo', String(c.aforo ?? '—')]];
  }
  if (sector?.formComponent === 'reunion') {
    return [['Comercial', c.empleado || '—'], ['Canal', extractCanal(c.notes)]];
  }
  return [['Servicio', c.servicio || '—'], ['Profesional', c.empleado || '—']];
}

/** Interfaz base para items de agenda (cita, reserva, clase, etc.). */
export interface AgendaItemBase {
  id: string | number;
  fecha: string; // 'YYYY-MM-DD'
  hora: string;  // 'HH:mm'
  cliente: string;
  estado: string;
  [key: string]: unknown;
}

/** Props comunes para tarjeta de evento en agenda (shared between widget + full-page). */
export interface CitaCardProps<T extends AgendaItemBase> {
  c: T;
  compact: boolean;
  sector?: SectorFieldsDef;
  apiEnabled?: boolean;
  onCliente?: (customerId: string) => void;
  onEdit?: () => void;
  onDelete?: () => void;
}
