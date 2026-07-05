/**
 * shared/generate/tenant-types.ts
 *
 * Canonical type definitions and data constants for CRM tenant generation.
 * Zero React / Next.js / browser API dependencies.
 * Imported by both front/lib/generate/ and back/src/lib/.
 */

// ---------------------------------------------------------------------------
// Primitive type aliases
// ---------------------------------------------------------------------------

export type TermKey = string;
export type Terminology = Record<TermKey, string>;

// ---------------------------------------------------------------------------
// ModuleId — mirrors front/lib/config/modules.ts
// ---------------------------------------------------------------------------

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
  termKey: string;
  defaultLabel: string;
  description: string;
  category: ModuleCategory;
  icon: string;
  href: string;
  mandatory?: boolean;
  recommends?: ModuleId[];
  requiresWorkerView?: boolean;
}

// ---------------------------------------------------------------------------
// WorkerChipId — mirrors front/lib/config/worker-chips.ts
// ---------------------------------------------------------------------------

export type WorkerChipId =
  | 'fichaje-rapido'
  | 'proxima-cita'
  | 'mis-ventas-hoy'
  | 'disponibilidad'
  | 'pedir-ausencia'
  | 'tareas-turno';

// ---------------------------------------------------------------------------
// VerticalId — mirrors front/lib/config/verticals.ts
// ---------------------------------------------------------------------------

export type VerticalId =
  | 'peluqueria'
  | 'estetica'
  | 'hosteleria'
  | 'fitness'
  | 'escalada'
  | 'clinica'
  | 'taller'
  | 'veterinario'
  | 'abogados'
  | 'centro-deportivo'
  | 'comerciales'
  | 'custom';

// ---------------------------------------------------------------------------
// DesignTokens, BusinessViews, Favorite — mirrors front/lib/config/tenant-config.ts
// ---------------------------------------------------------------------------

export interface DesignTokens {
  palette?: {
    primary?: string;
    secondary?: string;
    background?: string;
    text?: string;
    accent?: string;
  };
  typography?: { heading?: string; body?: string };
  shape?: { radius?: string; shadow?: string };
}

export interface BusinessViews {
  worker: boolean;
  client: boolean;
}

export interface Favorite {
  id: string;
  target: ModuleId;
  label?: string;
  options: string[];
}

// ---------------------------------------------------------------------------
// TenantConfig — mirrors front/lib/config/tenant-config.ts
// ---------------------------------------------------------------------------

export interface TenantConfig {
  business: {
    name: string;
    vertical: VerticalId;
    phone?: string;
    email?: string;
    address?: string;
    /** Vínculo crm_project.id_cliente en agents-agency. */
    clienteId?: string;
  };
  modules: Record<ModuleId, boolean>;
  views?: BusinessViews;
  workerChips: Record<WorkerChipId, boolean>;
  moduleEmojis?: Partial<Record<ModuleId, string>>;
  terminology: Terminology;
  branding: {
    primary: string;
    secondary: string;
    logoText: string;
    logoImage?: string;
    designSource?: string;
    tokens?: DesignTokens;
  };
  database?: {
    host?: string;
    port?: string;
    name?: string;
    user?: string;
    password?: string;
    url?: string;
  };
  landing?: {
    enabled: boolean;
    source: string;
    entry: string;
    assetsRef: string;
    uploadedAt: string;
    sha256?: string;
  };
  favorites?: Favorite[];
  tenantEnabled?: boolean;
  setupComplete: boolean;
}

// ---------------------------------------------------------------------------
// DB schema types — mirrors front/lib/generate/schemas.ts
// ---------------------------------------------------------------------------

export interface Col {
  name: string;
  sql: string;
  prisma: string;
}

export interface GenTable {
  table: string;
  model: string;
  cols: Col[];
}

// ---------------------------------------------------------------------------
// MODULES data — mirrors front/lib/config/modules.ts
// ---------------------------------------------------------------------------

