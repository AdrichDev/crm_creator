// Parser CSV mínimo para importación de clientes (RF-03). PURO y testable. Soporta comillas
// dobles y separador coma o punto y coma. No pretende cubrir todo el estándar: cubre el caso
// de exportaciones típicas de Excel/Google Sheets.

export interface ImportRowInput {
  nombre: string;
  telefono?: string;
  email?: string;
  direccion?: string;
  localidad?: string;
  provincia?: string;
  codigoPostal?: string;
}

function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === sep && !inQuotes) {
      out.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function norm(h: string): string {
  return h.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// Sinónimos de cabecera → campo canónico.
const HEADER_MAP: Record<string, keyof ImportRowInput> = {
  nombre: 'nombre', name: 'nombre', cliente: 'nombre', 'razon social': 'nombre',
  telefono: 'telefono', tlf: 'telefono', movil: 'telefono', phone: 'telefono', tel: 'telefono',
  email: 'email', correo: 'email', 'e-mail': 'email',
  direccion: 'direccion', address: 'direccion', domicilio: 'direccion',
  localidad: 'localidad', ciudad: 'localidad', poblacion: 'localidad',
  provincia: 'provincia', prov: 'provincia',
  cp: 'codigoPostal', 'codigo postal': 'codigoPostal', codigopostal: 'codigoPostal', 'c.p.': 'codigoPostal',
};

export function parseCsvToRows(text: string): ImportRowInput[] {
  const clean = text.replace(/\r\n?/g, '\n').trim();
  if (!clean) return [];
  const lines = clean.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];
  const sep = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  const headers = splitLine(lines[0], sep).map(norm);
  const rows: ImportRowInput[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i], sep);
    const row: Partial<ImportRowInput> = {};
    headers.forEach((h, idx) => {
      const key = HEADER_MAP[h];
      if (key && cells[idx]) row[key] = cells[idx];
    });
    if (row.nombre) rows.push(row as ImportRowInput);
  }
  return rows;
}
