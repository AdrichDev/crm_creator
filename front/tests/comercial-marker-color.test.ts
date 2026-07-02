import { describe, it, expect } from 'vitest';
import { markerColor, ABC_COLORS } from '@/lib/comercial/marker-color';

describe('markerColor — modo de color del mapa (WU1.1)', () => {
  it('modo estado: usa el color del estado de visita (comportamiento actual)', () => {
    const c = { estadoVisita: { id: '1', nombre: 'Visitado', color: '#22c55e', icono: 'x', esPendiente: false }, categoriaAbc: 'A' as const };
    expect(markerColor(c, 'estado')).toBe('#22c55e');
  });

  it('modo estado sin estado asignado: color gris por defecto', () => {
    expect(markerColor({ estadoVisita: null }, 'estado')).toBe('#9ca3af');
  });

  it('modo gasto: color fijo por categoría ABC, independiente del estado', () => {
    const estado = { id: '1', nombre: 'Pendiente', color: '#ef4444', icono: 'x', esPendiente: true };
    expect(markerColor({ estadoVisita: estado, categoriaAbc: 'A' }, 'gasto')).toBe(ABC_COLORS.A);
    expect(markerColor({ estadoVisita: estado, categoriaAbc: 'B' }, 'gasto')).toBe(ABC_COLORS.B);
    expect(markerColor({ estadoVisita: estado, categoriaAbc: 'C' }, 'gasto')).toBe(ABC_COLORS.C);
  });

  it('modo gasto sin categoría ABC: color gris de "sin categoría"', () => {
    expect(markerColor({ categoriaAbc: null }, 'gasto')).not.toBe(ABC_COLORS.A);
    expect(markerColor({ categoriaAbc: null }, 'gasto')).not.toBe(ABC_COLORS.B);
    expect(markerColor({ categoriaAbc: null }, 'gasto')).not.toBe(ABC_COLORS.C);
  });

  it('A/B/C son colores fijos y distinguibles entre sí', () => {
    const set = new Set(Object.values(ABC_COLORS));
    expect(set.size).toBe(3);
  });
});
