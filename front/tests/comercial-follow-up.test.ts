import { describe, it, expect } from 'vitest';
import { buildFollowUpList, reminderUrgency } from '@/lib/comercial/follow-up';

// NOW y los fixtures se construyen con el constructor de Date en hora LOCAL (igual que
// vi.setSystemTime en otros tests del repo) para que la comparación de "día natural" sea
// determinista sin importar la zona horaria del runner (evita fixtures con 'Z' a medianoche).
const NOW = new Date(2026, 6, 2, 10, 0, 0); // 2026-07-02 10:00 local

describe('buildFollowUpList — orden vencido→hoy→próximo→pendiente (WU2.1, AC4)', () => {
  it('clasifica y ordena recordatorios vencido/hoy/próximo', () => {
    const reminders = [
      { id: 'r-proximo', customerId: 'c1', customerNombre: 'Cliente 1', titulo: 'Próximo', fechaPrevista: new Date(2026, 6, 5, 9, 0, 0).toISOString(), estado: 'PENDING' as const },
      { id: 'r-vencido', customerId: 'c2', customerNombre: 'Cliente 2', titulo: 'Vencido', fechaPrevista: new Date(2026, 5, 30, 9, 0, 0).toISOString(), estado: 'PENDING' as const },
      { id: 'r-hoy', customerId: 'c3', customerNombre: 'Cliente 3', titulo: 'Hoy', fechaPrevista: new Date(2026, 6, 2, 18, 0, 0).toISOString(), estado: 'PENDING' as const },
    ];
    const items = buildFollowUpList(reminders, [], NOW);
    expect(items.map((i) => i.urgency)).toEqual(['vencido', 'hoy', 'proximo']);
    expect(items[0].titulo).toBe('Vencido');
    expect(items[1].titulo).toBe('Hoy');
    expect(items[2].titulo).toBe('Próximo');
  });

  it('clientes en estado pendiente con próxima acción van al final (bucket "pendiente")', () => {
    const reminders = [
      { id: 'r1', customerId: 'c1', customerNombre: 'Cliente 1', titulo: 'Vencido', fechaPrevista: new Date(2026, 5, 30, 9, 0, 0).toISOString(), estado: 'PENDING' as const },
    ];
    const clientes = [
      { id: 'c2', nombre: 'Cliente 2', proximaAccionEn: new Date(2026, 6, 10, 9, 0, 0).toISOString(), estadoVisita: { esPendiente: true } },
    ];
    const items = buildFollowUpList(reminders, clientes, NOW);
    expect(items.map((i) => i.urgency)).toEqual(['vencido', 'pendiente']);
    expect(items[1].kind).toBe('cliente-pendiente');
    expect(items[1].customerNombre).toBe('Cliente 2');
  });

  it('ignora recordatorios DONE/CANCELLED', () => {
    const reminders = [
      { id: 'r1', customerId: 'c1', customerNombre: 'X', titulo: 'Hecho', fechaPrevista: new Date(2026, 5, 30, 9, 0, 0).toISOString(), estado: 'DONE' as const },
      { id: 'r2', customerId: 'c1', customerNombre: 'X', titulo: 'Cancelado', fechaPrevista: new Date(2026, 5, 30, 9, 0, 0).toISOString(), estado: 'CANCELLED' as const },
    ];
    expect(buildFollowUpList(reminders, [], NOW)).toHaveLength(0);
  });

  it('ignora clientes sin próxima acción o sin estado pendiente', () => {
    const clientes = [
      { id: 'c1', nombre: 'Sin fecha', proximaAccionEn: null, estadoVisita: { esPendiente: true } },
      { id: 'c2', nombre: 'No pendiente', proximaAccionEn: new Date(2026, 6, 10, 9, 0, 0).toISOString(), estadoVisita: { esPendiente: false } },
      { id: 'c3', nombre: 'Sin estado', proximaAccionEn: new Date(2026, 6, 10, 9, 0, 0).toISOString(), estadoVisita: null },
    ];
    expect(buildFollowUpList([], clientes, NOW)).toHaveLength(0);
  });

  it('reminderUrgency: límites del día natural (no 24h exactas)', () => {
    expect(reminderUrgency(new Date(2026, 6, 2, 0, 0, 0).toISOString(), NOW)).toBe('hoy');
    expect(reminderUrgency(new Date(2026, 6, 2, 23, 59, 59).toISOString(), NOW)).toBe('hoy');
    expect(reminderUrgency(new Date(2026, 6, 1, 23, 59, 59).toISOString(), NOW)).toBe('vencido');
    expect(reminderUrgency(new Date(2026, 6, 3, 0, 0, 0).toISOString(), NOW)).toBe('proximo');
    expect(reminderUrgency(null, NOW)).toBe('proximo');
  });
});
