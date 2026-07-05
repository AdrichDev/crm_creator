// Helper compartido para filtros de "día calendario exacto" sobre columnas de fecha
// (contactos.createdAt, cliente.createdAt, ...). Usa wall-clock local (sin forzar UTC),
// consistente con la convención de hora de pared ya aplicada en reservas/citas.

/**
 * Rango [inicio del día, inicio del día siguiente) para un string "YYYY-MM-DD".
 * Devuelve undefined si el string no es una fecha válida (no rompe el where).
 */
export function dayRange(fecha: string): { gte: Date; lt: Date } | undefined {
  const start = new Date(`${fecha}T00:00:00.000`);
  if (Number.isNaN(start.getTime())) return undefined;
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { gte: start, lt: end };
}
