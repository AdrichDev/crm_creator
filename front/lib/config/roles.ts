// Perfiles de acceso del panel (vista "iniciar sesión como").
// Los tres perfiles comparten EXACTAMENTE el mismo panel; lo único que cambia
// es qué módulos ve cada uno en el sidebar y si puede crear/editar/eliminar.
import { MODULES, type ModuleId } from './modules';

export type Role = 'admin' | 'trabajador' | 'cliente';

export interface RoleDef {
  id: Role;
  label: string;
  /** Nombre de icono lucide-react. */
  icon: string;
}

export const ROLES: RoleDef[] = [
  { id: 'admin', label: 'Administrador', icon: 'ShieldCheck' },
  { id: 'trabajador', label: 'Trabajador', icon: 'Briefcase' },
  { id: 'cliente', label: 'Cliente', icon: 'User' },
];

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrador',
  trabajador: 'Trabajador',
  cliente: 'Cliente',
};

// ---------------------------------------------------------------------------
// Visibilidad de módulos por rol. Se intersecta con los módulos activos del
// negocio (config.modules). '*' = todos los módulos activos.
// ---------------------------------------------------------------------------
const ROLE_MODULES: Record<Role, ModuleId[] | '*'> = {
  admin: '*',
  trabajador: ['dashboard', 'citas', 'clientes', 'servicios', 'productos', 'fichaje', 'vacaciones', 'ventas'],
  // El cliente entra a Configuración, pero solo para el switch del tenant + Marca/Negocio.
  cliente: ['dashboard', 'citas', 'servicios', 'productos', 'facturas', 'configuracion'],
};

export function moduleAllowedForRole(role: Role, id: ModuleId): boolean {
  const allowed = ROLE_MODULES[role];
  return allowed === '*' ? true : allowed.includes(id);
}

// ---------------------------------------------------------------------------
// Capacidad de escritura (crear / editar / eliminar) por rol y módulo.
// ---------------------------------------------------------------------------
// Módulos en los que el rol es SOLO LECTURA. null = escribe en todo; '*' = lee todo.
const READONLY_FOR: Record<Role, ModuleId[] | '*' | null> = {
  admin: null,
  trabajador: ['servicios', 'productos', 'empleados', 'marketing', 'configuracion'],
  cliente: '*',
};
// Excepciones: módulos donde el rol SÍ puede actuar (p. ej. el cliente reserva citas
// y puede guardar marca/negocio + el switch del tenant en Configuración).
const WRITE_EXCEPTIONS: Partial<Record<Role, ModuleId[]>> = {
  cliente: ['citas', 'configuracion'],
};

export function canWrite(role: Role, id: ModuleId): boolean {
  if (role === 'admin') return true;
  if ((WRITE_EXCEPTIONS[role] ?? []).includes(id)) return true;
  const ro = READONLY_FOR[role];
  if (ro === null) return true;
  if (ro === '*') return false;
  return !ro.includes(id);
}

/** Aprobaciones / acciones de gestión (p. ej. aprobar vacaciones) reservadas a admin. */
export function canManage(role: Role): boolean {
  return role === 'admin';
}

// ---------------------------------------------------------------------------
// Inferir el módulo a partir de la ruta actual (para gating centralizado
// en PageHeader / RowActions sin tocar cada página).
// ---------------------------------------------------------------------------
export function moduleFromPath(pathname: string): ModuleId | null {
  if (!pathname) return null;
  if (pathname === '/panel') return 'dashboard';
  const m = MODULES.find((mm) => mm.href !== '/panel' && pathname.startsWith(mm.href));
  return m?.id ?? null;
}

// ---------------------------------------------------------------------------
// Usuario demo por rol (mostrado en el pie del sidebar). Sin BD aún.
// ---------------------------------------------------------------------------
export interface DemoUser {
  nombre: string;
  rolLabel: string;
  iniciales: string;
  email: string;
}

export const DEMO_USERS: Record<Role, DemoUser> = {
  admin: { nombre: 'Administrador', rolLabel: 'Administrador', iniciales: 'AD', email: 'admin@negocio.com' },
  trabajador: { nombre: 'Sara Molina', rolLabel: 'Empleada', iniciales: 'SM', email: 'sara@negocio.com' },
  cliente: { nombre: 'Lucía Fernández', rolLabel: 'Cliente', iniciales: 'LF', email: 'lucia@mail.com' },
};
