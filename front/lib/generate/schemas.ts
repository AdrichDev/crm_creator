// Fuente única de definición de cada módulo para generar SQL y Prisma.
// Solo columnas de negocio: id, tenant_id, created_at, updated_at se añaden auto.
import type { ModuleId } from '@/lib/config/modules';

export interface Col {
  name: string;          // columna DB (snake_case)
  sql: string;           // tipo + restricciones SQL
  prisma: string;        // nombre y tipo Prisma (incluye @map y opcional)
}
export interface GenTable { table: string; model: string; cols: Col[]; }

export const MODULE_TABLES: Partial<Record<ModuleId, GenTable[]>> = {
  clientes: [{ table: 'clientes', model: 'Cliente', cols: [
    { name: 'nombre', sql: 'text not null', prisma: 'nombre String' },
    { name: 'email', sql: 'text', prisma: 'email String?' },
    { name: 'telefono', sql: 'text', prisma: 'telefono String?' },
    { name: 'segmento', sql: "text default 'Nuevo'", prisma: 'segmento String @default("Nuevo")' },
    { name: 'visitas', sql: 'integer not null default 0', prisma: 'visitas Int @default(0)' },
    { name: 'gasto_total', sql: 'numeric(12,2) not null default 0', prisma: 'gastoTotal Decimal @default(0) @map("gasto_total")' },
    { name: 'ultima_visita', sql: 'date', prisma: 'ultimaVisita DateTime? @map("ultima_visita") @db.Date' },
    { name: 'notas', sql: 'text', prisma: 'notas String?' },
  ] }],
  servicios: [{ table: 'servicios', model: 'Servicio', cols: [
    { name: 'nombre', sql: 'text not null', prisma: 'nombre String' },
    { name: 'categoria', sql: 'text', prisma: 'categoria String?' },
    { name: 'duracion_min', sql: 'integer not null default 30', prisma: 'duracionMin Int @default(30) @map("duracion_min")' },
    { name: 'precio', sql: 'numeric(12,2) not null default 0', prisma: 'precio Decimal @default(0)' },
    { name: 'activo', sql: 'boolean not null default true', prisma: 'activo Boolean @default(true)' },
  ] }],
  empleados: [{ table: 'empleados', model: 'Empleado', cols: [
    { name: 'nombre', sql: 'text not null', prisma: 'nombre String' },
    { name: 'rol', sql: 'text', prisma: 'rol String?' },
    { name: 'especialidad', sql: 'text', prisma: 'especialidad String?' },
    { name: 'email', sql: 'text', prisma: 'email String?' },
    { name: 'estado', sql: "text not null default 'Activo'", prisma: 'estado String @default("Activo")' },
  ] }],
  citas: [{ table: 'citas', model: 'Cita', cols: [
    { name: 'cliente_id', sql: 'uuid', prisma: 'clienteId String? @map("cliente_id")' },
    { name: 'servicio_id', sql: 'uuid', prisma: 'servicioId String? @map("servicio_id")' },
    { name: 'empleado_id', sql: 'uuid', prisma: 'empleadoId String? @map("empleado_id")' },
    { name: 'cliente_nombre', sql: 'text', prisma: 'clienteNombre String? @map("cliente_nombre")' },
    { name: 'servicio_nombre', sql: 'text', prisma: 'servicioNombre String? @map("servicio_nombre")' },
    { name: 'empleado_nombre', sql: 'text', prisma: 'empleadoNombre String? @map("empleado_nombre")' },
    { name: 'fecha', sql: 'date not null', prisma: 'fecha DateTime @db.Date' },
    { name: 'hora', sql: 'time', prisma: 'hora DateTime? @db.Time' },
    { name: 'estado', sql: "text not null default 'Pendiente'", prisma: 'estado String @default("Pendiente")' },
    { name: 'notas', sql: 'text', prisma: 'notas String?' },
  ] }],
  fichaje: [{ table: 'fichajes', model: 'Fichaje', cols: [
    { name: 'empleado_id', sql: 'uuid', prisma: 'empleadoId String? @map("empleado_id")' },
    { name: 'empleado_nombre', sql: 'text', prisma: 'empleadoNombre String? @map("empleado_nombre")' },
    { name: 'fecha', sql: 'date not null default current_date', prisma: 'fecha DateTime @default(now()) @db.Date' },
    { name: 'entrada', sql: 'timestamptz', prisma: 'entrada DateTime?' },
    { name: 'salida', sql: 'timestamptz', prisma: 'salida DateTime?' },
    { name: 'horas', sql: 'numeric(5,2)', prisma: 'horas Decimal?' },
  ] }],
  vacaciones: [{ table: 'ausencias', model: 'Ausencia', cols: [
    { name: 'empleado_id', sql: 'uuid', prisma: 'empleadoId String? @map("empleado_id")' },
    { name: 'empleado_nombre', sql: 'text', prisma: 'empleadoNombre String? @map("empleado_nombre")' },
    { name: 'tipo', sql: "text not null default 'Vacaciones'", prisma: 'tipo String @default("Vacaciones")' },
    { name: 'fecha_inicio', sql: 'date not null', prisma: 'fechaInicio DateTime @map("fecha_inicio") @db.Date' },
    { name: 'fecha_fin', sql: 'date not null', prisma: 'fechaFin DateTime @map("fecha_fin") @db.Date' },
    { name: 'dias', sql: 'integer', prisma: 'dias Int?' },
    { name: 'estado', sql: "text not null default 'Pendiente'", prisma: 'estado String @default("Pendiente")' },
  ] }],
  productos: [{ table: 'productos', model: 'Producto', cols: [
    { name: 'nombre', sql: 'text not null', prisma: 'nombre String' },
    { name: 'categoria', sql: 'text', prisma: 'categoria String?' },
    { name: 'stock', sql: 'integer not null default 0', prisma: 'stock Int @default(0)' },
    { name: 'stock_minimo', sql: 'integer not null default 0', prisma: 'stockMinimo Int @default(0) @map("stock_minimo")' },
    { name: 'precio', sql: 'numeric(12,2) not null default 0', prisma: 'precio Decimal @default(0)' },
    { name: 'proveedor', sql: 'text', prisma: 'proveedor String?' },
  ] }],
  ventas: [{ table: 'ventas', model: 'Venta', cols: [
    { name: 'cliente_id', sql: 'uuid', prisma: 'clienteId String? @map("cliente_id")' },
    { name: 'cliente_nombre', sql: "text default 'Contado'", prisma: 'clienteNombre String? @default("Contado") @map("cliente_nombre")' },
    { name: 'fecha', sql: 'date not null default current_date', prisma: 'fecha DateTime @default(now()) @db.Date' },
    { name: 'metodo_pago', sql: "text not null default 'Tarjeta'", prisma: 'metodoPago String @default("Tarjeta") @map("metodo_pago")' },
    { name: 'total', sql: 'numeric(12,2) not null default 0', prisma: 'total Decimal @default(0)' },
  ] }],
  facturas: [
    { table: 'facturas', model: 'Factura', cols: [
      { name: 'numero', sql: 'text not null', prisma: 'numero String' },
      { name: 'cliente_id', sql: 'uuid', prisma: 'clienteId String? @map("cliente_id")' },
      { name: 'cliente_nombre', sql: 'text', prisma: 'clienteNombre String? @map("cliente_nombre")' },
      { name: 'fecha', sql: 'date not null default current_date', prisma: 'fecha DateTime @default(now()) @db.Date' },
      { name: 'total', sql: 'numeric(12,2) not null default 0', prisma: 'total Decimal @default(0)' },
      { name: 'estado', sql: "text not null default 'Pendiente'", prisma: 'estado String @default("Pendiente")' },
    ] },
    { table: 'documentos', model: 'Documento', cols: [
      { name: 'nombre', sql: 'text not null', prisma: 'nombre String' },
      { name: 'tipo', sql: 'text', prisma: 'tipo String?' },
      { name: 'tam', sql: 'integer', prisma: 'tam Int?' },
      { name: 'fecha', sql: 'date not null default current_date', prisma: 'fecha DateTime @default(now()) @db.Date' },
      { name: 'factura_id', sql: 'uuid', prisma: 'facturaId String? @map("factura_id")' },
      { name: 'cliente_id', sql: 'uuid', prisma: 'clienteId String? @map("cliente_id")' },
    ] },
  ],
  marketing: [{ table: 'campanas', model: 'Campana', cols: [
    { name: 'nombre', sql: 'text not null', prisma: 'nombre String' },
    { name: 'canal', sql: "text not null default 'Email'", prisma: 'canal String @default("Email")' },
    { name: 'estado', sql: "text not null default 'Borrador'", prisma: 'estado String @default("Borrador")' },
    { name: 'enviados', sql: 'integer not null default 0', prisma: 'enviados Int @default(0)' },
    { name: 'aperturas', sql: 'text', prisma: 'aperturas String?' },
  ] }],
};

