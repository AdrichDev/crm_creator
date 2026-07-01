// Cálculo puro de celdas de calendario (mes/semana/día). Semana empieza en
// lunes (convención es-ES ya usada en DOW/DOW_FULL). Sin librería externa.
import { dateStr } from './format';

export interface CalCell {
  d: number;
  date: string; // 'YYYY-MM-DD'
}

/** Lunes=0 ... Domingo=6 (a diferencia de Date#getDay, que usa domingo=0). */
export function isoWeekday(date: Date): number {
  return (date.getDay() + 6) % 7;
}

/**
 * Próxima fecha (incluyendo hoy) cuyo día de semana ISO (0=lunes..6=domingo)
 * sea `weekday`, a las `hh:mm` indicadas. Usado por los formularios de
 * "entrenamiento"/"clase" (día de semana + hora → fecha/hora concretas de un
 * único Booking; NO es un motor de recurrencia, ver design.md Out of Scope).
 */
export function nextWeekdayAt(weekday: number, hhmm: string, from: Date = new Date()): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const result = new Date(from);
  const diff = (weekday - isoWeekday(from) + 7) % 7;
  result.setDate(from.getDate() + diff);
  result.setHours(h ?? 0, m ?? 0, 0, 0);
  // Si "hoy" es el día pero la hora ya pasó, salta a la semana siguiente.
  if (diff === 0 && result.getTime() < from.getTime()) result.setDate(result.getDate() + 7);
  return result;
}

/** Celdas de un mes, con `null` para los huecos antes del día 1 (alineación lunes). */
export function buildMonthCells(year: number, month: number): (CalCell | null)[] {
  const firstWeekday = isoWeekday(new Date(year, month, 1));
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (CalCell | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push({ d, date: dateStr(year, month, d) });
  return cells;
}

/** Las 7 celdas (lunes a domingo) de la semana que contiene `date`. */
export function buildWeekCells(date: Date): CalCell[] {
  const monday = new Date(date);
  monday.setDate(date.getDate() - isoWeekday(date));

  const cells: CalCell[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    cells.push({ d: d.getDate(), date: dateStr(d.getFullYear(), d.getMonth(), d.getDate()) });
  }
  return cells;
}

/** La celda de un único día. */
export function buildDayCell(date: Date): CalCell {
  return { d: date.getDate(), date: dateStr(date.getFullYear(), date.getMonth(), date.getDate()) };
}
