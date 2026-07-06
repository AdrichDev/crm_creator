// Auto-factura al aceptar un pedido (crm-paridad-facturas-pedidos-aa, Fase 1.2b / PR-2b;
// detalle documental crm-operaos 10.3).
//
// Espejo de agents-agency/back/src/routes/budgets.ts (ensureInvoiceForBudget) +
// agents-agency/back/src/lib/invoices.ts (deriveInvoiceNumber). Desde 10.3 la factura es
// un documento AUTOCONTENIDO: además de numero/cliente/total se SNAPSHOTEAN las líneas y
// el desglose (subtotal sin IVA + tasaIva) del pedido en el momento de aceptar. El detalle
// vive EN la factura, nunca se deriva del pedido al renderizar — así la factura sobrevive
// al hard-delete del pedido (pedido_id SetNull, registro financiero durable).
//
// La idempotencia NO se apoya en un check a nivel de app, sino en la columna
// factura.pedido_id @unique (constraint REAL de BD): un reproceso de la aceptación
// (doble clic, reintento, webhook duplicado) choca con P2002 en pedido_id y se ignora.

/** Redondea a 2 decimales evitando el arrastre de error de IEEE-754. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Deriva el `numero` visible de la factura a partir del `numero` del pedido.
 *
 * DECISIÓN DE DERIVACIÓN (contenida, no es un fork de arquitectura):
 * misma idea que `deriveInvoiceNumber` de AA ("AD-2026-001" → "FAC - 2026-001"): se
 * intercambia el prefijo de tipo de documento por "FAC - ". La diferencia con AA es que
 * AA sólo quita el prefijo fijo `AD-`; aquí se quita cualquier prefijo alfabético inicial
 * seguido de guion (`AD-`, `P-`, `PRES-`, …) para no acoplarse a un prefijo concreto, ya
 * que el `numero` del pedido lo teclea el formulario (igual que en AA) y su prefijo puede
 * variar por tenant. Si el numero no trae prefijo, se antepone "FAC - " tal cual.
 *   "AD-2026-001" → "FAC - 2026-001"
 *   "P-17"        → "FAC - 17"
 *   "2026-007"    → "FAC - 2026-007"
 * Estable e idempotente: el mismo `numero` de pedido produce siempre el mismo `numero` de
 * factura, sin secuencia propia ni condición de carrera. NO se exige unicidad de este
 * `numero` (la idempotencia real es pedido_id @unique): así se conserva el contrato del
 * CRM, donde el `numero` de factura no es único (ver caracterización 1.1).
 */
export function deriveInvoiceNumberFromPedido(pedidoNumero: string): string {
  const stripped = (pedidoNumero ?? '').replace(/^[A-Za-z]+-/, '');
  return `FAC - ${stripped}`;
}

/**
 * Deriva el nombre de cliente a mostrar en la factura desde el snapshot del pedido.
 * El snapshot es JSON arbitrario (igual que clientSnapshot en AA); se usa `nombre` si
 * viene, con fallback a cadena vacía (la columna `cliente` es NOT NULL pero admite '').
 */
function deriveClienteNombre(clienteSnapshot: unknown): string {
  if (clienteSnapshot && typeof clienteSnapshot === 'object') {
    const nombre = (clienteSnapshot as Record<string, unknown>).nombre;
    if (typeof nombre === 'string') return nombre;
  }
  return '';
}

/**
 * `total` de la factura documental = total pago único + total mensual (ambos con IVA).
 * Coherente con el criterio de agregación ya fijado en el proyecto: `computeInvoiceMetrics`
 * (task 1.3, back/src/lib/invoices/metrics.ts, y su equivalente en AA) calcula el importe
 * de una factura como totalImpl + totalMant. No es un fork: sigue la convención existente.
 */
function deriveTotal(pedido: { totalImpl: unknown; totalMant: unknown }): number {
  return round2(Number(pedido.totalImpl ?? 0) + Number(pedido.totalMant ?? 0));
}

