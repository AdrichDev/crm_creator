'use client';
import type { SectorFieldsDef } from '@/lib/config/citas-sector-fields';
import type { Tone } from '@/components/ui/primitives';
import { DOW_FULL } from '@/lib/config/constants';

/** Color de borde izquierdo de tarjeta según estado de cita. */
export const estadoTone = (s: string): string =>
  s === 'Completada' ? '#6aa8ff' : s === 'Cancelada' ? '#ff4757' : 'var(--acc)';

/** Badge tone según estado. */
export const tone = (s: string): Tone =>
  s === 'Confirmada' ? 'green' : s === 'Pendiente' ? 'amber' : s === 'Completada' ? 'blue' : 'red';

/** Día de la semana en español desde fecha YYYY-MM-DD. */
export function diaSemanaLabel(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  return DOW_FULL[(dt.getDay() + 6) % 7];
}

// Notas de citas comerciales con formato canónico `Acción: <accion> | Canal: <canal>`
// (cualquiera de los dos campos puede faltar). Se parte por ` | ` y se lee cada
// campo por su etiqueta, tolerando notas legacy que sólo llevan `Canal: X`.
function extractField(notes: string | null | undefined, label: string): string | undefined {
  if (!notes) return undefined;
  for (const seg of notes.split(' | ')) {
    // Anclado al INICIO del segmento: un texto libre de Acción que contenga "Canal:" (p.ej.
    // "Confirmar Canal: web") no debe leerse como el campo Canal. Cada campo solo se reconoce
    // cuando el segmento empieza por su etiqueta.
    const m = seg.match(new RegExp(`^${label}:\\s*(.+)`));
    if (m) return m[1].trim();
  }
  return undefined;
}

/** Extrae canal desde "Canal: Videollamada" en notes (soporta el formato Acción+Canal). */
export function extractCanal(notes?: string | null): string {
  return extractField(notes, 'Canal') ?? '—';
}

/** Extrae acción desde "Acción: Visita comercial" en notes (vertical comerciales). */
export function extractAccion(notes?: string | null): string {
  return extractField(notes, 'Acción') ?? '—';
}

/** Extrae el comentario libre cuando el Servicio elegido es "Otros" (ver nueva-cita-modal
 *  y citas/page.tsx: el select de servicio revela un input "Comentarios" que se pliega
 *  aquí como un segmento más del formato canónico). */
export function extractComentarios(notes?: string | null): string {
  return extractField(notes, 'Comentarios') ?? '—';
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
    return [['Comercial', c.empleado || '—'], ['Acción', extractAccion(c.notes)], ['Canal', extractCanal(c.notes)]];
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
