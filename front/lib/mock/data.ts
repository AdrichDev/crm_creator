// Datos de ejemplo (semillas). Al portar, el hook useCollection se conecta a
// Supabase y estas semillas dejan de usarse.

// `datos`: data URL (base64) del archivo para previsualizar/descargar. Opcional:
// las semillas y archivos grandes (> límite localStorage) guardan solo metadatos.
export interface Documento { id: number | string; nombre: string; tipo: string; tam: number; fecha: string; datos?: string; }
// Dirección estructurada (crm-operaos 9.2): numero/piso/localidad/provincia/codigoPostal
// llegan de `/customers` (crm.cliente). Opcionales: el mock generador no los rellena.
export interface Cliente { id: number; nombre: string; email: string; telefono: string; visitas: number; gastoTotal: number; segmento: string; ultimaVisita: string; cif?: string; direccion?: string; numero?: string; piso?: string; localidad?: string; provincia?: string; codigoPostal?: string; contacto?: string; nombreComercial?: string; razonSocial?: string; documentos?: Documento[]; extra?: Record<string, string>; gastoPendiente?: number; latitud?: number | null; longitud?: number | null; }
// `pedidoId`: vínculo al pedido origen (crm-paridad-facturas-pedidos-aa, PR-2b). Lo puebla
// la API en modo remoto (columna crm.factura.pedido_id); null/undefined en facturas manuales,
// del operador (bot Telegram) o del mock local. La vista previa lo muestra solo si existe.
// crm-operaos 10.3: la factura es un documento AUTOCONTENIDO con desglose propio —
// `lines` (líneas snapshotadas), `subtotal` (base sin IVA) y `tasaIva`. Las facturas legacy
// migran con 1 línea (servicio, importe = total) y tasaIva 0 (subtotal = total, IVA 0: no se
// inventa desglose retroactivo). Decimales del back llegan como string → Number() al mostrar.
export interface FacturaLinea { id?: number | string; nombre: string; descripcion?: string | null; cantidad: number; precioUnit: number; importe: number; }
export interface Factura {
  id: number; numero: string; cliente: string; servicio?: string; fecha: string;
  subtotal?: number; tasaIva?: number; total: number;
  estado: string; pagadaEn?: string | null;
  lines?: FacturaLinea[];
  documentos?: Documento[]; pedidoId?: string | null;
}
// Pedido/Presupuesto documental (crm-paridad-facturas-pedidos-aa, Fase 3 / PR-4). Espejo del
// modelo `Budget`/`BudgetLine` de AA adaptado al CRM: totales pago único (impl) + mensualidad
// (mant) con IVA, snapshots de cliente/emisor, ciclo `generada|aceptada|rechazada|caducada`.
// Los campos Decimal del back llegan como string en JSON → coaccionar con Number() al mostrar.
export interface PedidoLinea { id?: number | string; servicioId?: string; nombre: string; descripcion?: string | null; cantidad: number; precioImpl: number; precioMant: number; }
export interface Pedido {
  id: number | string;
  numero: string;
  customerId?: string | null;
  clienteSnapshot?: Record<string, string>;
  emisorSnapshot?: Record<string, string>;
  estado: string;
  subtotalImpl: number; subtotalMant: number;
  totalImpl: number; totalMant: number;
  tasaIva: number;
  diasValidez?: number;
  notas?: string | null;
  lines: PedidoLinea[];
  createdAt: string;
}
export interface Cita { id: number; cliente: string; servicio: string; empleado: string; fecha: string; hora: string; estado: string; }
export interface Servicio { id: number; nombre: string; duracion: number; precio: number; categoria: string; }
export interface Empleado { id: number; nombre: string; rol: string; especialidad: string; estado: string; email: string; }
export interface Fichaje { id: number; empleado: string; fecha: string; entrada: string; salida: string; horas: number; }
export interface Vacacion { id: number; empleado: string; tipo: string; inicio: string; fin: string; dias: number; estado: string; }
export interface Producto { id: number; nombre: string; categoria: string; stock: number; minimo: number; precio: number; proveedor: string; }
export interface Venta { id: number; fecha: string; cliente: string; items: number; metodo: string; total: number; }
export interface Campana { id: number; nombre: string; canal: string; estado: string; enviados: number; aperturas: string; }
export interface Resena { id: number; autor: string; estrellas: number; texto: string; fecha: string; }

