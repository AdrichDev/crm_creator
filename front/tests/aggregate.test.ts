import { describe, it, expect } from 'vitest';
import { aggregateStats } from '@/lib/stats/aggregate';

// Tests del agregador de estadísticas. Carpeta única de tests del front.
describe('aggregateStats', () => {
  const base = {
    citas: [
      { id: 1, cliente: 'A', servicio: 'Corte', empleado: 'E', fecha: '2026-06-01', hora: '10:00', estado: 'Confirmada' },
      { id: 2, cliente: 'B', servicio: 'Color', empleado: 'E', fecha: '2026-05-10', hora: '11:00', estado: 'Cancelada' },
    ],
    facturas: [
      { id: 1, numero: 'F1', cliente: 'A', servicio: 'Corte', fecha: '2026-06-02', total: 100, estado: 'Pagada' },
      { id: 2, numero: 'F2', cliente: 'B', servicio: 'Color', fecha: '2026-06-03', total: 50, estado: 'Pendiente' },
    ],
    ventas: [{ id: 1, fecha: '2026-06-02', cliente: 'A', items: 1, metodo: 'Tarjeta', total: 20 }],
    clientes: [
      { id: 1, nombre: 'A', email: '', telefono: '', visitas: 1, gastoTotal: 0, segmento: 'VIP', ultimaVisita: '' },
      { id: 2, nombre: 'B', email: '', telefono: '', visitas: 1, gastoTotal: 0, segmento: 'Nuevo', ultimaVisita: '' },
    ],
    servicios: [
      { id: 1, nombre: 'Corte', duracion: 30, precio: 10, categoria: 'Pelo' },
      { id: 2, nombre: 'Color', duracion: 60, precio: 40, categoria: 'Color' },
    ],
    productos: [{ id: 1, nombre: 'Cera', categoria: 'Peinado', stock: 5, minimo: 2, precio: 9, proveedor: 'X' }],
  };

  it('ingresos = suma de facturas pagadas', () => {
    expect(aggregateStats(base).ingresos).toBe(100);
  });

  it('KPIs reflejan los conteos de cada colección', () => {
    const k = aggregateStats(base).kpis;
    expect(k.find((x) => x.label === 'Clientes')?.value).toBe('2');
    expect(k.find((x) => x.label === 'Citas')?.value).toBe('2');
    expect(k.find((x) => x.label === 'Servicios')?.value).toBe('2');
    expect(k.find((x) => x.label === 'Productos')?.value).toBe('1');
  });

  it('facturación por estado agrupa por mes', () => {
    const jun = aggregateStats(base).billing.find((b) => b.month === '2026-06');
    expect(jun?.Pagada).toBe(100);
    expect(jun?.Pendiente).toBe(50);
  });

  it('distribuciones cuentan por categoría y segmento', () => {
    const r = aggregateStats(base);
    expect(r.serviciosPorCategoria).toContainEqual({ name: 'Pelo', value: 1 });
    expect(r.clientesPorSegmento).toContainEqual({ name: 'VIP', value: 1 });
  });

  it('tolera colecciones vacías sin romper', () => {
    const r = aggregateStats({ citas: [], facturas: [], ventas: [], clientes: [], servicios: [], productos: [] });
    expect(r.ingresos).toBe(0);
    expect(r.monthly).toEqual([]);
  });
});
