'use client';
// Fichaje self-service con máquina de estados (crm-operaos WU6, AC6). Endpoints DEDICADOS
// (/fichaje/hoy, /fichaje), distintos del CRUD legacy `/fichajes` que sigue usando
// useCollection para el histórico de staff.
import { apiFetch } from './client';

export type WorkdayMode = 'intensiva' | 'partida';
export type WorkdayStep = 'entrada' | 'salida_comida' | 'entrada_comida' | 'salida_final';

export interface FichajeEvento {
  id: string;
  paso: WorkdayStep;
  modo: WorkdayMode;
  creadoEn: string;
}

export interface FichajeHoy {
  modo: WorkdayMode | null;
  eventos: FichajeEvento[];
  siguientePaso: WorkdayStep | null;
  jornadaCompleta: boolean;
}

export function getFichajeHoy(): Promise<FichajeHoy> {
  return apiFetch<FichajeHoy>('/fichaje/hoy');
}

export function ficharPaso(modo: WorkdayMode): Promise<FichajeEvento> {
  return apiFetch<FichajeEvento>('/fichaje', { method: 'POST', body: JSON.stringify({ modo }) });
}
