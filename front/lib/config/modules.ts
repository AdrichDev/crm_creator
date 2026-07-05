// Catálogo central de módulos activables del SaaS.
// Origen del patrón: ExceliaTrack (nav derivada de config). Dominio: JorjotasBarber.

export type ModuleId =
  | 'dashboard'
  | 'clientes'
  | 'citas'
  | 'servicios'
  | 'empleados'
  | 'fichaje'
  | 'vacaciones'
  | 'productos'
  | 'ventas'
  | 'pedidos'
  | 'facturas'
  | 'marketing'
  | 'estadisticas'
  | 'categorias'
  | 'comercial'
  | 'contactos'
  | 'configuracion'
  | 'mi-cuenta';

export type ModuleCategory = 'core' | 'operativa' | 'personas' | 'retail' | 'marketing';

export interface ModuleDef {
  id: ModuleId;
  /** Clave de terminología para el nombre visible (permite overrides por vertical). */
  termKey: string;
  /** Nombre por defecto. */
  defaultLabel: string;
  description: string;
  category: ModuleCategory;
  icon: string; // nombre de icono lucide-react
  href: string;
  /** No se puede desactivar (siempre presente). */
  mandatory?: boolean;
  /** Módulos recomendados para que funcione bien (aviso, no bloqueo). */
  recommends?: ModuleId[];
  /** Requiere la vista "Trabajador": si está desactivada, el módulo se bloquea. */
  requiresWorkerView?: boolean;
}

export const MODULES: ModuleDef[] = [
  { id: 'dashboard', termKey: 'dashboard', defaultLabel: 'Inicio', description: 'Resumen y KPIs del negocio.', category: 'core', icon: 'LayoutDashboard', href: '/panel', mandatory: true },
  { id: 'clientes', termKey: 'clientes', defaultLabel: 'Clientes', description: 'CRM: fichas, historial y segmentos de clientes.', category: 'core', icon: 'Users', href: '/clientes' },
  { id: 'citas', termKey: 'citas', defaultLabel: 'Citas', description: 'Agenda y reservas con estados.', category: 'operativa', icon: 'CalendarClock', href: '/citas', recommends: ['servicios'] },
  { id: 'servicios', termKey: 'servicios', defaultLabel: 'Servicios', description: 'Catálogo de servicios: duración y precio.', category: 'operativa', icon: 'Scissors', href: '/servicios' },
  { id: 'empleados', termKey: 'empleados', defaultLabel: 'Empleados', description: 'Plantilla, roles y especialidades.', category: 'personas', icon: 'IdCard', href: '/empleados', requiresWorkerView: true },
  { id: 'fichaje', termKey: 'fichaje', defaultLabel: 'Fichaje', description: 'Control de jornada e imputación de horas.', category: 'personas', icon: 'Clock', href: '/fichaje', recommends: ['empleados'], requiresWorkerView: true },
  { id: 'vacaciones', termKey: 'vacaciones', defaultLabel: 'Vacaciones', description: 'Solicitudes y aprobación de ausencias.', category: 'personas', icon: 'Plane', href: '/vacaciones', recommends: ['empleados'], requiresWorkerView: true },
  { id: 'productos', termKey: 'productos', defaultLabel: 'Productos', description: 'Inventario: stock, categorías y proveedores.', category: 'retail', icon: 'Package', href: '/productos' },
  { id: 'ventas', termKey: 'ventas', defaultLabel: 'Ventas / TPV', description: 'Tickets, métodos de pago y caja.', category: 'retail', icon: 'Receipt', href: '/ventas', recommends: ['productos'] },
  { id: 'pedidos', termKey: 'pedidos', defaultLabel: 'Pedidos', description: 'Presupuestos y pedidos comerciales documentales, con vista previa imprimible.', category: 'retail', icon: 'ClipboardList', href: '/pedidos', recommends: ['clientes'] },
  { id: 'facturas', termKey: 'facturas', defaultLabel: 'Facturas', description: 'Facturación y documentos del cliente.', category: 'retail', icon: 'Euro', href: '/facturas', recommends: ['clientes'] },
  { id: 'marketing', termKey: 'marketing', defaultLabel: 'Marketing', description: 'Campañas, fidelización y notificaciones.', category: 'marketing', icon: 'Megaphone', href: '/marketing', recommends: ['clientes'] },
  { id: 'estadisticas', termKey: 'estadisticas', defaultLabel: 'Estadísticas', description: 'Estudios de mercado e informes con IA.', category: 'marketing', icon: 'BarChart3', href: '/estadisticas', recommends: ['clientes'] },
  { id: 'categorias', termKey: 'categorias', defaultLabel: 'Categorías', description: 'Equipos y staff del club deportivo', category: 'personas', icon: 'Trophy', href: '/categorias' },
  { id: 'comercial', termKey: 'comercial', defaultLabel: 'Comercial de campo', description: 'Mapa geolocalizado, visitas, estados y rutas para comerciales de calle.', category: 'operativa', icon: 'MapPinned', href: '/comercial', recommends: ['clientes'] },
  { id: 'contactos', termKey: 'contactos', defaultLabel: 'Contactos', description: 'Agenda de leads y prospectos comerciales con estado de contacto.', category: 'operativa', icon: 'Contact', href: '/contactos', mandatory: true, recommends: ['clientes'] },
  { id: 'configuracion', termKey: 'configuracion', defaultLabel: 'Configuración', description: 'Módulos, branding y terminología.', category: 'core', icon: 'Settings', href: '/configuracion', mandatory: true },
  { id: 'mi-cuenta', termKey: 'mi-cuenta', defaultLabel: 'Mi Cuenta', description: 'Perfil personal y contraseña.', category: 'core', icon: 'UserCircle', href: '/cuenta', mandatory: true },
];

export const MODULE_MAP: Record<ModuleId, ModuleDef> = Object.fromEntries(
  MODULES.map((m) => [m.id, m]),
) as Record<ModuleId, ModuleDef>;

export const CATEGORY_LABEL: Record<ModuleCategory, string> = {
  core: 'Esencial',
  operativa: 'Operativa',
  personas: 'Personas',
  retail: 'Retail / Caja',
  marketing: 'Marketing y Web',
};
