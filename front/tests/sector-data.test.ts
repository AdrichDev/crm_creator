import { describe, it, expect } from 'vitest';
import { clientesMock, serviciosMock, documentosMock, documentTypes, clienteExtraFields } from '@/lib/config/sector-data';
import { VERTICAL_MAP } from '@/lib/config/verticals';

describe('UC-1 · clientes mock por sector', () => {
  it('AC-1.1 veterinario: especie/raza/nombreMascota + informe veterinario', () => {
    const cs = clientesMock('veterinario');
    expect(cs.length).toBeGreaterThan(0);
    for (const c of cs) {
      expect(c.extra?.especie).toBeTruthy();
      expect(c.extra?.raza).toBeTruthy();
      expect(c.extra?.nombreMascota).toBeTruthy();
    }
    expect(cs[0].documentos?.[0].tipo).toBe('Informe veterinario');
  });

  it('AC-1.2 clínica: numHistoria + informe médico', () => {
    const cs = clientesMock('clinica');
    expect(cs.every((c) => !!c.extra?.numHistoria)).toBe(true);
    expect(cs[0].documentos?.[0].tipo).toBe('Informe médico');
  });

  it('AC-1.3 abogados: numExpediente + escrito/contrato/sentencia', () => {
    const cs = clientesMock('abogados');
    expect(cs.every((c) => !!c.extra?.numExpediente)).toBe(true);
    expect(documentTypes('abogados')).toContain(cs[0].documentos![0].tipo);
  });

  it('AC-1.4 sector sin extensión no rompe (peluquería)', () => {
    const cs = clientesMock('peluqueria');
    expect(cs.length).toBeGreaterThan(0);
    expect(clienteExtraFields('peluqueria')).toEqual([]);
    expect(cs[0].documentos?.[0].tipo).toBe('Factura'); // tipo por defecto
  });
});

describe('UC-2 · servicios/tarifas por sector', () => {
  it('AC-2.1 abogados: categorías de caso con duración y precio', () => {
    const s = serviciosMock('abogados');
    const cats = s.map((x) => x.categoria);
    for (const esperada of ['Divorcio', 'Penal', 'Violencia de género', 'Hurto']) {
      expect(cats).toContain(esperada);
    }
    for (const x of s) {
      expect(typeof x.duracion).toBe('number');
      expect(typeof x.precio).toBe('number');
    }
  });

  it('AC-2.2 veterinario: no hay "corte de pelo"', () => {
    const nombres = serviciosMock('veterinario').map((x) => x.nombre.toLowerCase());
    expect(nombres.some((n) => n.includes('corte de pelo'))).toBe(false);
  });

  it('AC-2.3 peluquería: incluye un corte', () => {
    const nombres = serviciosMock('peluqueria').map((x) => x.nombre.toLowerCase());
    expect(nombres.some((n) => n.includes('corte'))).toBe(true);
  });

  it('AC-2.4 terminología abogados: servicios → "Tarifas"', () => {
    expect(VERTICAL_MAP.abogados.terminology.servicios).toBe('Tarifas');
  });
});

describe('UC-3 · documentos por sector', () => {
  it('AC-3.1/3.2 tipos del sector y metadatos válidos', () => {
    for (const v of ['veterinario', 'clinica', 'abogados', 'taller'] as const) {
      const docs = documentosMock(v);
      expect(docs.length).toBeGreaterThan(0);
      expect(documentTypes(v)).toContain(docs[0].tipo);
      expect(docs[0].tam).toBeGreaterThan(0);
      expect(docs[0].fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
