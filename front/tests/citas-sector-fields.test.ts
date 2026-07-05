import { describe, it, expect } from 'vitest';
import { CITAS_SECTOR_FIELDS } from '@/lib/config/citas-sector-fields';
import { VERTICALS } from '@/lib/config/verticals';

const REPRESENTATIVOS = ['centro-deportivo', 'fitness', 'comerciales'] as const;

describe('CITAS_SECTOR_FIELDS', () => {
  it('los 3 verticales representativos tienen entrada con formComponent correcto', () => {
    expect(CITAS_SECTOR_FIELDS['centro-deportivo']?.formComponent).toBe('entrenamiento');
    expect(CITAS_SECTOR_FIELDS.fitness?.formComponent).toBe('clase');
    expect(CITAS_SECTOR_FIELDS.comerciales?.formComponent).toBe('reunion');
  });

  it('centro-deportivo NO tiene columna "Cliente" (sustituida por Equipo)', () => {
    expect(CITAS_SECTOR_FIELDS['centro-deportivo']?.columns).toContain('Equipo');
    expect(CITAS_SECTOR_FIELDS['centro-deportivo']?.columns).not.toContain('Cliente');
  });

  it('comerciales usa "Cliente", no "Cuenta" (jerga corporativa descartada por producto)', () => {
    expect(CITAS_SECTOR_FIELDS.comerciales?.columns).toContain('Cliente');
    expect(CITAS_SECTOR_FIELDS.comerciales?.columns).not.toContain('Cuenta');
  });

  it('los 8 verticales no representativos no tienen entrada (caen al genérico) — spec C-S1/C-S8', () => {
    for (const v of VERTICALS) {
      if ((REPRESENTATIVOS as readonly string[]).includes(v.id)) continue;
      expect(CITAS_SECTOR_FIELDS[v.id]).toBeUndefined();
    }
  });

  it('cada entrada representativa tiene al menos 4 columnas (siempre incluye Estado)', () => {
    for (const id of REPRESENTATIVOS) {
      const def = CITAS_SECTOR_FIELDS[id]!;
      expect(def.columns.length).toBeGreaterThanOrEqual(4);
      expect(def.columns).toContain('Estado');
    }
  });
});
