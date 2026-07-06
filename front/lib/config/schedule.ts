// Horario de apertura del negocio (crm-operaos-agenda-contactos-fichaje-telegram,
// sub-item "horario de negocio en onboarding").
//
// Modelo: el usuario define GRUPOS de días — cada grupo es un conjunto de días
// marcados (L M X J V S D) con su(s) tramo(s) horario(s). Ejemplo: grupo 1 = L-J
// con 09:00-17:00, grupo 2 = V con 09:00-14:00, grupo 3 = S con 10:00-14:00.
// Un día que no pertenece a ningún grupo se considera CERRADO (no genera filas).
//
// Regla de exclusividad (documentada y testeada): un día solo puede pertenecer a
// UN grupo. Al marcarlo en un grupo se QUITA automáticamente de cualquier otro
// (last-wins: la última asignación gana; no hay estados inválidos posibles).
//
// Persistencia doble:
//  1. El objeto completo viaja dentro de TenantConfig.horario (BusinessSetting) —
//     así el onboarding en modo edición recarga los grupos tal cual se definieron.
//  2. Aplanado a tramos por día (scheduleToTramos) se persiste en OpeningHour
//     (horario_apertura) vía PUT /config/horario — es lo que consume
//     back/src/lib/availability.ts (iterateDaySlots) para generar los chips de hora.
//
// Convención diaSemana: 0=domingo .. 6=sábado (misma que OpeningHour y Date.getDay()).

export type ScheduleMode = 'continuo' | 'partido';

/** Tramo horario "HH:MM"-"HH:MM" (mismo shape que /employees/:id/horario). */
export interface ScheduleTramo {
  inicio: string;
  fin: string;
}

/** Grupo de días con horario común. `dias` en convención 0=dom..6=sáb. */
export interface ScheduleGroup {
  dias: number[];
  tramos: ScheduleTramo[];
}

/** Horario semanal del negocio tal como se guarda en TenantConfig.horario. */
export interface BusinessSchedule {
  /** continuo = 1 tramo por día; partido = 2+ tramos por día. */
  mode: ScheduleMode;
  groups: ScheduleGroup[];
}

/** Tramo aplanado por día, listo para PUT /config/horario (espejo de OpeningHour). */
export interface TramoDia {
  diaSemana: number;
  inicio: string;
  fin: string;
}

/** Días de la semana en orden visual L M X J V S D (valor = convención 0-6). */
export const DIAS_SEMANA: { value: number; label: string; title: string }[] = [
  { value: 1, label: 'L', title: 'Lunes' },
  { value: 2, label: 'M', title: 'Martes' },
  { value: 3, label: 'X', title: 'Miércoles' },
  { value: 4, label: 'J', title: 'Jueves' },
  { value: 5, label: 'V', title: 'Viernes' },
  { value: 6, label: 'S', title: 'Sábado' },
  { value: 0, label: 'D', title: 'Domingo' },
];

const TRAMO_CONTINUO: ScheduleTramo = { inicio: '09:00', fin: '17:00' };
const TRAMOS_PARTIDO: ScheduleTramo[] = [
  { inicio: '09:00', fin: '14:00' },
  { inicio: '16:00', fin: '20:00' },
];

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Horario vacío (todos los días cerrados) en el modo indicado. */
export function emptySchedule(mode: ScheduleMode = 'continuo'): BusinessSchedule {
  return { mode, groups: [] };
}

/** Tramos por defecto según el modo (continuo 1 tramo, partido 2). */
export function defaultTramos(mode: ScheduleMode): ScheduleTramo[] {
  return mode === 'partido' ? TRAMOS_PARTIDO.map((t) => ({ ...t })) : [{ ...TRAMO_CONTINUO }];
}

/** Grupo nuevo: por defecto L-V para el primer grupo, vacío para los siguientes. */
export function createGroup(mode: ScheduleMode, dias: number[] = []): ScheduleGroup {
  return { dias: [...dias], tramos: defaultTramos(mode) };
}

/**
 * Añade un grupo al horario. El PRIMER grupo se pre-rellena con L-V (el caso
 * común); los siguientes empiezan sin días para que el usuario los elija
 * (los días ya usados no pueden duplicarse — ver setGroupDay).
 */
export function addGroup(schedule: BusinessSchedule): BusinessSchedule {
  const usados = new Set(schedule.groups.flatMap((g) => g.dias));
  const dias = schedule.groups.length === 0 ? [1, 2, 3, 4, 5].filter((d) => !usados.has(d)) : [];
  return { ...schedule, groups: [...schedule.groups, createGroup(schedule.mode, dias)] };
}