export const MODULES: ModuleDef[] = [
  { id: 'dashboard',     termKey: 'dashboard',     defaultLabel: 'Inicio',         description: 'Resumen y KPIs del negocio.',                    category: 'core',      icon: 'LayoutDashboard', href: '/panel',         mandatory: true },
  { id: 'clientes',      termKey: 'clientes',      defaultLabel: 'Clientes',       description: 'CRM: fichas, historial y segmentos de clientes.',  category: 'core',      icon: 'Users',           href: '/clientes' },
  { id: 'citas',         termKey: 'citas',         defaultLabel: 'Citas',          description: 'Agenda y reservas con estados.',                   category: 'operativa', icon: 'CalendarClock',   href: '/citas',         recommends: ['servicios'] },
  { id: 'servicios',     termKey: 'servicios',     defaultLabel: 'Servicios',      description: 'Catálogo de servicios: duración y precio.',        category: 'operativa', icon: 'Scissors',        href: '/servicios' },
  { id: 'empleados',     termKey: 'empleados',     defaultLabel: 'Empleados',      description: 'Plantilla, roles y especialidades.',               category: 'personas',  icon: 'IdCard',          href: '/empleados',     requiresWorkerView: true },
  { id: 'fichaje',       termKey: 'fichaje',       defaultLabel: 'Fichaje',        description: 'Control de jornada e imputación de horas.',        category: 'personas',  icon: 'Clock',           href: '/fichaje',       recommends: ['empleados'], requiresWorkerView: true },
  { id: 'vacaciones',    termKey: 'vacaciones',    defaultLabel: 'Vacaciones',     description: 'Solicitudes y aprobación de ausencias.',           category: 'personas',  icon: 'Plane',           href: '/vacaciones',    recommends: ['empleados'], requiresWorkerView: true },
  { id: 'productos',     termKey: 'productos',     defaultLabel: 'Productos',      description: 'Inventario: stock, categorías y proveedores.',     category: 'retail',    icon: 'Package',         href: '/productos' },
  { id: 'ventas',        termKey: 'ventas',        defaultLabel: 'Ventas / TPV',   description: 'Tickets, métodos de pago y caja.',                 category: 'retail',    icon: 'Receipt',         href: '/ventas',        recommends: ['productos'] },
  { id: 'facturas',      termKey: 'facturas',      defaultLabel: 'Facturas',       description: 'Facturación y documentos del cliente.',            category: 'retail',    icon: 'Euro',            href: '/facturas',      recommends: ['clientes'] },
  { id: 'marketing',     termKey: 'marketing',     defaultLabel: 'Marketing',      description: 'Campañas, fidelización y notificaciones.',         category: 'marketing', icon: 'Megaphone',       href: '/marketing',     recommends: ['clientes'] },
  { id: 'estadisticas',  termKey: 'estadisticas',  defaultLabel: 'Estadísticas',   description: 'Estudios de mercado e informes con IA.',           category: 'marketing', icon: 'BarChart3',       href: '/estadisticas',  recommends: ['clientes'] },
  { id: 'categorias',    termKey: 'categorias',    defaultLabel: 'Categorías',     description: 'Equipos y staff del club deportivo',               category: 'personas',  icon: 'Trophy',          href: '/categorias' },
  { id: 'comercial',     termKey: 'comercial',     defaultLabel: 'Comercial de campo', description: 'Mapa geolocalizado, visitas, estados y rutas para comerciales de calle.', category: 'operativa', icon: 'MapPinned',   href: '/comercial',     recommends: ['clientes'] },
  { id: 'contactos',     termKey: 'contactos',     defaultLabel: 'Contactos',      description: 'Agenda de leads y prospectos comerciales con estado de contacto.', category: 'operativa', icon: 'Contact',         href: '/contactos',     mandatory: true, recommends: ['clientes'] },
  { id: 'configuracion', termKey: 'configuracion', defaultLabel: 'Configuración',  description: 'Módulos, branding y terminología.',               category: 'core',      icon: 'Settings',        href: '/configuracion', mandatory: true },
  { id: 'mi-cuenta',     termKey: 'mi-cuenta',     defaultLabel: 'Mi Cuenta',      description: 'Perfil personal y contraseña.',                   category: 'core',      icon: 'UserCircle',      href: '/cuenta',        mandatory: true },
];

// ---------------------------------------------------------------------------
// MODULE_TABLES — mirrors front/lib/generate/schemas.ts
// ---------------------------------------------------------------------------

