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
  trabajador: ['dashboard', 'citas', 'clientes', 'comercial', 'contactos', 'servicios', 'productos', 'fichaje', 'vacaciones', 'ventas', 'pedidos', 'mi-cuenta'],
  // Portal del cliente: SUS citas (/me/bookings) + catálogo (servicios/productos, solo lectura) +
  // Mi Cuenta (perfil personal). Sin dashboard, facturas ni configuración admin.
  cliente: ['citas', 'servicios', 'productos', 'mi-cuenta'],
};

export function moduleAllowedForRole(role: Role, id: ModuleId): boolean {
  const allowed = ROLE_MODULES[role];
  return allowed === '*' ? true : allowed.includes(id);
}

// ---------------------------------------------------------------------------
// Etiqueta legible del rol REAL de membresía del back. El sistema tiene
// EXACTAMENTE 4 roles: ADMIN, MANAGER, EMPLOYEE y CLIENT.
// ---------------------------------------------------------------------------
const MEMBER_ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Administrador',
  MANAGER: 'Manager',
  EMPLOYEE: 'Empleado',
  CLIENT: 'Cliente',
};

/** Etiqueta legible del rol real de membresía. "Usuario" si no mapea. */
export function memberRoleLabel(memberRole: string | null | undefined): string {
  if (!memberRole) return 'Usuario';
  return MEMBER_ROLE_LABEL[memberRole] ?? 'Usuario';
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
// Excepciones: módulos donde el rol SÍ puede actuar a pesar del modo READONLY.
// El cliente es de SOLO LECTURA (ve sus citas/catálogo) pero puede escribir en
// Mi Cuenta (editar su perfil y contraseña).
// La reserva online (crear/cancelar citas) queda fuera de alcance — fase posterior.
const WRITE_EXCEPTIONS: Partial<Record<Role, ModuleId[]>> = {
  cliente: ['mi-cuenta'],
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
  // Sort by href length descending so more-specific paths win (e.g. /cuenta before /cuentas if any).
  const sorted = [...MODULES].sort((a, b) => b.href.length - a.href.length);
  const m = sorted.find((mm) => mm.href !== '/panel' && pathname.startsWith(mm.href));
  return m?.id ?? null;
}

// ---------------------------------------------------------------------------
// Usuario demo por rol (mostrado en el pie del sidebar). Sin BD aún.
// ---------------------------------------------------------------------------
export interface DemoUser {
  /** Nombre completo "Nombre Apellido" (se separa al mostrar en Mi Cuenta). */
  nombre: string;
  rolLabel: string;
  iniciales: string;
  email: string;
  telefono: string;
}

export const DEMO_USERS: Record<Role, DemoUser> = {
  admin: { nombre: 'Administrador', rolLabel: 'Administrador', iniciales: 'AD', email: 'admin@negocio.com', telefono: '+34 600 000 001' },
  trabajador: { nombre: 'Sara Molina', rolLabel: 'Empleada', iniciales: 'SM', email: 'sara@negocio.com', telefono: '+34 600 000 002' },
  cliente: { nombre: 'Lucía Fernández', rolLabel: 'Cliente', iniciales: 'LF', email: 'lucia@mail.com', telefono: '+34 600 112 233' },
};