// Relaciones cruzadas: se incluyen solo si el módulo "needs" también está activo.
export const RELATIONS: { module: ModuleId; needs: ModuleId; table: string; col: string; ref: string; name: string }[] = [
  { module: 'citas', needs: 'clientes', table: 'citas', col: 'cliente_id', ref: 'clientes', name: 'fk_citas_cliente' },
  { module: 'citas', needs: 'servicios', table: 'citas', col: 'servicio_id', ref: 'servicios', name: 'fk_citas_servicio' },
  { module: 'citas', needs: 'empleados', table: 'citas', col: 'empleado_id', ref: 'empleados', name: 'fk_citas_empleado' },
  { module: 'fichaje', needs: 'empleados', table: 'fichajes', col: 'empleado_id', ref: 'empleados', name: 'fk_fichajes_empleado' },
  { module: 'vacaciones', needs: 'empleados', table: 'ausencias', col: 'empleado_id', ref: 'empleados', name: 'fk_ausencias_empleado' },
  { module: 'ventas', needs: 'clientes', table: 'ventas', col: 'cliente_id', ref: 'clientes', name: 'fk_ventas_cliente' },
  { module: 'facturas', needs: 'clientes', table: 'facturas', col: 'cliente_id', ref: 'clientes', name: 'fk_facturas_cliente' },
  { module: 'facturas', needs: 'facturas', table: 'documentos', col: 'factura_id', ref: 'facturas', name: 'fk_documentos_factura' },
  { module: 'facturas', needs: 'clientes', table: 'documentos', col: 'cliente_id', ref: 'clientes', name: 'fk_documentos_cliente' },
];
