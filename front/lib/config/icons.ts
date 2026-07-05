// Emojis del menú por módulo, con variantes según el sector (vertical).
// Sustituyen a los iconos SVG para que cada negocio "hable" su sector.
import type { ModuleId } from './modules';
import type { VerticalId } from './verticals';

// Emoji por defecto de cada módulo (si el vertical no lo sobrescribe).
const DEFAULT_EMOJI: Record<ModuleId, string> = {
  dashboard: '📊',
  clientes: '👥',
  citas: '📅',
  servicios: '✂️',
  empleados: '🧑‍💼',
  fichaje: '🕒',
  vacaciones: '🏖️',
  productos: '📦',
  ventas: '🧾',
  pedidos: '📋',
  facturas: '💶',
  marketing: '📣',
  estadisticas: '📈',
  'estudios-mercado': '🔎',
  categorias: '🏟️',
  comercial: '🗺️',
  contactos: '📇',
  configuracion: '⚙️',
  'mi-cuenta': '👤',
};

// Sobrescrituras por sector: solo los módulos cuyo emoji cambia de significado.
const BY_VERTICAL: Partial<Record<VerticalId, Partial<Record<ModuleId, string>>>> = {
  peluqueria: { servicios: '✂️', empleados: '💈', clientes: '🧔' },
  estetica: { servicios: '💅', empleados: '💆', productos: '🧴' },
  clinica: { servicios: '🩺', empleados: '🧑‍⚕️', productos: '💊', clientes: '🧑‍🦽', citas: '📅' },
  taller: { servicios: '🔧', empleados: '🧑‍🔧', productos: '🔩', citas: '🛠️', clientes: '🚗' },
  abogados: { servicios: '⚖️', empleados: '🧑‍⚖️', citas: '📑', clientes: '📂' },
  fitness: { servicios: '🏋️', empleados: '🧑‍🏫', citas: '🤸', clientes: '🏃' },
  escalada: { servicios: '🧗', empleados: '🧗‍♂️', citas: '🎟️' },
  veterinario: { servicios: '🐾', empleados: '🧑‍⚕️', productos: '💊', clientes: '🐶' },
  hosteleria: { servicios: '🍽️', empleados: '🧑‍🍳', productos: '🍷', citas: '🪑', ventas: '🧾' },
  'centro-deportivo': {
    clientes: '🏅',
    empleados: '👨‍🏫',
    citas: '🏃',
    servicios: '🎫',
    fichaje: '🕐',
    vacaciones: '🌴',
    productos: '⚽',
    ventas: '💰',
    facturas: '🧾',
    marketing: '📢',
    estadisticas: '📊',
    categorias: '🏟️',
  },
};

export function moduleEmoji(vertical: VerticalId, moduleId: ModuleId): string {
  return BY_VERTICAL[vertical]?.[moduleId] ?? DEFAULT_EMOJI[moduleId] ?? '•';
}

/**
 * Emoji final del módulo: el override elegido por el negocio manda; si no hay,
 * cae al emoji por sector / por defecto. `overrides` = config.moduleEmojis.
 */
export function resolveModuleEmoji(
  vertical: VerticalId,
  moduleId: ModuleId,
  overrides?: Partial<Record<ModuleId, string>>,
): string {
  const o = overrides?.[moduleId];
  return o && o.trim() ? o : moduleEmoji(vertical, moduleId);
}
