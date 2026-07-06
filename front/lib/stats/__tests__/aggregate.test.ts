import { describe, it, expect } from 'vitest';
import { aggregateStats, type StatsInput } from '@/lib/stats/aggregate';
import type { Cita, Factura, Venta, Cliente, Servicio, Producto } from '@/lib/mock/data';

// Helpers de fixtures deterministas. Solo los campos que el agregador usa.
const cliente = (id: number, segmento: string): Cliente => ({
  id,
  nombre: `Cliente ${id}`,
  email: `c${id}@mail.com`,
  telefono: '600',
  visitas: 0,
  gastoTotal: 0,
  segmento,
  ultimaVisita: '2026-01-01',
});

const factura = (id: number, fecha: string, total: number, estado: string): Factura => ({
  id,
  numero: `F-${id}`,
  cliente: `Cliente ${id}`,
  fecha,
  total,
  estado,
});

const cita = (id: number, fecha: string): Cita => ({
  id,
  cliente: `Cliente ${id}`,
  servicio: 'Corte',
  empleado: 'Sara',
  fecha,
  hora: '10:00',
  estado: 'Confirmada',
});

const venta = (id: number, fecha: string, total: number): Venta => ({
  id,
  fecha,
  cliente: `Cliente ${id}`,
  items: 1,
  metodo: 'Tarjeta',
  total,
});

const servicio = (id: number, categoria: string): Servicio => ({
  id,
  nombre: `Servicio ${id}`,
  duracion: 30,
  precio: 10,
  categoria,
});

const producto = (id: number): Producto => ({
  id,
  nombre: `Producto ${id}`,
  categoria: 'X',
  stock: 1,
  minimo: 1,
  precio: 1,
  proveedor: 'P',
});

const empty: StatsInput = {
  citas: [],
  facturas: [],
  ventas: [],
  clientes: [],
  servicios: [],
  productos: [],
};

