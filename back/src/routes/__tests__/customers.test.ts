import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildData } from '../customers.js';

// Contract tests de la whitelist de campos editables de clientes (crm-operaos 9.2:
// dirección estructurada). No tocan la BD: validan qué acepta/ignora buildData.

describe('customers · buildData (whitelist de entrada)', () => {
  it('acepta los campos de dirección estructurada (numero, piso, codigoPostal)', () => {
    const d = buildData({ direccion: 'Calle Bailen', numero: '5', piso: '3B', codigoPostal: '28005' });
    assert.equal(d.direccion, 'Calle Bailen');
    assert.equal(d.numero, '5');
    assert.equal(d.piso, '3B');
    assert.equal(d.codigoPostal, '28005');
  });

  it('ignora campos fuera de la whitelist (derivados y desconocidos)', () => {
    const d = buildData({ numero: '5', visitas: 99, gastoTotal: 1000, hack: 'x' });
    assert.equal(d.numero, '5');
    assert.equal('visitas' in d, false);
    assert.equal('gastoTotal' in d, false);
    assert.equal('hack' in d, false);
  });

  it('sigue partiendo nombre en nombre/apellido (sin regresión)', () => {
    const d = buildData({ nombre: 'Ana García', piso: '1A' });
    assert.equal(d.nombre, 'Ana');
    assert.equal(d.apellido, 'García');
    assert.equal(d.piso, '1A');
  });
});
