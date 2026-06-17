// Agregador de estadísticas del tenant.
// Deriva KPIs y series a partir de las colecciones del CRM (mock/localStorage),
// replicando el panel de agents-agency sin acoplar a su backend ni a recharts.
import type { Cita, Factura, Venta, Cliente, Servicio, Producto } from '@/lib/mock/data';
import { MESES_ABBR } from '@/lib/config/constants';
import { eur } from '@/lib/utils/format';

export interface StatsInput {
  citas: Cita[];
  facturas: Factura[];
  ventas: Venta[];
  clientes: Cliente[];
  servicios: Servicio[];
  productos: Producto[];
}

export interface Kpi { label: string; value: string; accent?: boolean; }
export interface MonthPoint { month: string; label: string; citas: number; ventas: number; facturas: number; }
export interface BillingPoint { month: string; label: string; Pagada: number; Pendiente: number; Anulada: number; }
export interface Slice { name: string; value: number; }

export interface StatsResult {
  kpis: Kpi[];
  monthly: MonthPoint[];
  billing: BillingPoint[];
  serviciosPorCategoria: Slice[];
  clientesPorSegmento: Slice[];
  ingresos: number;
}

/** 'YYYY-MM-DD' → 'YYYY-MM'. Devuelve '' si la fecha no es válida. */
function monthKey(fecha?: string): string {
  if (!fecha || fecha.length < 7) return '';
  return fecha.slice(0, 7);
}

function monthLabel(key: string): string {
  const m = parseInt(key.slice(5, 7), 10);
  return Number.isFinite(m) && m >= 1 && m <= 12 ? MESES_ABBR[m - 1] : key;
}

/** Conjunto ordenado de los últimos `n` meses presentes en los datos. */
function lastMonths(keys: string[], n = 6): string[] {
  const uniq = Array.from(new Set(keys.filter(Boolean))).sort();
  return uniq.slice(-n);
}

function countBy<T>(items: T[], pick: (t: T) => string): Slice[] {
  const map = new Map<string, number>();
  for (const it of items) {
    const k = pick(it) || '—';
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

export function aggregateStats(input: StatsInput): StatsResult {
  const citas = input.citas ?? [];
  const facturas = input.facturas ?? [];
  const ventas = input.ventas ?? [];
  const clientes = input.clientes ?? [];
  const servicios = input.servicios ?? [];
  const productos = input.productos ?? [];

  const ingresos = facturas
    .filter((f) => f.estado === 'Pagada')
    .reduce((a, f) => a + Number(f.total || 0), 0);

  const kpis: Kpi[] = [
    { label: 'Clientes', value: String(clientes.length), accent: true },
    { label: 'Citas', value: String(citas.length) },
    { label: 'Ingresos', value: eur(ingresos), accent: true },
    { label: 'Servicios', value: String(servicios.length) },
    { label: 'Productos', value: String(productos.length) },
  ];

  // Meses a representar: unión de todas las fechas, últimos 6.
  const allMonths = lastMonths([
    ...citas.map((c) => monthKey(c.fecha)),
    ...ventas.map((v) => monthKey(v.fecha)),
    ...facturas.map((f) => monthKey(f.fecha)),
  ], 6);

  const monthly: MonthPoint[] = allMonths.map((month) => ({
    month,
    label: monthLabel(month),
    citas: citas.filter((c) => monthKey(c.fecha) === month).length,
    ventas: ventas.filter((v) => monthKey(v.fecha) === month).length,
    facturas: facturas.filter((f) => monthKey(f.fecha) === month).length,
  }));

  const billing: BillingPoint[] = allMonths.map((month) => {
    const ofMonth = facturas.filter((f) => monthKey(f.fecha) === month);
    const sum = (estado: string) =>
      ofMonth.filter((f) => f.estado === estado).reduce((a, f) => a + Number(f.total || 0), 0);
    return {
      month,
      label: monthLabel(month),
      Pagada: sum('Pagada'),
      Pendiente: sum('Pendiente'),
      Anulada: sum('Anulada'),
    };
  });

  return {
    kpis,
    monthly,
    billing,
    serviciosPorCategoria: countBy(servicios, (s) => s.categoria),
    clientesPorSegmento: countBy(clientes, (c) => c.segmento),
    ingresos,
  };
}
