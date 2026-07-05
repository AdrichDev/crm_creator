// Espejo de back/src/lib/fichaje.ts (máquina de estados del fichaje, crm-operaos WU6,
// AC6). Se duplica aquí — no se importa desde back/ — porque front y back son paquetes
// npm independientes sin path compartido; el back sigue siendo la fuente de verdad en
// modo remoto (API). Este módulo cubre el modo DEMO/local (sin backend, localStorage).
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

/** Próximo paso permitido. `null` = la jornada de hoy ya está completa. */
export function nextAllowedStep(modo: WorkdayMode, doneToday: WorkdayStep[]): WorkdayStep | null {
  const seq = SEQUENCE[modo];
  if (doneToday.length >= seq.length) return null;
  return seq[doneToday.length];
}

export function isJornadaCompleta(modo: WorkdayMode, doneToday: WorkdayStep[]): boolean {
  return doneToday.length >= SEQUENCE[modo].length;
}

// ---------------------------------------------------------------------------
// Persistencia local (modo DEMO/generador, sin backend): un registro por día.
// ---------------------------------------------------------------------------
export interface FichajeHoyLocal { fecha: string; modo: WorkdayMode; pasos: WorkdayStep[] }

const KEY_HOY = 'saas.fichaje-hoy.v1';
const KEY_MODO_PREF = 'saas.fichaje-modo.v1';
const todayStr = () => new Date().toISOString().slice(0, 10);

/** Lee el estado local de hoy; si es de otro día (jornada de ayer sin completar), se descarta. */
export function readLocalHoy(): FichajeHoyLocal | null {
  try {
    const raw = localStorage.getItem(KEY_HOY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FichajeHoyLocal;
    return parsed.fecha === todayStr() ? parsed : null;
  } catch { return null; }
}

export function writeLocalHoy(state: FichajeHoyLocal): void {
  try { localStorage.setItem(KEY_HOY, JSON.stringify(state)); } catch { /* noop */ }
}

/** Modo preferido recordado entre sesiones (selector radio). */
export function readModoPref(): WorkdayMode {
  try { return (localStorage.getItem(KEY_MODO_PREF) as WorkdayMode) || 'intensiva'; } catch { return 'intensiva'; }
}
export function writeModoPref(modo: WorkdayMode): void {
  try { localStorage.setItem(KEY_MODO_PREF, modo); } catch { /* noop */ }
}
