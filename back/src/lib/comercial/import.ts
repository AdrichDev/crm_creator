// Importación de clientes desde CSV/XLSX con detección de duplicados (RF-03, §11).
// Lógica PURA (sin DB ni parseo de fichero): recibe filas ya normalizadas y las clientes
// existentes, y decide cuáles son nuevas y cuáles posibles duplicados.

export interface ImportRow {
  nombre: string;
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
  localidad?: string | null;
  provincia?: string | null;
  codigoPostal?: string | null;
}

export interface ExistingCustomer {
  id: string;
  nombre: string;
  apellido?: string | null;
  telefono?: string | null;
  direccion?: string | null;
}

export interface DuplicateMatch {
  row: ImportRow;
  matchId: string;
  motivo: 'telefono' | 'nombre+direccion';
}

export interface ImportPlan {
  nuevos: ImportRow[];
  duplicados: DuplicateMatch[];
}

function norm(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // sin tildes
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

// Clave de teléfono: últimos 9 dígitos (número nacional ES), ignorando prefijo de país
// y formato. Devuelve '' si no hay al menos 9 dígitos (no comparable).
function phoneKey(s: string | null | undefined): string {
  const d = (s ?? '').replace(/\D/g, '');
  return d.length >= 9 ? d.slice(-9) : '';
}

function fullName(c: ExistingCustomer): string {
  return norm([c.nombre, c.apellido].filter(Boolean).join(' '));
}

// Clasifica cada fila: duplicado si coincide teléfono (dígitos) o si coincide nombre completo
// Y dirección con un cliente existente. El resto son nuevos. No muta las entradas.
export function planImport(rows: ImportRow[], existing: ExistingCustomer[]): ImportPlan {
  const byPhone = new Map<string, ExistingCustomer>();
  const byNameAddr = new Map<string, ExistingCustomer>();
  for (const c of existing) {
    const ph = phoneKey(c.telefono);
    if (ph) byPhone.set(ph, c);
    const key = `${fullName(c)}|${norm(c.direccion)}`;
    if (fullName(c) && norm(c.direccion)) byNameAddr.set(key, c);
  }

  const nuevos: ImportRow[] = [];
  const duplicados: DuplicateMatch[] = [];
  for (const row of rows) {
    const ph = phoneKey(row.telefono);
    const phoneHit = ph ? byPhone.get(ph) : undefined;
    if (phoneHit) {
      duplicados.push({ row, matchId: phoneHit.id, motivo: 'telefono' });
      continue;
    }
    const key = `${norm(row.nombre)}|${norm(row.direccion)}`;
    const nameAddrHit = norm(row.nombre) && norm(row.direccion) ? byNameAddr.get(key) : undefined;
    if (nameAddrHit) {
      duplicados.push({ row, matchId: nameAddrHit.id, motivo: 'nombre+direccion' });
      continue;
    }
    nuevos.push(row);
  }
  return { nuevos, duplicados };
}