// Mismos 4 nombres que `clientesMock` (front/lib/config/sector-data.ts NAMES) — así el
// combobox de vinculación de Pedidos y el widget "Clientes nuevos" (que usan este array fijo)
// referencian los MISMOS clientes que la página Clientes muestra de verdad (cualquier
// vertical). Antes incluía una "Elena Páez" huérfana que no existía en ninguna lista real.
export const clientes: Cliente[] = [
  { id: 1, nombre: 'Lucía Fernández', email: 'lucia@mail.com', telefono: '600 111 222', visitas: 12, gastoTotal: 480, segmento: 'VIP', ultimaVisita: '2026-06-10' },
  { id: 2, nombre: 'Marcos Ruiz', email: 'marcos@mail.com', telefono: '600 333 444', visitas: 3, gastoTotal: 95, segmento: 'Nuevo', ultimaVisita: '2026-06-12' },
  { id: 3, nombre: 'Ana Gómez', email: 'ana@mail.com', telefono: '600 555 666', visitas: 27, gastoTotal: 1120, segmento: 'VIP', ultimaVisita: '2026-06-14' },
  { id: 4, nombre: 'David Soler', email: 'david@mail.com', telefono: '600 777 888', visitas: 7, gastoTotal: 210, segmento: 'Recurrente', ultimaVisita: '2026-05-29' },
];

// Citas del modo generador: referencian nombres REALES de `clientes` (arriba) y de
// `CONTACTOS_SEED` (front/components/crm/contactos-lista.tsx) — mismo criterio que el seed
// en vivo de Supabase (mitad clientes, mitad leads/contactos), en vez de nombres inventados
// sin correlato en ninguna lista visible de la app.
export const citas: Cita[] = [
  { id: 1, cliente: 'Lucía Fernández', servicio: 'Corte + peinado', empleado: 'Sara', fecha: '2026-06-16', hora: '10:00', estado: 'Confirmada' },
  { id: 2, cliente: 'Marcos Ruiz', servicio: 'Afeitado clásico', empleado: 'Jorge', fecha: '2026-06-16', hora: '11:30', estado: 'Pendiente' },
  { id: 3, cliente: 'Ana Gómez', servicio: 'Color + corte', empleado: 'Sara', fecha: '2026-06-16', hora: '13:00', estado: 'Confirmada' },
  { id: 4, cliente: 'David Soler', servicio: 'Corte', empleado: 'Carlos', fecha: '2026-06-17', hora: '09:30', estado: 'Cancelada' },
  { id: 5, cliente: 'Diego Serrano', servicio: 'Manicura', empleado: 'Marta', fecha: '2026-06-17', hora: '16:00', estado: 'Pendiente' },
];

export const servicios: Servicio[] = [
  { id: 1, nombre: 'Corte de pelo', duracion: 30, precio: 15, categoria: 'Pelo' },
  { id: 2, nombre: 'Corte + peinado', duracion: 45, precio: 22, categoria: 'Pelo' },
  { id: 3, nombre: 'Color completo', duracion: 90, precio: 55, categoria: 'Color' },
  { id: 4, nombre: 'Afeitado clásico', duracion: 25, precio: 14, categoria: 'Barba' },
  { id: 5, nombre: 'Manicura', duracion: 40, precio: 20, categoria: 'Manos' },
];

export const empleados: Empleado[] = [
  { id: 1, nombre: 'Sara Molina', rol: 'Senior', especialidad: 'Color', estado: 'Activo', email: 'sara@negocio.com' },
  { id: 2, nombre: 'Jorge Ortega', rol: 'Barbero', especialidad: 'Barba', estado: 'Activo', email: 'jorge@negocio.com' },
  { id: 3, nombre: 'Carlos Vidal', rol: 'Junior', especialidad: 'Corte', estado: 'Vacaciones', email: 'carlos@negocio.com' },
  { id: 4, nombre: 'Marta Ríos', rol: 'Estética', especialidad: 'Manos', estado: 'Activo', email: 'marta@negocio.com' },
];

