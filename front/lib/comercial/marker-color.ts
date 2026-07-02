// Resuelve el color del marcador del mapa según el modo elegido (toggle exclusivo, §16.3).
// Modo 'estado': color del ESTADO DE VISITA (comportamiento actual, RF-04/05/07, sin regresión).
// Modo 'gasto': color fijo por categoría ABC (proxy de gasto, §9.3) — independiente del estado.
import type { AbcCategory, EstadoVisitaRef } from './types';

export type ColorMode = 'estado' | 'gasto';

export interface ColorableCustomer {
  estadoVisita?: EstadoVisitaRef | null;
  categoriaAbc?: AbcCategory | null;
}

// Colores fijos por categoría (regla de negocio: A=alto, B=medio, C=bajo). No configurables.
export const ABC_COLORS: Record<AbcCategory, string> = {
  A: '#eab308', // dorado
  B: '#3b82f6', // azul
  C: '#9ca3af', // gris
};
const SIN_ABC_COLOR = '#4b5563';
const SIN_ESTADO_COLOR = '#9ca3af';

export function markerColor(c: ColorableCustomer, modo: ColorMode): string {
  if (modo === 'gasto') return c.categoriaAbc ? ABC_COLORS[c.categoriaAbc] : SIN_ABC_COLOR;
  return c.estadoVisita?.color ?? SIN_ESTADO_COLOR;
}