export const MODULE_TABLES: Partial<Record<ModuleId, GenTable[]>> = {
  clientes: [{ table: 'clientes', model: 'Cliente', cols: [
    { name: 'nombre',       sql: 'text not null',                       prisma: 'nombre String' },
    { name: 'email',        sql: 'text',                                prisma: 'email String?' },
    { name: 'telefono',     sql: 'text',                                prisma: 'telefono String?' },
    { name: 'segmento',     sql: "text default 'Nuevo'",               prisma: 'segmento String @default("Nuevo")' },
    { name: 'visitas',      sql: 'integer not null default 0',          prisma: 'visitas Int @default(0)' },
    { name: 'gasto_total',  sql: 'numeric(12,2) not null default 0',   prisma: 'gastoTotal Decimal @default(0) @map("gasto_total")' },
    { name: 'ultima_visita',sql: 'date',                                prisma: 'ultimaVisita DateTime? @map("ultima_visita") @db.Date' },
    { name: 'notas',        sql: 'text',                                prisma: 'notas String?' },
  ] }],
  servicios: [{ table: 'servicios', model: 'Servicio', cols: [
    { name: 'nombre',       sql: 'text not null',                       prisma: 'nombre String' },
    { name: 'categoria',    sql: 'text',                                prisma: 'categoria String?' },
    { name: 'duracion_min', sql: 'integer not null default 30',         prisma: 'duracionMin Int @default(30) @map("duracion_min")' },
    { name: 'precio',       sql: 'numeric(12,2) not null default 0',   prisma: 'precio Decimal @default(0)' },
    { name: 'activo',       sql: 'boolean not null default true',       prisma: 'activo Boolean @default(true)' },
  ] }],
  empleados: [{ table: 'empleados', model: 'Empleado', cols: [
    { name: 'nombre',       sql: 'text not null',                       prisma: 'nombre String' },
    { name: 'rol',          sql: 'text',                                prisma: 'rol String?' },
    { name: 'especialidad', sql: 'text',                                prisma: 'especialidad String?' },
    { name: 'email',        sql: 'text',                                prisma: 'email String?' },
    { name: 'estado',       sql: "text not null default 'Activo'",     prisma: 'estado String @default("Activo")' },
  ] }],
  citas: [{ table: 'citas', model: 'Cita', cols: [
    { name: 'cliente_id',      sql: 'uuid',                            prisma: 'clienteId String? @map("cliente_id")' },
    { name: 'servicio_id',     sql: 'uuid',                            prisma: 'servicioId String? @map("servicio_id")' },
    { name: 'empleado_id',     sql: 'uuid',                            prisma: 'empleadoId String? @map("empleado_id")' },
    { name: 'cliente_nombre',  sql: 'text',                            prisma: 'clienteNombre String? @map("cliente_nombre")' },
    { name: 'servicio_nombre', sql: 'text',                            prisma: 'servicioNombre String? @map("servicio_nombre")' },
    { name: 'empleado_nombre', sql: 'text',                            prisma: 'empleadoNombre String? @map("empleado_nombre")' },
    { name: 'fecha',           sql: 'date not null',                   prisma: 'fecha DateTime @db.Date' },
    { name: 'hora',            sql: 'time',                            prisma: 'hora DateTime? @db.Time' },
    { name: 'estado',          sql: "text not null default 'Pendiente'", prisma: 'estado String @default("Pendiente")' },
    { name: 'notas',           sql: 'text',                            prisma: 'notas String?' },
  ] }],
  fichaje: [{ table: 'fichajes', model: 'Fichaje', cols: [
    { name: 'empleado_id',     sql: 'uuid',                            prisma: 'empleadoId String? @map("empleado_id")' },
    { name: 'empleado_nombre', sql: 'text',                            prisma: 'empleadoNombre String? @map("empleado_nombre")' },
    { name: 'fecha',           sql: 'date not null default current_date', prisma: 'fecha DateTime @default(now()) @db.Date' },
    { name: 'entrada',         sql: 'timestamptz',                     prisma: 'entrada DateTime?' },
    { name: 'salida',          sql: 'timestamptz',                     prisma: 'salida DateTime?' },
    { name: 'horas',           sql: 'numeric(5,2)',                    prisma: 'horas Decimal?' },
  ] }],
  vacaciones: [{ table: 'ausencias', model: 'Ausencia', cols: [
    { name: 'empleado_id',     sql: 'uuid',                            prisma: 'empleadoId String? @map("empleado_id")' },
    { name: 'empleado_nombre', sql: 'text',                            prisma: 'empleadoNombre String? @map("empleado_nombre")' },
    { name: 'tipo',            sql: "text not null default 'Vacaciones'", prisma: 'tipo String @default("Vacaciones")' },
    { name: 'fecha_inicio',    sql: 'date not null',                   prisma: 'fechaInicio DateTime @map("fecha_inicio") @db.Date' },
    { name: 'fecha_fin',       sql: 'date not null',                   prisma: 'fechaFin DateTime @map("fecha_fin") @db.Date' },
    { name: 'dias',            sql: 'integer',                         prisma: 'dias Int?' },
    { name: 'estado',          sql: "text not null default 'Pendiente'", prisma: 'estado String @default("Pendiente")' },
  ] }],
  productos: [{ table: 'productos', model: 'Producto', cols: [
    { name: 'nombre',       sql: 'text not null',                       prisma: 'nombre String' },
    { name: 'categoria',    sql: 'text',                                prisma: 'categoria String?' },
    { name: 'stock',        sql: 'integer not null default 0',          prisma: 'stock Int @default(0)' },
    { name: 'stock_minimo', sql: 'integer not null default 0',          prisma: 'stockMinimo Int @default(0) @map("stock_minimo")' },
    { name: 'precio',       sql: 'numeric(12,2) not null default 0',   prisma: 'precio Decimal @default(0)' },
    { name: 'proveedor',    sql: 'text',                                prisma: 'proveedor String?' },
  ] }],
  ventas: [{ table: 'ventas', model: 'Venta', cols: [
    { name: 'cliente_id',    sql: 'uuid',                              prisma: 'clienteId String? @map("cliente_id")' },
    { name: 'cliente_nombre',sql: "text default 'Contado'",            prisma: 'clienteNombre String? @default("Contado") @map("cliente_nombre")' },
    { name: 'fecha',         sql: 'date not null default current_date', prisma: 'fecha DateTime @default(now()) @db.Date' },
    { name: 'metodo_pago',   sql: "text not null default 'Tarjeta'",  prisma: 'metodoPago String @default("Tarjeta") @map("metodo_pago")' },
    { name: 'total',         sql: 'numeric(12,2) not null default 0', prisma: 'total Decimal @default(0)' },
  ] }],
  facturas: [
    { table: 'facturas', model: 'Factura', cols: [
      { name: 'numero',          sql: 'text not null',                     prisma: 'numero String' },
      { name: 'cliente_id',      sql: 'uuid',                             prisma: 'clienteId String? @map("cliente_id")' },
      { name: 'cliente_nombre',  sql: 'text',                             prisma: 'clienteNombre String? @map("cliente_nombre")' },
      { name: 'fecha',           sql: 'date not null default current_date', prisma: 'fecha DateTime @default(now()) @db.Date' },
      { name: 'total',           sql: 'numeric(12,2) not null default 0', prisma: 'total Decimal @default(0)' },
      { name: 'estado',          sql: "text not null default 'Pendiente'", prisma: 'estado String @default("Pendiente")' },
    ] },
    { table: 'documentos', model: 'Documento', cols: [
      { name: 'nombre',      sql: 'text not null',                         prisma: 'nombre String' },
      { name: 'tipo',        sql: 'text',                                  prisma: 'tipo String?' },
      { name: 'tam',         sql: 'integer',                               prisma: 'tam Int?' },
      { name: 'fecha',       sql: 'date not null default current_date',    prisma: 'fecha DateTime @default(now()) @db.Date' },
      { name: 'factura_id',  sql: 'uuid',                                  prisma: 'facturaId String? @map("factura_id")' },
      { name: 'cliente_id',  sql: 'uuid',                                  prisma: 'clienteId String? @map("cliente_id")' },
    ] },
  ],
  marketing: [{ table: 'campanas', model: 'Campana', cols: [
    { name: 'nombre',    sql: 'text not null',                         prisma: 'nombre String' },
    { name: 'canal',     sql: "text not null default 'Email'",        prisma: 'canal String @default("Email")' },
    { name: 'estado',    sql: "text not null default 'Borrador'",     prisma: 'estado String @default("Borrador")' },
    { name: 'enviados',  sql: 'integer not null default 0',           prisma: 'enviados Int @default(0)' },
    { name: 'aperturas', sql: 'text',                                  prisma: 'aperturas String?' },
  ] }],
};

