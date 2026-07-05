// crm-operaos WU6: máquina de estados del fichaje por jornada (AC6). Puro, sin I/O —
// determina qué paso es válido a continuación según el modo elegido y los pasos ya
// registrados HOY. No permite saltos ni repetir un paso; bloquea fichajes extra una
// vez que la jornada del día ya está completa.

export type WorkdayMode = 'intensiva' | 'partida';
export type WorkdayStep = 'entrada' | 'salida_comida' | 'entrada_comida' | 'salida_final';

const SEQUENCE: Record<WorkdayMode, WorkdayStep[]> = {
  intensiva: ['entrada', 'salida_final'],
  partida: ['entrada', 'salida_comida', 'entrada_comida', 'salida_final'],
};

export const STEP_LABEL: Record<WorkdayStep, string> = {
  entrada: 'Entrada',
  salida_comida: 'Salida a comer',
  entrada_comida: 'Vuelta de comer',
  salida_final: 'Salida',
};

export const MODE_LABEL: Record<WorkdayMode, string> = {
  intensiva: 'Jornada intensiva',
  partida: 'Jornada partida',
};

/** Secuencia completa de pasos exigida por el modo, en orden. */
export function sequenceFor(modo: WorkdayMode): WorkdayStep[] {
  return SEQUENCE[modo];
}

/**
 * Próximo paso permitido dado el modo y los pasos ya fichados HOY (en el orden en que
 * se ficharon). `null` = la jornada de hoy ya está completa: no se admite otro fichaje.
 * Lanza si `doneToday` no es un prefijo válido de la secuencia del modo (dato corrupto:
 * p.ej. pasos de otro modo, repetidos o fuera de orden que se colaron sin pasar por
 * `isValidStep`).
 */
export function nextAllowedStep(modo: WorkdayMode, doneToday: WorkdayStep[]): WorkdayStep | null {
  const seq = SEQUENCE[modo];
  for (let i = 0; i < doneToday.length; i += 1) {
    if (doneToday[i] !== seq[i]) {
      throw new Error(`Secuencia de fichaje inválida para modo "${modo}": ${doneToday.join(' → ')}`);
    }
  }
  if (doneToday.length >= seq.length) return null;
  return seq[doneToday.length];
}

/** true si `paso` es exactamente el siguiente permitido (bloquea saltos y repetidos). */
export function isValidStep(modo: WorkdayMode, doneToday: WorkdayStep[], paso: WorkdayStep): boolean {
  try {
    return nextAllowedStep(modo, doneToday) === paso;
  } catch {
    return false;
  }
}

/** true si la jornada de hoy ya completó todos los pasos del modo. */
export function isJornadaCompleta(modo: WorkdayMode, doneToday: WorkdayStep[]): boolean {
  return doneToday.length >= SEQUENCE[modo].length;
}