// Columnas que, en un P2002, identifican la colisión de idempotencia legítima (pedido ya
// facturado). Según la versión/driver de Prisma, el nombre de columna en conflicto viene en
// sitios distintos: el query-engine clásico lo pone en `err.meta.target`; el client-engine
// nuevo con `@prisma/adapter-pg` (Prisma 7.x) NO puebla `target` — el detalle real vive en
// `err.meta.driverAdapterError.cause.constraint.fields` (confirmado en runtime contra la BD
// real: `target` viene `undefined`, y sin este segundo camino el P2002 correcto se relanzaba
// y tumbaba el proceso entero — no era un 500 controlado, era un crash de Node). Se contemplan
// ambas formas.
const PEDIDO_UNIQUE_TARGETS = ['pedidoId', 'pedido_id', 'factura_pedido_id_key'];

function conflictColumns(err: unknown): string[] {
  const meta = (err as { meta?: Record<string, unknown> })?.meta;
  const target = meta?.target as unknown;
  if (target) return Array.isArray(target) ? (target as string[]) : [target as string];

  const driverFields = (
    meta?.driverAdapterError as
      | { cause?: { constraint?: { fields?: unknown } } }
      | undefined
  )?.cause?.constraint?.fields;
  if (Array.isArray(driverFields)) return driverFields as string[];

  return [];
}

/**
 * True SÓLO si el P2002 proviene del constraint único de pedido_id (factura ya existe para
 * ese pedido). Un P2002 de CUALQUIER otra columna (p. ej. un futuro índice sobre `numero`)
 * NO debe tratarse como el caso de idempotencia: sería tragar en silencio una colisión
 * distinta y responder como si no hubiera pasado nada. Este discriminador es exactamente el
 * bug que una revisión de Devil's Advocate detectó en la 1ª versión de AA (catch ciego).
 */
export function isPedidoUniqueConflict(err: unknown): boolean {
  const columns = conflictColumns(err);
  if (columns.length === 0) return false;
  return columns.some((c) => PEDIDO_UNIQUE_TARGETS.includes(c));
}

/** Línea de pedido tal como la persiste Prisma (Decimal llega como unknown/number). */
export interface PedidoLineForInvoice {
  nombre: string;
  descripcion?: string | null;
  cantidad: number;
  precioImpl: unknown;
  precioMant: unknown;
  posicion: number;
}

/** Forma mínima del pedido que necesita la factura (todo persistido, nada del cliente). */
export interface PedidoForInvoice {
  id: string;
  businessId: string;
  numero: string;
  clienteSnapshot: unknown;
  subtotalImpl: unknown;
  subtotalMant: unknown;
  totalImpl: unknown;
  totalMant: unknown;
  tasaIva: unknown;
  lines?: PedidoLineForInvoice[];
}

/** Forma de una línea de factura lista para el `create` anidado. */
export interface InvoiceLineSnapshot {
  nombre: string;
  descripcion: string | null;
  cantidad: number;
  precioUnit: number;
  importe: number;
  posicion: number;
}

/**
 * Snapshotea las líneas del pedido como líneas de factura (crm-operaos 10.3).
 *
 * DECISIÓN DE FORMA (documentada también en schema.prisma › InvoiceLine): la línea de
 * factura es UNITARIA (cantidad + precioUnit + importe, sin IVA), más simple que la doble
 * columna impl/mant de PedidoLine. Una línea de pedido con precioImpl>0 Y precioMant>0 se
 * PARTE en dos líneas de factura — "(pago único)" y "(mensual)" — para que la suma de
 * `importe` reproduzca subtotalImpl+subtotalMant AL CÉNTIMO (mismo round2 por línea que
 * computePedidoTotals aplica al agregar). Una línea solo-mensual conserva el sufijo
 * "(mensual)" para no perder esa semántica en la lista plana. Una línea sin precios (0/0)
 * se conserva como línea de importe 0 (el documento no pierde conceptos).
 */
