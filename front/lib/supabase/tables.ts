// Mapeo entre las colecciones del front y las tablas/columnas del esquema `app`.
// El front usa camelCase; el esquema Postgres usa snake_case y, en algunos
// casos, nombres distintos. Aquí se declaran esas equivalencias.

export const TABLE_MAP: Record<string, string> = {
  clientes: 'clientes',
  servicios: 'servicios',
  empleados: 'empleados',
  citas: 'citas',
  fichaje: 'fichajes',
  vacaciones: 'ausencias',
  productos: 'productos',
  ventas: 'ventas',
  marketing: 'campanas',
};

// front -> columna DB (solo cuando el nombre difiere del camel→snake directo).
export const COLUMN_TO_DB: Record<string, Record<string, string>> = {
  clientes: { gastoTotal: 'gasto_total', ultimaVisita: 'ultima_visita' },
  servicios: { duracion: 'duracion_min' },
  productos: { minimo: 'stock_minimo' },
  citas: { cliente: 'cliente_nombre', servicio: 'servicio_nombre', empleado: 'empleado_nombre' },
  fichaje: { empleado: 'empleado_nombre' },
  vacaciones: { empleado: 'empleado_nombre', inicio: 'fecha_inicio', fin: 'fecha_fin' },
  ventas: { cliente: 'cliente_nombre', items: 'items', metodo: 'metodo_pago' },
};

const toSnake = (s: string) => s.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase());
const toCamel = (s: string) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

export function fieldToDb(key: string, field: string): string {
  return COLUMN_TO_DB[key]?.[field] ?? toSnake(field);
}

/** Convierte un objeto del front a fila de DB para una colección. */
export function toDbRow(key: string, obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'id') continue; // la DB genera el uuid
    out[fieldToDb(key, k)] = v;
  }
  return out;
}

/** Convierte una fila de DB a objeto del front (inverso aproximado). */
export function fromDbRow(key: string, row: Record<string, unknown>): Record<string, unknown> {
  const back = COLUMN_TO_DB[key] ?? {};
  const dbToFront: Record<string, string> = {};
  for (const [front, db] of Object.entries(back)) dbToFront[db] = front;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[dbToFront[k] ?? toCamel(k)] = v;
  }
  return out;
}
