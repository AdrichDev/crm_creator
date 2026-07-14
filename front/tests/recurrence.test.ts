import { describe, it, expect } from 'vitest';
import { recurrenceDates, RECURRENCE_CAP } from '@/lib/citas/recurrence';

describe('recurrenceDates', () => {
  it('puntual → solo la fecha base', () => {
    expect(recurrenceDates('2026-07-14', 'puntual', 5)).toEqual(['2026-07-14']);
  });

  it('diaria → N días consecutivos', () => {
    expect(recurrenceDates('2026-07-14', 'diaria', 3)).toEqual(['2026-07-14', '2026-07-15', '2026-07-16']);
  });

  it('diaria cruza fin de mes', () => {
    expect(recurrenceDates('2026-07-30', 'diaria', 3)).toEqual(['2026-07-30', '2026-07-31', '2026-08-01']);
  });

  it('mensual → mismo día cada mes', () => {
    expect(recurrenceDates('2026-01-15', 'mensual', 3)).toEqual(['2026-01-15', '2026-02-15', '2026-03-15']);
  });

  it('mensual clamp: 31 ene → último día de meses cortos', () => {
    expect(recurrenceDates('2026-01-31', 'mensual', 3)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });

  it('mensual cruza año', () => {
    expect(recurrenceDates('2026-11-10', 'mensual', 3)).toEqual(['2026-11-10', '2026-12-10', '2027-01-10']);
  });

  it('anual → mismo día cada año', () => {
    expect(recurrenceDates('2026-03-01', 'anual', 3)).toEqual(['2026-03-01', '2027-03-01', '2028-03-01']);
  });

  it('anual clamp: 29 feb bisiesto → 28 feb en no bisiesto', () => {
    expect(recurrenceDates('2028-02-29', 'anual', 2)).toEqual(['2028-02-29', '2029-02-28']);
  });

  it('acota al cap', () => {
    expect(recurrenceDates('2026-01-01', 'diaria', 1000).length).toBe(RECURRENCE_CAP);
  });

  it('fecha vacía → []', () => {
    expect(recurrenceDates('', 'diaria', 3)).toEqual([]);
  });
});
