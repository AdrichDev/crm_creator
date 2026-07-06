// Dirección a mostrar en el detalle de cita (WU: crm-operaos-agenda-contactos-fichaje-telegram
// "pin de ubicación"). Prioridad: dirección del CLIENTE visitado (venta/visita de campo →
// se navega hacia el cliente), con fallback a la sucursal (Location.direccion) cuando el
// cliente no tiene dirección registrada (o la cita no tiene cliente, p.ej. entrenamiento
// de equipo). Puro/testable: no toca Prisma, solo compone strings.

export interface CustomerDireccionInput {
  direccion?: string | null;
  numero?: string | null;
  piso?: string | null;
  localidad?: string | null;
  provincia?: string | null;
  codigoPostal?: string | null;
}

export interface LocationDireccionInput {
  direccion?: string | null;
}

/** Compone la dirección estructurada del cliente en una sola línea legible para
 * Google Maps (calle+número, piso, localidad/provincia, CP). `null` si no hay
 * ni siquiera la calle — piso/localidad solos no forman una dirección buscable. */
export function buildCustomerDireccion(customer: CustomerDireccionInput | null | undefined): string | null {
  if (!customer?.direccion) return null;
  const partes: string[] = [];
  let calle = customer.direccion.trim();
  if (customer.numero) calle += ` ${customer.numero.trim()}`;
  partes.push(calle);
  if (customer.piso) partes.push(customer.piso.trim());
  const lugar = [customer.localidad, customer.provincia].filter(Boolean).map((s) => s!.trim()).join(', ');
  if (lugar) partes.push(lugar);
  if (customer.codigoPostal) partes.push(customer.codigoPostal.trim());
  return partes.join(', ');
}

/** Dirección final de la cita: cliente visitado > sucursal (fallback). */
export function resolveCitaDireccion(
  customer: CustomerDireccionInput | null | undefined,
  location: LocationDireccionInput | null | undefined,
): string | null {
  return buildCustomerDireccion(customer) ?? location?.direccion ?? null;
}
