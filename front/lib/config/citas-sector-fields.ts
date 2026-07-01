// Forma del módulo Citas según el vertical. Un vertical SIN entrada aquí usa
// el formulario/columnas genéricos actuales (front/app/(crm)/citas/page.tsx),
// sin ningún cambio de comportamiento. Solo 3 verticales representativos
// tienen modal propio; el resto no lo necesita — ya es correcto tal cual.
// Ver openspec/changes/crm-citas-por-sector/design.md para la matriz completa.
import type { VerticalId } from './verticals';

export type CitasFormComponent = 'entrenamiento' | 'clase' | 'reunion';

export interface SectorFieldsDef {
  /** Cabecera de la tabla — sustituye a la fija genérica para este vertical. */
  columns: string[];
  /** Qué modal custom abre "Nueva". */
  formComponent: CitasFormComponent;
}

export const CITAS_SECTOR_FIELDS: Partial<Record<VerticalId, SectorFieldsDef>> = {
  'centro-deportivo': {
    columns: ['Equipo', 'Campo', 'Día', 'Hora', 'Entrenador', 'Estado'],
    formComponent: 'entrenamiento',
  },
  fitness: {
    columns: ['Clase', 'Instructor', 'Sala', 'Día', 'Hora', 'Aforo', 'Estado'],
    formComponent: 'clase',
  },
  comerciales: {
    columns: ['Cuenta', 'Comercial', 'Canal', 'Fecha', 'Hora', 'Estado'],
    formComponent: 'reunion',
  },
};

/** Columnas genéricas actuales — usadas cuando el vertical no tiene entrada. */
export const CITAS_DEFAULT_COLUMNS = ['Cliente', 'Servicio', 'Profesional', 'Fecha', 'Hora', 'Estado', ''];
