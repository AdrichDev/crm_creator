// Catálogo de widgets del inicio (rol admin/trabajador). Mismo patrón que
// lib/config/worker-chips.ts: catálogo + selección activada por el admin,
// con un módulo dependiente opcional que oculta el widget si está apagado.
import type { ModuleId } from './modules';
import { MODULE_MAP } from './modules';
import type { VerticalId } from './verticals';
import { VERTICAL_MAP } from './verticals';

export type WidgetId =
  | 'agenda'
  | 'kpis-hoy'
  | 'proximos-eventos'
  | 'categorias'
  | 'clientes-nuevos'
  | 'contactos-nuevos'
  | 'visitas-comercial'
  | 'ventas-hoy'
  | 'facturacion-pendiente'
  | 'vacaciones-pendientes'
  | 'ocupacion-semana';

export type WidgetSize = 'sm' | 'md' | 'lg' | 'xl';

export interface WidgetDef {
  id: WidgetId;
  label: string;
  description: string;
  icon: string; // nombre de icono lucide-react
  size: WidgetSize;
  /** Si está presente, el widget solo está disponible cuando este módulo está activo. */
  dependsOn?: ModuleId;
}

export const MAX_DASHBOARD_WIDGETS = 6;

export const DASHBOARD_WIDGETS: WidgetDef[] = [
  // Agenda es 'xl': misma gramática que /citas full-screen (calendario grande +
  // panel lateral con las citas del día), no la versión mini de antes.
  { id: 'agenda', label: 'Agenda', description: 'Calendario mes/semana/día con tus próximas citas.', icon: 'CalendarRange', size: 'xl', dependsOn: 'citas' },
  { id: 'kpis-hoy', label: 'Resumen de hoy', description: 'Totales, confirmadas y pendientes de hoy.', icon: 'Gauge', size: 'md', dependsOn: 'citas' },
  { id: 'proximos-eventos', label: 'Próximos eventos', description: 'Las próximas citas ordenadas por fecha y hora.', icon: 'ListOrdered', size: 'md', dependsOn: 'citas' },
  { id: 'categorias', label: 'Categorías', description: 'Equipos del club y su nº de miembros.', icon: 'Trophy', size: 'md', dependsOn: 'categorias' },
  { id: 'clientes-nuevos', label: 'Clientes nuevos', description: 'Últimas altas de clientes o socios.', icon: 'UserPlus', size: 'sm', dependsOn: 'clientes' },
  { id: 'contactos-nuevos', label: 'Contactos nuevos', description: 'Últimos leads y prospectos de la agenda de contactos.', icon: 'Contact', size: 'sm', dependsOn: 'contactos' },
  { id: 'visitas-comercial', label: 'Seguimiento comercial', description: 'Recordatorios y próximas visitas de la cartera comercial.', icon: 'MapPinned', size: 'md', dependsOn: 'comercial' },
  { id: 'ventas-hoy', label: 'Ventas de hoy', description: 'Total vendido hoy en caja/TPV.', icon: 'Receipt', size: 'sm', dependsOn: 'ventas' },
  { id: 'facturacion-pendiente', label: 'Facturación pendiente', description: 'Facturas emitidas aún sin cobrar.', icon: 'Euro', size: 'sm', dependsOn: 'facturas' },
  { id: 'vacaciones-pendientes', label: 'Ausencias pendientes', description: 'Solicitudes de vacaciones a la espera de aprobación.', icon: 'Plane', size: 'sm', dependsOn: 'vacaciones' },
  { id: 'ocupacion-semana', label: 'Ocupación de la semana', description: 'Citas por día de la semana en curso.', icon: 'BarChart3', size: 'md', dependsOn: 'citas' },
];

export const DASHBOARD_WIDGET_MAP: Record<WidgetId, WidgetDef> = Object.fromEntries(
  DASHBOARD_WIDGETS.map((w) => [w.id, w]),
) as Record<WidgetId, WidgetDef>;

/** Lista vacía por defecto (negocio sin widgets elegidos aún). */
export function emptyDashboardWidgets(): WidgetId[] {
  return [];
}