export const fichajes: Fichaje[] = [
  { id: 1, empleado: 'Sara Molina', fecha: '2026-06-15', entrada: '09:02', salida: '17:31', horas: 8.5 },
  { id: 2, empleado: 'Jorge Ortega', fecha: '2026-06-15', entrada: '10:00', salida: '18:05', horas: 8.1 },
  { id: 3, empleado: 'Marta Ríos', fecha: '2026-06-15', entrada: '09:30', salida: '14:30', horas: 5.0 },
];

export const vacaciones: Vacacion[] = [
  { id: 1, empleado: 'Carlos Vidal', tipo: 'Vacaciones', inicio: '2026-06-10', fin: '2026-06-20', dias: 8, estado: 'Aprobada' },
  { id: 2, empleado: 'Sara Molina', tipo: 'Vacaciones', inicio: '2026-07-01', fin: '2026-07-15', dias: 11, estado: 'Pendiente' },
  { id: 3, empleado: 'Jorge Ortega', tipo: 'Asuntos propios', inicio: '2026-06-24', fin: '2026-06-24', dias: 1, estado: 'Pendiente' },
];

export const productos: Producto[] = [
  { id: 1, nombre: 'Cera modeladora', categoria: 'Peinado', stock: 24, minimo: 10, precio: 12.5, proveedor: 'BeautyDist' },
  { id: 2, nombre: 'Champú anticaída', categoria: 'Cuidado', stock: 6, minimo: 8, precio: 18.0, proveedor: 'BeautyDist' },
  { id: 3, nombre: 'Aceite de barba', categoria: 'Barba', stock: 15, minimo: 5, precio: 14.0, proveedor: 'BarberPro' },
  { id: 4, nombre: 'Esmalte rojo', categoria: 'Uñas', stock: 3, minimo: 6, precio: 8.0, proveedor: 'NailWorld' },
];

export const ventas: Venta[] = [
  { id: 1024, fecha: '2026-06-15', cliente: 'Ana Gómez', items: 3, metodo: 'Tarjeta', total: 72.0 },
  { id: 1023, fecha: '2026-06-15', cliente: 'Lucía Fernández', items: 1, metodo: 'Efectivo', total: 22.0 },
  { id: 1022, fecha: '2026-06-14', cliente: 'Contado', items: 2, metodo: 'Bizum', total: 34.5 },
  { id: 1021, fecha: '2026-06-14', cliente: 'David Soler', items: 1, metodo: 'Tarjeta', total: 15.0 },
];

export const campanas: Campana[] = [
  { id: 1, nombre: 'Vuelta de vacaciones', canal: 'Email', estado: 'Activa', enviados: 320, aperturas: '38%' },
  { id: 2, nombre: 'Cumpleaños -20%', canal: 'SMS', estado: 'Automática', enviados: 45, aperturas: '—' },
  { id: 3, nombre: 'Reseña tras visita', canal: 'WhatsApp', estado: 'Borrador', enviados: 0, aperturas: '—' },
];

export const resenas: Resena[] = [
  { id: 1, autor: 'Ana G.', estrellas: 5, texto: 'El mejor sitio, repito seguro.', fecha: '2026-06-12' },
  { id: 2, autor: 'Marcos R.', estrellas: 4, texto: 'Muy buen trato y puntuales.', fecha: '2026-06-09' },
  { id: 3, autor: 'Elena P.', estrellas: 5, texto: 'Encantada con el resultado.', fecha: '2026-06-15' },
];