describe('UC-3.5 · agregador de estadísticas', () => {
  describe('ingresos', () => {
    it('solo suma facturas Pagada', () => {
      const r = aggregateStats({
        ...empty,
        facturas: [
          factura(1, '2026-06-10', 100, 'Pagada'),
          factura(2, '2026-06-11', 50, 'Pendiente'),
          factura(3, '2026-06-12', 30, 'Anulada'),
          factura(4, '2026-06-13', 20, 'Pagada'),
        ],
      });
      expect(r.ingresos).toBe(120);
    });

    it('ingresos 0 si no hay facturas pagadas', () => {
      const r = aggregateStats({
        ...empty,
        facturas: [factura(1, '2026-06-10', 100, 'Pendiente')],
      });
      expect(r.ingresos).toBe(0);
    });
  });

  describe('KPIs', () => {
    it('cuenta correctamente cada colección', () => {
      const r = aggregateStats({
        citas: [cita(1, '2026-06-01'), cita(2, '2026-06-02')],
        facturas: [factura(1, '2026-06-10', 200, 'Pagada')],
        ventas: [venta(1, '2026-06-01', 10)],
        clientes: [cliente(1, 'VIP'), cliente(2, 'Nuevo'), cliente(3, 'VIP')],
        servicios: [servicio(1, 'Pelo')],
        productos: [producto(1), producto(2), producto(3), producto(4)],
      });
      const byLabel = Object.fromEntries(r.kpis.map((k) => [k.label, k.value]));
      expect(byLabel['Clientes']).toBe('3');
      expect(byLabel['Citas']).toBe('2');
      expect(byLabel['Servicios']).toBe('1');
      expect(byLabel['Productos']).toBe('4');
      expect(byLabel['Ingresos']).toBe('200 €');
    });

    it('Clientes e Ingresos llevan accent', () => {
      const r = aggregateStats(empty);
      const clientesKpi = r.kpis.find((k) => k.label === 'Clientes');
      const ingresosKpi = r.kpis.find((k) => k.label === 'Ingresos');
      expect(clientesKpi?.accent).toBe(true);
      expect(ingresosKpi?.accent).toBe(true);
    });
  });

  describe('monthly', () => {
    it('agrupa citas, ventas y facturas por mes', () => {
      const r = aggregateStats({
        ...empty,
        citas: [cita(1, '2026-06-01'), cita(2, '2026-06-15'), cita(3, '2026-05-20')],
        ventas: [venta(1, '2026-06-01', 10)],
        facturas: [factura(1, '2026-06-10', 100, 'Pagada')],
      });
      const jun = r.monthly.find((m) => m.month === '2026-06');
      const may = r.monthly.find((m) => m.month === '2026-05');
      expect(jun).toMatchObject({ label: 'Jun', citas: 2, ventas: 1, facturas: 1 });
      expect(may).toMatchObject({ label: 'May', citas: 1, ventas: 0, facturas: 0 });
    });

    it('respeta solo los últimos 6 meses, ordenados', () => {
      const meses = [
        '2026-01', '2026-02', '2026-03', '2026-04',
        '2026-05', '2026-06', '2026-07', '2026-08',
      ];
      const citas = meses.map((m, i) => cita(i + 1, `${m}-01`));
      const r = aggregateStats({ ...empty, citas });
      expect(r.monthly).toHaveLength(6);
      expect(r.monthly.map((m) => m.month)).toEqual([
        '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08',
      ]);
    });
  });

  describe('billing', () => {
    it('separa Pagada/Pendiente/Anulada por mes', () => {
      const r = aggregateStats({
        ...empty,
        facturas: [
          factura(1, '2026-06-01', 100, 'Pagada'),
          factura(2, '2026-06-02', 40, 'Pendiente'),
          factura(3, '2026-06-03', 25, 'Anulada'),
          factura(4, '2026-06-04', 60, 'Pagada'),
          factura(5, '2026-05-10', 70, 'Pendiente'),
        ],
      });
      const jun = r.billing.find((b) => b.month === '2026-06');
      const may = r.billing.find((b) => b.month === '2026-05');
      expect(jun).toMatchObject({ Pagada: 160, Pendiente: 40, Anulada: 25 });
      expect(may).toMatchObject({ Pagada: 0, Pendiente: 70, Anulada: 0 });
    });
  });

  describe('serviciosPorCategoria', () => {
    it('cuenta y ordena descendente por frecuencia', () => {
      const r = aggregateStats({
        ...empty,
        servicios: [
          servicio(1, 'Pelo'),
          servicio(2, 'Pelo'),
          servicio(3, 'Pelo'),
          servicio(4, 'Color'),
          servicio(5, 'Barba'),
          servicio(6, 'Barba'),
        ],
      });
      expect(r.serviciosPorCategoria).toEqual([
        { name: 'Pelo', value: 3 },
        { name: 'Barba', value: 2 },
        { name: 'Color', value: 1 },
      ]);
    });
  });

  describe('clientesPorSegmento', () => {
    it('cuenta y ordena descendente por frecuencia', () => {
      const r = aggregateStats({
        ...empty,
        clientes: [
          cliente(1, 'VIP'),
          cliente(2, 'VIP'),
          cliente(3, 'Nuevo'),
          cliente(4, 'Recurrente'),
          cliente(5, 'Recurrente'),
          cliente(6, 'Recurrente'),
        ],
      });
      expect(r.clientesPorSegmento[0]).toEqual({ name: 'Recurrente', value: 3 });
      expect(r.clientesPorSegmento.map((s) => s.value)).toEqual([3, 2, 1]);
    });
  });

  describe('input vacío o parcial', () => {
    it('no peta con input completamente vacío', () => {
      const r = aggregateStats(empty);
      expect(r.ingresos).toBe(0);
      expect(r.monthly).toEqual([]);
      expect(r.billing).toEqual([]);
      expect(r.serviciosPorCategoria).toEqual([]);
      expect(r.clientesPorSegmento).toEqual([]);
      expect(r.kpis).toHaveLength(5);
    });

    it('no peta con colecciones undefined', () => {
      const r = aggregateStats({} as StatsInput);
      expect(r.ingresos).toBe(0);
      expect(r.monthly).toEqual([]);
      expect(r.billing).toEqual([]);
      expect(r.serviciosPorCategoria).toEqual([]);
      expect(r.clientesPorSegmento).toEqual([]);
    });
  });

  describe('mes inválido', () => {
    it('monthLabel cae al key cuando el mes no es 1..12', () => {
      const r = aggregateStats({
        ...empty,
        citas: [cita(1, '2026-13-01')],
      });
      const punto = r.monthly.find((m) => m.month === '2026-13');
      expect(punto?.label).toBe('2026-13');
    });

    it('ignora fechas demasiado cortas (sin mes)', () => {
      const r = aggregateStats({
        ...empty,
        citas: [cita(1, '2026')],
      });
      expect(r.monthly).toEqual([]);
    });
  });
});
