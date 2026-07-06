import { describe, it, expect } from 'vitest';
import { sortServicios } from '@/lib/servicios/sort';
import type { Servicio } from '@/lib/mock/data';

// Regresión: `precio` (Decimal de Prisma) llega como STRING vía JSON en modo API
// (p. ej. "180.00"), no como number. Comparar por tipo runtime ordenaba
// alfabéticamente ("180" < "45") en vez de numéricamente.
const rows = [
  { id: 1, nombre: 'Zeta', categoria: 'B', duracion: '90' as unknown as number, precio: '180.00' as unknown as number },
  { id: 2, nombre: 'Alfa', categoria: 'A', duracion: '30' as unknown as number, precio: '45.00' as unknown as number },
  { id: 3, nombre: 'Beta', categoria: 'C', duracion: '60' as unknown as number, precio: '9.00' as unknown as number },
] as unknown as Servicio[];

describe('sortServicios — orden por precio/duración con Decimal-como-string', () => {
  it('ordena por precio ASC numéricamente (no alfabéticamente)', () => {
    const sorted = sortServicios(rows, 'precio', 'asc');
    expect(sorted.map((s) => s.nombre)).toEqual(['Beta', 'Alfa', 'Zeta']); // 9 < 45 < 180
  });

  it('ordena por precio DESC numéricamente', () => {
    const sorted = sortServicios(rows, 'precio', 'desc');
    expect(sorted.map((s) => s.nombre)).toEqual(['Zeta', 'Alfa', 'Beta']);
  });

  it('ordena por duración numéricamente', () => {
    const sorted = sortServicios(rows, 'duracion', 'asc');
    expect(sorted.map((s) => s.nombre)).toEqual(['Alfa', 'Beta', 'Zeta']); // 30 < 60 < 90
  });

  it('ordena por nombre/categoría como texto', () => {
    expect(sortServicios(rows, 'nombre', 'asc').map((s) => s.nombre)).toEqual(['Alfa', 'Beta', 'Zeta']);
    expect(sortServicios(rows, 'categoria', 'asc').map((s) => s.categoria)).toEqual(['A', 'B', 'C']);
  });
});
