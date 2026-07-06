import type { Factura, Pedido } from '@/lib/mock/data';

// Filtros de lista compartidos por Presupuestos y Facturas (crm 5d). Puros y sin estado para
// poder testearlos en unidad. Buscan sobre el conjunto YA cargado (client-side): número del
// documento, cliente (nombre / razón social) y persona de contacto. La coincidencia es
// case-insensitive y por subcadena (mismo criterio que el resto de buscadores del CRM).

const norm = (v: unknown) => String(v ?? '').toLowerCase();

/** Snapshot de cliente que puede viajar en una factura de la API (no está en el tipo base). */
type FacturaCliente = { nombre?: string; razonSocial?: string; contacto?: string };

/**
 * ¿El presupuesto casa con la búsqueda? Coincide por `numero`, `clienteSnapshot.nombre`,
 * `clienteSnapshot.razonSocial` o `clienteSnapshot.contacto`. Query vacía → siempre true.
 */
export function pedidoMatches(p: Pedido, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const cli = p.clienteSnapshot ?? {};
  return [p.numero, cli.nombre, cli.razonSocial, cli.contacto].some((v) => norm(v).includes(q));
}

/**
 * ¿La factura casa con la búsqueda? Coincide por `numero`, `cliente` (nombre/razón social) y,
 * si viaja en el snapshot de la API, la persona de `contacto`. Query vacía → siempre true.
 */
export function facturaMatches(f: Factura, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const cli = (f as Factura & { clienteSnapshot?: FacturaCliente }).clienteSnapshot ?? {};
  return [f.numero, f.cliente, cli.nombre, cli.razonSocial, cli.contacto].some((v) => norm(v).includes(q));
}
