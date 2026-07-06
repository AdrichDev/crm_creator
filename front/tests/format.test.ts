import { describe, it, expect } from 'vitest';
import { shortClienteId, eur } from '@/lib/utils/format';

// eur: convención AA — símbolo € SIEMPRE detrás del número (nunca "€1234").
describe('eur', () => {
  it('coloca el símbolo € detrás del importe', () => {
    expect(eur(200)).toBe('200 €');
    expect(eur(1452).endsWith(' €')).toBe(true);
    expect(eur(1452).startsWith('€')).toBe(false);
  });
});

// shortClienteId: código visual "Id Cliente" en Cartera de Clientes (no existe
// columna `codigo` en el modelo Customer, es puramente de presentación).
describe('shortClienteId', () => {
  it('toma los últimos 6 caracteres de un cuid (API) en mayúsculas, con prefijo CLI-', () => {
    expect(shortClienteId('cmr0sk6hi000130fxokfryd72')).toBe('CLI-FRYD72');
  });

  it('funciona con un id numérico (modo generador/mock)', () => {
    expect(shortClienteId(1)).toBe('CLI-1');
    expect(shortClienteId(1735689600123)).toBe('CLI-600123');
  });
});
