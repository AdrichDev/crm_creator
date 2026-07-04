import { describe, it, expect } from 'vitest';
import { computeInvoiceMetrics } from '@/lib/invoices/metrics';

// crm-paridad-facturas-pedidos-aa (Fase 2, task 2.2): la función pura que alimenta las
// métricas de la vista documental de Facturas. Espejo del test de PR-1 en back, fijando
// los mismos criterios en el front (paquete separado).
describe('computeInvoiceMetrics (front)', () => {
  it('lista vacía → todo a cero', () => {
    expect(computeInvoiceMetrics([])).toEqual({
      totalFacturas: 0, importeTotal: 0,
      pendientes: 0, importePendiente: 0,
      pagadas: 0, importePagado: 0,
      anuladas: 0, importeAnulado: 0,
    });
  });

  it('agrega por estado y suma TODAS las facturas en importeTotal (incluidas Anuladas)', () => {
    const m = computeInvoiceMetrics([
      { estado: 'Pagada', total: 120 },
      { estado: 'Pendiente', total: 72.5 },
      { estado: 'Pagada', total: 45 },
      { estado: 'Anulada', total: 10 },
    ]);
    expect(m.totalFacturas).toBe(4);
    expect(m.importeTotal).toBe(247.5); // incluye la Anulada
    expect(m.pendientes).toBe(1);
    expect(m.importePendiente).toBe(72.5);
    expect(m.pagadas).toBe(2);
    expect(m.importePagado).toBe(165);
    expect(m.anuladas).toBe(1);
    expect(m.importeAnulado).toBe(10);
  });

  it('estado libre fuera de los 3 literales cuenta en el total pero en ningún contador de estado', () => {
    const m = computeInvoiceMetrics([{ estado: 'Borrador', total: 30 }]);
    expect(m.totalFacturas).toBe(1);
    expect(m.importeTotal).toBe(30);
    expect(m.pendientes + m.pagadas + m.anuladas).toBe(0);
  });

  it('total no finito (NaN/Infinity) cuenta como 0', () => {
    const m = computeInvoiceMetrics([
      { estado: 'Pagada', total: Number.NaN },
      { estado: 'Pagada', total: Number.POSITIVE_INFINITY },
      { estado: 'Pagada', total: 50 },
    ]);
    expect(m.totalFacturas).toBe(3);
    expect(m.importeTotal).toBe(50);
    expect(m.importePagado).toBe(50);
  });
});
