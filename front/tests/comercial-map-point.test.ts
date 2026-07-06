import { describe, it, expect } from 'vitest';
import { buildBoundsKey, isMappable, CONTACT_COLOR } from '@/lib/comercial/map-point';
import { ABC_COLORS } from '@/lib/comercial/marker-color';

// crm-operaos 9.12: helpers puros de la mezcla de dos capas (clientes + contactos) en el mapa.

describe('buildBoundsKey — clave de reencuadre del conjunto TOTAL', () => {
  it('incluye clientes y contactos, ordenada e independiente del orden de entrada', () => {
    const a = buildBoundsKey(['c1', 'c2'], ['k1']);
    const b = buildBoundsKey(['c2', 'c1'], ['k1']);
    expect(a).toBe(b); // el orden de entrada no cambia la clave
    expect(a).toContain('c:c1');
    expect(a).toContain('k:k1');
  });

  it('cambia cuando entra o sale un contacto (fuerza reencuadre), no en una selección', () => {
    const soloClientes = buildBoundsKey(['c1'], []);
    const conContacto = buildBoundsKey(['c1'], ['k1']);
    expect(soloClientes).not.toBe(conContacto);
    // Misma composición → misma clave (una selección/cambio de color no altera ids).
    expect(buildBoundsKey(['c1'], ['k1'])).toBe(conContacto);
  });

  it('prefijos evitan colisión entre un cliente y un contacto con el mismo id', () => {
    const key = buildBoundsKey(['x'], ['x']);
    expect(key).toBe('c:x,k:x');
  });
});

describe('isMappable — sólo puntos OK con coordenadas', () => {
  it('true con geoEstado OK y coordenadas', () => {
    expect(isMappable({ geoEstado: 'OK', latitud: 40.4, longitud: -3.7 })).toBe(true);
  });
  it('false si falta coordenada o el estado no es OK', () => {
    expect(isMappable({ geoEstado: 'OK', latitud: null, longitud: -3.7 })).toBe(false);
    expect(isMappable({ geoEstado: 'PENDING', latitud: 40.4, longitud: -3.7 })).toBe(false);
    expect(isMappable({ geoEstado: 'FAILED', latitud: 40.4, longitud: -3.7 })).toBe(false);
  });
});

describe('CONTACT_COLOR — distinto de la paleta de clientes', () => {
  it('no coincide con ningún color de categoría ABC', () => {
    expect(Object.values(ABC_COLORS)).not.toContain(CONTACT_COLOR);
  });
});
