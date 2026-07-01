import { describe, it, expect } from 'vitest';
import { buildMonthCells, buildWeekCells, buildDayCell, nextWeekdayAt } from '@/lib/utils/calendar';

describe('buildMonthCells', () => {
  it('alinea el día 1 según el día de la semana (lunes=0)', () => {
    // Junio 2026 empieza en lunes → 0 huecos antes del día 1.
    const cells = buildMonthCells(2026, 5);
    expect(cells[0]).toEqual({ d: 1, date: '2026-06-01' });
    expect(cells.filter((c) => c === null)).toHaveLength(0);
  });

  it('añade huecos null cuando el mes no empieza en lunes', () => {
    // Julio 2026 empieza en miércoles → 2 huecos (lunes, martes).
    const cells = buildMonthCells(2026, 6);
    expect(cells[0]).toBeNull();
    expect(cells[1]).toBeNull();
    expect(cells[2]).toEqual({ d: 1, date: '2026-07-01' });
  });

  it('incluye todos los días del mes', () => {
    const cells = buildMonthCells(2026, 1); // febrero 2026 (no bisiesto) = 28 días
    const dias = cells.filter((c) => c !== null);
    expect(dias).toHaveLength(28);
    expect(dias.at(-1)).toEqual({ d: 28, date: '2026-02-28' });
  });
});

describe('buildWeekCells', () => {
  it('devuelve 7 celdas empezando en lunes', () => {
    // 2026-06-30 es martes.
    const cells = buildWeekCells(new Date(2026, 5, 30));
    expect(cells).toHaveLength(7);
    expect(cells[0].date).toBe('2026-06-29'); // lunes
    expect(cells[6].date).toBe('2026-07-05'); // domingo
  });

  it('cruza correctamente de mes', () => {
    // 2026-07-01 es miércoles → semana 2026-06-29..2026-07-05.
    const cells = buildWeekCells(new Date(2026, 6, 1));
    expect(cells.map((c) => c.date)).toEqual([
      '2026-06-29', '2026-06-30', '2026-07-01', '2026-07-02',
      '2026-07-03', '2026-07-04', '2026-07-05',
    ]);
  });

  it('cruza correctamente de año', () => {
    // 2026-12-31 es jueves → semana 2026-12-28..2027-01-03.
    const cells = buildWeekCells(new Date(2026, 11, 31));
    expect(cells[0].date).toBe('2026-12-28');
    expect(cells[6].date).toBe('2027-01-03');
  });

  it('el día dado siempre está incluido en su propia semana', () => {
    for (let i = 0; i < 7; i++) {
      const date = new Date(2026, 5, 29 + i); // 29 jun .. 5 jul 2026
      const cells = buildWeekCells(date);
      const expected = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      expect(cells.map((c) => c.date)).toContain(expected);
    }
  });
});

describe('nextWeekdayAt', () => {
  it('mismo día de la semana, hora futura hoy → hoy mismo', () => {
    // 2026-06-30 es martes (weekday=1), 10:00; pedimos martes 18:00 → hoy 18:00.
    const from = new Date(2026, 5, 30, 10, 0);
    const r = nextWeekdayAt(1, '18:00', from);
    expect(r.toDateString()).toBe(from.toDateString());
    expect(r.getHours()).toBe(18);
  });

  it('mismo día de la semana, hora ya pasada hoy → salta a la semana siguiente', () => {
    const from = new Date(2026, 5, 30, 20, 0); // martes 20:00
    const r = nextWeekdayAt(1, '18:00', from);
    expect(r.getDate()).toBe(7); // martes siguiente (7 de julio)
    expect(r.getMonth()).toBe(6);
  });

  it('otro día de la semana → la próxima ocurrencia futura', () => {
    const from = new Date(2026, 5, 30, 10, 0); // martes
    const r = nextWeekdayAt(4, '09:00', from); // viernes
    expect(r.getDate()).toBe(3);
    expect(r.getMonth()).toBe(6); // julio
    expect(r.getHours()).toBe(9);
  });

  it('nunca devuelve una fecha anterior a "from"', () => {
    const from = new Date(2026, 5, 30, 10, 0);
    for (let wd = 0; wd < 7; wd++) {
      const r = nextWeekdayAt(wd, '00:00', from);
      expect(r.getTime()).toBeGreaterThanOrEqual(from.getTime());
    }
  });
});

describe('buildDayCell', () => {
  it('devuelve la celda del día exacto', () => {
    expect(buildDayCell(new Date(2026, 5, 15))).toEqual({ d: 15, date: '2026-06-15' });
  });
});

// ---------------------------------------------------------------------------
// Estrés: ~13 años día a día (incl. 3 bisiestos) verificando invariantes
// estructurales en cada llamada — sin asumir fechas concretas, solo reglas.
// ---------------------------------------------------------------------------
describe('calendar — estrés de rango largo (día a día, 2020-2033)', () => {
  const inicio = new Date(2020, 0, 1);
  const fin = new Date(2033, 11, 31);
  const dias: Date[] = [];
  for (let d = new Date(inicio); d <= fin; d.setDate(d.getDate() + 1)) dias.push(new Date(d));

  it(`recorre ${dias.length} días sin lanzar y cada semana cumple sus invariantes`, () => {
    expect(dias.length).toBeGreaterThan(5000); // ~14 años
    for (const dia of dias) {
      const semana = buildWeekCells(dia);
      // 1. siempre 7 celdas
      expect(semana).toHaveLength(7);
      // 2. sin huecos null y sin duplicados
      expect(semana.every((c) => c !== null)).toBe(true);
      expect(new Set(semana.map((c) => c.date)).size).toBe(7);
      // 3. consecutivos (cada celda = la anterior + 1 día)
      for (let i = 1; i < 7; i++) {
        const prev = new Date(semana[i - 1].date + 'T00:00:00');
        const next = new Date(semana[i].date + 'T00:00:00');
        expect(next.getTime() - prev.getTime()).toBe(24 * 60 * 60 * 1000);
      }
      // 4. el propio día está incluido en su semana
      const esperado = `${dia.getFullYear()}-${String(dia.getMonth() + 1).padStart(2, '0')}-${String(dia.getDate()).padStart(2, '0')}`;
      expect(semana.map((c) => c.date)).toContain(esperado);
    }
  });

  it('buildMonthCells: el nº de celdas no-null coincide con los días reales del mes, para 168 meses', () => {
    for (let y = 2020; y <= 2033; y++) {
      for (let m = 0; m < 12; m++) {
        const cells = buildMonthCells(y, m);
        const reales = new Date(y, m + 1, 0).getDate();
        const noNull = cells.filter((c) => c !== null);
        expect(noNull).toHaveLength(reales);
        // huecos iniciales (0-6) + días reales = total de celdas (sin relleno final)
        const huecos = cells.length - reales;
        expect(huecos).toBeGreaterThanOrEqual(0);
        expect(huecos).toBeLessThan(7);
      }
    }
  });

  it('buildDayCell es idempotente y coincide con d/date de buildWeekCells para el mismo día', () => {
    for (const dia of dias.filter((_, i) => i % 137 === 0)) { // muestreo: ~40 puntos del rango
      const solo = buildDayCell(dia);
      const semana = buildWeekCells(dia);
      const enSemana = semana.find((c) => c.date === solo.date);
      expect(enSemana).toEqual(solo);
    }
  });
});