// ---------------------------------------------------------------------------
// RELATIONS — mirrors front/lib/generate/schemas.ts
// ---------------------------------------------------------------------------

export const RELATIONS: {
  module: ModuleId;
  needs: ModuleId;
  table: string;
  col: string;
  ref: string;
  name: string;
}[] = [
  { module: 'citas',     needs: 'clientes',  table: 'citas',     col: 'cliente_id',  ref: 'clientes',  name: 'fk_citas_cliente' },
  { module: 'citas',     needs: 'servicios', table: 'citas',     col: 'servicio_id', ref: 'servicios', name: 'fk_citas_servicio' },
  { module: 'citas',     needs: 'empleados', table: 'citas',     col: 'empleado_id', ref: 'empleados', name: 'fk_citas_empleado' },
  { module: 'fichaje',   needs: 'empleados', table: 'fichajes',  col: 'empleado_id', ref: 'empleados', name: 'fk_fichajes_empleado' },
  { module: 'vacaciones',needs: 'empleados', table: 'ausencias', col: 'empleado_id', ref: 'empleados', name: 'fk_ausencias_empleado' },
  { module: 'ventas',    needs: 'clientes',  table: 'ventas',    col: 'cliente_id',  ref: 'clientes',  name: 'fk_ventas_cliente' },
  { module: 'facturas',  needs: 'clientes',  table: 'facturas',  col: 'cliente_id',  ref: 'clientes',  name: 'fk_facturas_cliente' },
  { module: 'facturas',  needs: 'facturas',  table: 'documentos',col: 'factura_id',  ref: 'facturas',  name: 'fk_documentos_factura' },
  { module: 'facturas',  needs: 'clientes',  table: 'documentos',col: 'cliente_id',  ref: 'clientes',  name: 'fk_documentos_cliente' },
];