export function buildInvoiceLinesFromPedido(lines: PedidoLineForInvoice[] | undefined): InvoiceLineSnapshot[] {
  const out: InvoiceLineSnapshot[] = [];
  const sorted = [...(lines ?? [])].sort((a, b) => (a.posicion ?? 0) - (b.posicion ?? 0));
  for (const l of sorted) {
    const qty = Number.isFinite(l.cantidad) ? Number(l.cantidad) : 1;
    const impl = Number(l.precioImpl ?? 0);
    const mant = Number(l.precioMant ?? 0);
    const desc = l.descripcion ?? null;
    if (impl > 0) {
      out.push({
        nombre: mant > 0 ? `${l.nombre} (pago único)` : l.nombre,
        descripcion: desc,
        cantidad: qty,
        precioUnit: impl,
        importe: round2(qty * impl),
        posicion: out.length,
      });
    }
    if (mant > 0) {
      out.push({
        nombre: `${l.nombre} (mensual)`,
        descripcion: desc,
        cantidad: qty,
        precioUnit: mant,
        importe: round2(qty * mant),
        posicion: out.length,
      });
    }
    if (impl <= 0 && mant <= 0) {
      out.push({ nombre: l.nombre, descripcion: desc, cantidad: qty, precioUnit: 0, importe: 0, posicion: out.length });
    }
  }
  return out;
}

/** Cliente de transacción mínimo: sólo `invoice.create` (lo que usa ensureInvoiceForPedido). */
export interface InvoiceCreateTx {
  invoice: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> };
}

/**
 * Crea la factura asociada a un pedido aceptado, de forma idempotente.
 *
 * pedido_id es @unique en factura, así que un reproceso del evento de aceptación choca con
 * P2002 en pedido_id y se ignora (no crea 2ª factura). Un P2002 de OTRA columna se RELANZA:
 * tragarlo sería perder una factura en silencio devolviendo 200. Debe correr DENTRO de la
 * misma $transaction que el cambio de estado del pedido: si la factura falla, el pedido no
 * debe quedar marcado `aceptada` sin factura y sin forma de detectar el hueco.
 */
export async function ensureInvoiceForPedido(tx: InvoiceCreateTx, pedido: PedidoForInvoice): Promise<void> {
  try {
    await tx.invoice.create({
      data: {
        businessId: pedido.businessId,
        numero: deriveInvoiceNumberFromPedido(pedido.numero),
        cliente: deriveClienteNombre(pedido.clienteSnapshot),
        // `servicio` queda null: desde 10.3 el detalle vive en las líneas snapshotadas
        // (la columna se conserva para facturas legacy/operador).
        servicio: null,
        fecha: new Date().toISOString().slice(0, 10), // YYYY-MM-DD (misma convención String que el CRUD)
        // Desglose autocontenido (10.3): subtotal (base sin IVA) y total (con IVA) se COPIAN
        // de los agregados persistidos del pedido — no se re-derivan de las líneas — para que
        // el invariante de exactitud se mantenga AL CÉNTIMO (mismo criterio round2 de siempre).
        subtotal: round2(Number(pedido.subtotalImpl ?? 0) + Number(pedido.subtotalMant ?? 0)),
        tasaIva: Number(pedido.tasaIva ?? 0.21),
        total: deriveTotal(pedido),
        estado: 'Pendiente', // estado inicial del set cerrado del CRM (Pendiente/Pagada/Anulada)
        pedidoId: pedido.id,
        // Snapshot de líneas EN la factura (create anidado): el documento es autónomo y
        // sobrevive al borrado en duro del pedido origen.
        lines: { create: buildInvoiceLinesFromPedido(pedido.lines) },
      },
    });
  } catch (err) {
    if ((err as { code?: string })?.code === 'P2002' && isPedidoUniqueConflict(err)) return; // ya existe factura para este pedido
    throw err;
  }
}
