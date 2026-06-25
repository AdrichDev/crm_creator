// Helpers de nombre compartidos: el front usa nombre COMBINADO (nombre+apellido);
// la DB lo guarda partido. Antes estaba duplicado en customers/employees/bookings.

/** "Nombre Apellidos" → { nombre: primer token, apellido: resto | null }. */
export function splitNombre(full: string): { nombre: string; apellido: string | null } {
  const t = full.trim().split(/\s+/).filter(Boolean);
  return { nombre: t[0] ?? '', apellido: t.length > 1 ? t.slice(1).join(' ') : null };
}

/** { nombre, apellido } → "Nombre Apellido" (sin nulos/espacios sobrantes). */
export function joinNombre(p: { nombre?: string | null; apellido?: string | null } | null | undefined): string {
  return p ? [p.nombre, p.apellido].filter(Boolean).join(' ') : '';
}

/** Copia de `body` solo los campos presentes (no undefined) de la lista blanca. */
export function pickFields(body: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) if (body[f] !== undefined) out[f] = body[f];
  return out;
}