/**
 * ¿El widget está disponible? Está en la selección Y, si depende de un módulo,
 * ese módulo está activo. Igual semántica que workerChipAvailable.
 */
export function dashboardWidgetAvailable(
  widget: WidgetDef,
  selected: WidgetId[],
  modules: Record<ModuleId, boolean>,
): boolean {
  if (!selected.includes(widget.id)) return false;
  if (widget.dependsOn && !modules[widget.dependsOn]) return false;
  return true;
}

/** Widgets activos y disponibles, en el orden del catálogo — los que se renderizan en /panel. */
export function activeDashboardWidgets(
  selected: WidgetId[],
  modules: Record<ModuleId, boolean>,
): WidgetDef[] {
  const capped = selected.slice(0, MAX_DASHBOARD_WIDGETS);
  return DASHBOARD_WIDGETS.filter((w) => dashboardWidgetAvailable(w, capped, modules));
}

/**
 * Widgets que son variantes de la MISMA información (citas/agenda). En la
 * selección por defecto nunca deben apilarse: sin este grupo, un vertical cuyo
 * catálogo disponible fuera casi todo de citas (ej. `comerciales`) recibía 4
 * widgets de agenda repetidos como relleno.
 */
export const AGENDA_GROUP: ReadonlySet<WidgetId> = new Set<WidgetId>([
  'agenda', 'kpis-hoy', 'proximos-eventos', 'ocupacion-semana',
]);
export const MAX_AGENDA_GROUP_DEFAULTS = 2;

/**
 * Default de fábrica por vertical: Agenda primero, y hasta completar 3
 * preferentes según disponibilidad — `categorias` (si el vertical la tiene,
 * ej. centro-deportivo) y `proximos-eventos` van ANTES que `kpis-hoy`, porque
 * ese resumen numérico ya queda cubierto por el propio calendario y por la
 * lista de equipos (evita duplicar la misma información en dos widgets).
 * Para completar hasta 6 se añaden los widgets del catálogo cuyo módulo
 * dependiente esté en defaultModules de ese vertical (o sea obligatorio, ej.
 * `contactos` — siempre activo). Un vertical sin `citas` (ej. `custom`) no
 * recibe ninguno de los preferentes — se exige el módulo activo.
 * Regla anti-repetición: como máximo MAX_AGENDA_GROUP_DEFAULTS widgets del
 * grupo agenda (agenda/kpis-hoy/proximos-eventos/ocupacion-semana); el resto
 * se completa con variedad real (clientes, contactos, comercial, retail…).
 */
export function defaultDashboardWidgets(verticalId: VerticalId): WidgetId[] {
  const vertical = VERTICAL_MAP[verticalId];
  const tieneCategorias = vertical.defaultModules.includes('categorias');
  const disponibles = (id: WidgetId) => {
    // 'kpis-hoy' es redundante si ya hay 'categorias' (calendario + equipos cubren lo mismo).
    if (id === 'kpis-hoy' && tieneCategorias) return false;
    const def = DASHBOARD_WIDGET_MAP[id];
    if (!def.dependsOn) return true;
    // Los módulos obligatorios (contactos, dashboard…) están activos en todo
    // tenant aunque el vertical no los liste en defaultModules.
    return vertical.defaultModules.includes(def.dependsOn) || !!MODULE_MAP[def.dependsOn]?.mandatory;
  };

  const preferentesCandidatos: WidgetId[] = ['agenda', 'categorias', 'proximos-eventos', 'kpis-hoy'];
  const preferentes = preferentesCandidatos.filter(disponibles).slice(0, 3);
  const relleno = DASHBOARD_WIDGETS
    .filter((w) => !preferentes.includes(w.id))
    .filter((w) => disponibles(w.id))
    .map((w) => w.id);

  const seleccion: WidgetId[] = [];
  let agendaCount = 0;
  for (const id of [...preferentes, ...relleno]) {
    if (AGENDA_GROUP.has(id)) {
      if (agendaCount >= MAX_AGENDA_GROUP_DEFAULTS) continue;
      agendaCount++;
    }
    seleccion.push(id);
    if (seleccion.length >= MAX_DASHBOARD_WIDGETS) break;
  }
  return seleccion;
}
