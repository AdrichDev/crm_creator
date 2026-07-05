import { describe, it, expect } from 'vitest';
import { shortClienteId } from '@/lib/utils/format';

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