/** Quita un grupo; sus días quedan cerrados (sin filas OpeningHour). */
export function removeGroup(schedule: BusinessSchedule, groupIndex: number): BusinessSchedule {
  return { ...schedule, groups: schedule.groups.filter((_, i) => i !== groupIndex) };
}

/**
 * Marca/desmarca un día en un grupo. Exclusividad last-wins: al marcar un día
 * se elimina de cualquier otro grupo (un día no puede tener dos horarios).
 */
export function setGroupDay(schedule: BusinessSchedule, groupIndex: number, dia: number, on: boolean): BusinessSchedule {
  const groups = schedule.groups.map((g, i) => {
    if (i === groupIndex) {
      const dias = on ? [...new Set([...g.dias, dia])] : g.dias.filter((d) => d !== dia);
      return { ...g, dias };
    }
    // Regla de exclusividad: el día marcado se quita de los demás grupos.
    return on ? { ...g, dias: g.dias.filter((d) => d !== dia) } : g;
  });
  return { ...schedule, groups };
}

/** Edita un tramo concreto de un grupo (inicio o fin). */
export function setGroupTramo(
  schedule: BusinessSchedule, groupIndex: number, tramoIndex: number, patch: Partial<ScheduleTramo>,
): BusinessSchedule {
  const groups = schedule.groups.map((g, i) => (i === groupIndex
    ? { ...g, tramos: g.tramos.map((t, j) => (j === tramoIndex ? { ...t, ...patch } : t)) }
    : g));
  return { ...schedule, groups };
}

/** Añade un tramo extra a un grupo (solo tiene sentido en modo partido). */
export function addGroupTramo(schedule: BusinessSchedule, groupIndex: number): BusinessSchedule {
  const groups = schedule.groups.map((g, i) => (i === groupIndex
    ? { ...g, tramos: [...g.tramos, { inicio: '16:00', fin: '20:00' }] }
    : g));
  return { ...schedule, groups };
}

/** Quita un tramo de un grupo respetando el mínimo del modo (1 continuo / 2 partido). */
export function removeGroupTramo(schedule: BusinessSchedule, groupIndex: number, tramoIndex: number): BusinessSchedule {
  const min = schedule.mode === 'partido' ? 2 : 1;
  const groups = schedule.groups.map((g, i) => {
    if (i !== groupIndex || g.tramos.length <= min) return g;
    return { ...g, tramos: g.tramos.filter((_, j) => j !== tramoIndex) };
  });
  return { ...schedule, groups };
}

/**
 * Cambia el modo ajustando los tramos de TODOS los grupos:
 *  - continuo → cada grupo se queda con su primer tramo.
 *  - partido  → los grupos con 1 tramo reciben un segundo por defecto (16-20).
 */
export function setMode(schedule: BusinessSchedule, mode: ScheduleMode): BusinessSchedule {
  if (mode === schedule.mode) return schedule;
  const groups = schedule.groups.map((g) => {
    if (mode === 'continuo') return { ...g, tramos: g.tramos.slice(0, 1) };
    return g.tramos.length >= 2 ? g : { ...g, tramos: [...g.tramos, { inicio: '16:00', fin: '20:00' }] };
  });
  return { mode, groups };
}

function tramoValido(t: ScheduleTramo): boolean {
  // Defensivo: <input type="time"> ya garantiza HH:MM, pero el objeto puede venir
  // de una config guardada a mano. Tramos vacíos o invertidos no generan filas.
  return HHMM.test(t.inicio) && HHMM.test(t.fin) && t.inicio < t.fin;
}

/**
 * Aplana los grupos a tramos por día (payload de PUT /config/horario, espejo de
 * OpeningHour). Día sin grupo = CERRADO = sin filas. Varios tramos en un día
 * (horario partido) = varias filas para ese diaSemana. Orden determinista.
 */
export function scheduleToTramos(schedule: BusinessSchedule | undefined | null): TramoDia[] {
  if (!schedule) return [];
  const out: TramoDia[] = [];
  for (const g of schedule.groups) {
    for (const dia of g.dias) {
      if (!Number.isInteger(dia) || dia < 0 || dia > 6) continue;
      for (const t of g.tramos) {
        if (!tramoValido(t)) continue;
        out.push({ diaSemana: dia, inicio: t.inicio, fin: t.fin });
      }
    }
  }
  out.sort((a, b) => a.diaSemana - b.diaSemana || a.inicio.localeCompare(b.inicio));
  return out;
}
