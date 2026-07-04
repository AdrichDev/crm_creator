import { describe, it, expect } from 'vitest';
import { computePedidoMetrics } from '@/lib/pedidos/metrics';

// crm-paridad-facturas-pedidos-aa (fix post-PR-4): la función pura que alimenta los KPIs de
// la vista Pedidos en modo local/demo (en modo API vienen del back — GET /pedidos → metrics).
// Espejo del test de back (back/src/lib/pedidos/__tests__/metrics.test.ts), fijando los
// mismos criterios en el front (paquete separado). Misma convención que facturas-metrics.
describe('computePedidoMetrics (front)', () => {
  it('lista vacía → todo a cero', () => {
    expect(computePedidoMetrics([])).toEqual({ totalPedidos: 0, aceptados: 0, importeTotal: 0 });
  });

  it('cuenta aceptados por igualdad exacta y suma totalImpl de TODOS los estados', () => {
    const m = computePedidoMetrics([
      { estado: 'generada', totalImpl: 1452 },
      { estado: 'aceptada', totalImpl: 1028.5 },
      { estado: 'rechazada', totalImpl: 50 },
      { estado: 'caducada', totalImpl: 25 },
    ]);
    expect(m.totalPedidos).toBe(4);
    expect(m.aceptados).toBe(1);
    expect(m.importeTotal).toBe(1452 + 1028.5 + 50 + 25); // incluye rechazadas y caducadas
  });

  it('estado libre fuera del ciclo cuenta en el total pero no en aceptados', () => {
    const m = computePedidoMetrics([{ estado: 'borrador', totalImpl: 30 }]);
    expect(m.totalPedidos).toBe(1);
    expect(m.aceptados).toBe(0);
    expect(m.importeTotal).toBe(30);
  });

  it('totalImpl no finito (NaN/Infinity) cuenta como 0', () => {
    const m = computePedidoMetrics([
      { estado: 'aceptada', totalImpl: Number.NaN },
      { estado: 'generada', totalImpl: Number.POSITIVE_INFINITY },
      { estado: 'generada', totalImpl: 50 },
    ]);
    expect(m.totalPedidos).toBe(3);
    expect(m.aceptados).toBe(1);
    expect(m.importeTotal).toBe(50);
  });
});
