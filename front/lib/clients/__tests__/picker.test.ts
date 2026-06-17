import { describe, it, expect } from 'vitest';
import { sortClientsByName, filterClientsByName, prepareClientOptions, MAX_VISIBLE, type ClientLite } from '@/lib/clients/picker';

const mk = (nombre: string): ClientLite => ({ id: nombre, nombre });

describe('UC-5 · selector de clientes', () => {
  it('AC-5.1 ordena alfabéticamente (case-insensitive, es)', () => {
    const out = sortClientsByName([mk('Zoe'), mk('ana'), mk('Álvaro'), mk('beto')]);
    expect(out.map((c) => c.nombre)).toEqual(['Álvaro', 'ana', 'beto', 'Zoe']);
  });

  it('AC-5.3 filtra por nombre (substring, case-insensitive)', () => {
    const list = [mk('Lucía Fernández'), mk('Marcos Ruiz'), mk('Ana Gómez')];
    expect(filterClientsByName(list, 'ar').map((c) => c.nombre)).toEqual(['Marcos Ruiz']);
    expect(filterClientsByName(list, '').length).toBe(3);
  });

  it('AC-5.2 marca scroll cuando hay más de 20', () => {
    const many = Array.from({ length: 25 }, (_, i) => mk(`Cliente ${String(i).padStart(2, '0')}`));
    const { total, hayScroll, ordenados } = prepareClientOptions(many);
    expect(total).toBe(25);
    expect(hayScroll).toBe(true);
    expect(ordenados.length).toBe(25); // se muestran todos; el scroll lo gestiona la UI con MAX_VISIBLE
    expect(MAX_VISIBLE).toBe(20);
  });

  it('pocos clientes → sin scroll', () => {
    expect(prepareClientOptions([mk('A'), mk('B')]).hayScroll).toBe(false);
  });
});
