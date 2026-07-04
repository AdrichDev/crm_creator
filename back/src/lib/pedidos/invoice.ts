// Auto-factura al aceptar un pedido (crm-paridad-facturas-pedidos-aa, Fase 1.2b / PR-2b).
//
// Espejo de agents-agency/back/src/routes/budgets.ts (ensureInvoiceForBudget) +
// agents-agency/back/src/lib/invoices.ts (deriveInvoiceNumber), adaptado al modelo PLANO
// de crm.factura (numero, cliente, servicio, fecha, total, estado) — el CRM NO replica la
// estructura presupuesto/líneas/IVA de AA (decisión de paridad ligera, design.md §1).
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

/** Forma mínima del pedido que necesita la factura (todo persistido, nada del cliente). */
export interface PedidoForInvoice {
  id: string;
  businessId: string;
  numero: string;
  clienteSnapshot: unknown;
  totalImpl: unknown;
  totalMant: unknown;
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
        // El detalle documental (servicio/líneas) vive en el pedido enlazado; la factura
        // plana no lo duplica (columna nullable → null).
        servicio: null,
        fecha: new Date().toISOString().slice(0, 10), // YYYY-MM-DD (misma convención String que el CRUD)
        total: deriveTotal(pedido),
        estado: 'Pendiente', // estado inicial del modelo de 3 estados del CRM (Pendiente/Pagada/Anulada)
        pedidoId: pedido.id,
      },
    });
  } catch (err) {
    if ((err as { code?: string })?.code === 'P2002' && isPedidoUniqueConflict(err)) return; // ya existe factura para este pedido
    throw err;
  }
}
