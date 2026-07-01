// Posiciones por deporte y roles de staff para el módulo Categorías (centro-deportivo).
// null = campo de texto libre (no hay posiciones predefinidas para ese deporte).

export type DeporteType =
  | 'FUTBOL_11'
  | 'FUTBOL_7'
  | 'FUTBOL_SALA'
  | 'BALONCESTO'
  | 'NATACION'
  | 'HALTEROFILIA'
  | 'OTRO';

export const SPORT_POSITIONS: Record<DeporteType, string[] | null> = {
  FUTBOL_11: [
    'Portero',
    'Defensa central',
    'Lateral derecho',
    'Lateral izquierdo',
    'Mediocentro',
    'Mediapunta',
    'Extremo derecho',
    'Extremo izquierdo',
    'Delantero centro',
    'Segundo delantero',
  ],
  FUTBOL_7: ['Portero', 'Defensa', 'Centrocampista', 'Extremo', 'Delantero'],
  FUTBOL_SALA: ['Portero', 'Cierre', 'Ala derecho', 'Ala izquierdo', 'Pívot'],
  BALONCESTO: ['Base', 'Escolta', 'Alero', 'Ala-pívot', 'Pívot'],
  NATACION: null,
  HALTEROFILIA: null,
  OTRO: null,
};

export const STAFF_ROLES: string[] = [
  'Entrenador principal',
  'Segundo entrenador',
  'Entrenador de porteros',
  'Preparador físico',
  'Fisioterapeuta',
  'Delegado de campo',
];

export const DEPORTE_LABELS: Record<DeporteType, string> = {
  FUTBOL_11: 'Fútbol 11',
  FUTBOL_7: 'Fútbol 7',
  FUTBOL_SALA: 'Fútbol sala',
  BALONCESTO: 'Baloncesto',
  NATACION: 'Natación',
  HALTEROFILIA: 'Halterofilia',
  OTRO: 'Otro',
};

// ---------------------------------------------------------------------------
// Grupo de posición → color de borde de la tarjeta (jugadores) / staff técnico.
// ---------------------------------------------------------------------------

export type PositionGroup = 'PORTERO' | 'DEFENSA' | 'MEDIO' | 'DELANTERO';

export const POSITION_GROUP_COLORS: Record<PositionGroup, string> = {
  PORTERO: '#eab308', // amarillo, convención clásica de portero
  DEFENSA: '#3b82f6', // azul
  MEDIO: '#22c55e', // verde
  DELANTERO: '#ef4444', // rojo
};

export const STAFF_BORDER_COLOR = '#a855f7'; // morado, cuerpo técnico (mismo color para todos)

// Clasificación por palabra clave (no por deporte): si la posición CONTIENE
// alguna de estas palabras, cae en ese grupo. Primer match gana, en este orden.
const POSITION_GROUP_KEYWORDS: [PositionGroup, string[]][] = [
  ['PORTERO', ['portero']],
  ['DEFENSA', ['defensa', 'lateral']],
  ['MEDIO', ['centrocampista', 'mediocentro', 'mediapunta']],
  ['DELANTERO', ['delantero', 'extremo']],
];

function positionGroup(posicion: string): PositionGroup | null {
  const texto = posicion.toLowerCase();
  for (const [group, keywords] of POSITION_GROUP_KEYWORDS) {
    if (keywords.some((k) => texto.includes(k))) return group;
  }
  return null;
}

/** Color de borde para un miembro: staff → morado fijo; jugador → según palabra clave de su posición (gris si no clasifica). */
export function memberBorderColor(isStaff: boolean, posicion?: string | null): string {
  if (isStaff) return STAFF_BORDER_COLOR;
  const group = posicion ? positionGroup(posicion) : null;
  return group ? POSITION_GROUP_COLORS[group] : '#6b7280'; // gris: sin posición clasificable
}