export const pedidos: Pedido[] = [
  {
    id: 3101, numero: 'P-2026-001', estado: 'generada', createdAt: '2026-06-14T09:00:00.000Z',
    clienteSnapshot: { nombre: 'Ana Gómez', cif: 'B12345678', direccion: 'C/ Mayor 3, Madrid', email: 'ana@mail.com', telefono: '600 555 666', contacto: 'Ana Gómez' },
    emisorSnapshot: { empresa: 'Estudio 3A', cif: 'B87654321', direccion: 'Av. del Sol 10', email: 'hola@estudio3a.com', telefono: '910 000 000' },
    tasaIva: 0.21, diasValidez: 30, notas: null,
    lines: [
      { id: 1, nombre: 'Implantación CRM', descripcion: 'Puesta en marcha y migración', cantidad: 1, precioImpl: 1200, precioMant: 0 },
      { id: 2, nombre: 'Soporte mensual', descripcion: 'Mantenimiento y actualizaciones', cantidad: 1, precioImpl: 0, precioMant: 90 },
    ],
    subtotalImpl: 1200, subtotalMant: 90, totalImpl: 1452, totalMant: 108.9,
  },
  {
    id: 3102, numero: 'P-2026-002', estado: 'aceptada', createdAt: '2026-06-12T11:30:00.000Z',
    clienteSnapshot: { nombre: 'Lucía Fernández', cif: 'B22223333', direccion: 'C/ Luna 5, Madrid', email: 'lucia@mail.com', telefono: '600 111 222', contacto: 'Lucía Fernández' },
    emisorSnapshot: { empresa: 'Estudio 3A', cif: 'B87654321', direccion: 'Av. del Sol 10', email: 'hola@estudio3a.com', telefono: '910 000 000' },
    tasaIva: 0.21, diasValidez: 30, notas: null,
    lines: [
      { id: 1, nombre: 'Página web corporativa', descripcion: 'Diseño y desarrollo', cantidad: 1, precioImpl: 850, precioMant: 0 },
    ],
    subtotalImpl: 850, subtotalMant: 0, totalImpl: 1028.5, totalMant: 0,
  },
  {
    id: 3103, numero: 'P-2026-003', estado: 'rechazada', createdAt: '2026-06-09T16:00:00.000Z',
    clienteSnapshot: { nombre: 'David Soler', cif: '', direccion: '', email: 'david@mail.com', telefono: '600 777 888', contacto: 'David Soler' },
    emisorSnapshot: { empresa: 'Estudio 3A', cif: 'B87654321', direccion: 'Av. del Sol 10', email: 'hola@estudio3a.com', telefono: '910 000 000' },
    tasaIva: 0.21, diasValidez: 30, notas: null,
    lines: [
      { id: 1, nombre: 'Campaña de marketing', descripcion: 'Gestión de RRSS', cantidad: 3, precioImpl: 0, precioMant: 120 },
    ],
    subtotalImpl: 0, subtotalMant: 360, totalImpl: 0, totalMant: 435.6,
  },
];

// Semillas con la MISMA forma que deja la migración 10.3 en facturas legacy: 1 línea
// (nombre = servicio, importe = total), subtotal = total y tasaIva 0 (sin IVA inventado).
export const facturas: Factura[] = [
  { id: 2001, numero: 'F-2026-001', cliente: 'Lucía Fernández', servicio: 'Corte + peinado', fecha: '2026-06-10', subtotal: 120.0, tasaIva: 0, total: 120.0, estado: 'Pagada', lines: [{ id: 1, nombre: 'Corte + peinado', cantidad: 1, precioUnit: 120.0, importe: 120.0 }], documentos: [{ id: 1, nombre: 'factura-F-2026-001.pdf', tipo: 'application/pdf', tam: 84210, fecha: '2026-06-10' }] },
  { id: 2002, numero: 'F-2026-002', cliente: 'Ana Gómez', servicio: 'Color + corte', fecha: '2026-06-12', subtotal: 72.5, tasaIva: 0, total: 72.5, estado: 'Pendiente', lines: [{ id: 1, nombre: 'Color + corte', cantidad: 1, precioUnit: 72.5, importe: 72.5 }], documentos: [] },
  { id: 2003, numero: 'F-2026-003', cliente: 'David Soler', servicio: 'Corte', fecha: '2026-06-14', subtotal: 45.0, tasaIva: 0, total: 45.0, estado: 'Pagada', lines: [{ id: 1, nombre: 'Corte', cantidad: 1, precioUnit: 45.0, importe: 45.0 }], documentos: [] },
];
