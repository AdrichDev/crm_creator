// Catálogo de "chips" del dashboard del trabajador (rol `trabajador`).
// Widgets/acciones rápidas que el admin activa o desactiva por negocio.
// Mismo patrón que el catálogo de módulos (lib/config/modules.ts).
import type { ModuleId } from './modules';

export type WorkerChipId =
  | 'fichaje-rapido'
  | 'proxima-cita'
  | 'mis-ventas-hoy'
  | 'disponibilidad'
  | 'pedir-ausencia'
  | 'tareas-turno';

export interface WorkerChipDef {
  id: WorkerChipId;
  /** Nombre visible del chip. */
  label: string;
  /** Descripción corta para el panel de control del admin. */
  description: string;
  /** Nombre de icono lucide-react. */
  icon: string;
  /**
   * Módulo del que depende el chip. Si está apagado en config.modules,
   * el chip se muestra deshabilitado (con aviso) y no se renderiza en la vista.
   */
  dependsOn?: ModuleId;
}

export const WORKER_CHIPS: WorkerChipDef[] = [
  { id: 'fichaje-rapido', label: 'Fichaje rápido', description: 'Entrada/salida con un toque y horas de hoy.', icon: 'Clock', dependsOn: 'fichaje' },
  { id: 'proxima-cita', label: 'Próxima cita', description: 'Siguiente cita del trabajador con acceso directo.', icon: 'CalendarClock', dependsOn: 'citas' },
  { id: 'mis-ventas-hoy', label: 'Mis ventas hoy', description: 'Total vendido hoy por el trabajador.', icon: 'Receipt', dependsOn: 'ventas' },
  { id: 'disponibilidad', label: 'Disponibilidad', description: 'Estado disponible / ocupado / pausa (local).', icon: 'CircleDot' },
  { id: 'pedir-ausencia', label: 'Pedir ausencia', description: 'Atajo a la solicitud de vacaciones o ausencia.', icon: 'Plane', dependsOn: 'vacaciones' },
  { id: 'tareas-turno', label: 'Tareas del turno', description: 'Checklist del turno (local).', icon: 'ListChecks' },
];

export const WORKER_CHIP_MAP: Record<WorkerChipId, WorkerChipDef> = Object.fromEntries(
  WORKER_CHIPS.map((c) => [c.id, c]),
) as Record<WorkerChipId, WorkerChipDef>;

/** Mapa de chips todos en false (estado por defecto en config nuevas). */
export function emptyWorkerChips(): Record<WorkerChipId, boolean> {
  return Object.fromEntries(
    WORKER_CHIPS.map((c) => [c.id, false]),
  ) as Record<WorkerChipId, boolean>;
}

/**
 * ¿El chip está disponible? Activo en config Y, si depende de un módulo,
 * ese módulo encendido. Si falta el módulo dependiente → no disponible.
 */
export function workerChipAvailable(
  chip: WorkerChipDef,
  chips: Record<WorkerChipId, boolean>,
  modules: Record<ModuleId, boolean>,
): boolean {
  if (!chips[chip.id]) return false;
  if (chip.dependsOn && !modules[chip.dependsOn]) return false;
  return true;
}

/** Chips activos y con su módulo (si lo hay) encendido — los que se renderizan. */
export function activeWorkerChips(
  chips: Record<WorkerChipId, boolean>,
  modules: Record<ModuleId, boolean>,
): WorkerChipDef[] {
  return WORKER_CHIPS.filter((c) => workerChipAvailable(c, chips, modules));
}
