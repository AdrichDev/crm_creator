import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildData, buildListFilters } from '../customers.js';

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

// Parsing de filtros del GET / (crm-operaos 9.3): zona desglosada en localidad,
// provincia y codigoPostal como filtros independientes combinados por AND.
describe('customers · buildListFilters (query del listado)', () => {
  it('localidad, provincia y codigoPostal filtran cada uno su columna (AND, no OR)', () => {
    const f = buildListFilters({ localidad: 'Madrid', provincia: 'Madrid', codigoPostal: '28005' });
    assert.deepEqual(f.localidad, { contains: 'Madrid', mode: 'insensitive' });
    assert.deepEqual(f.provincia, { contains: 'Madrid', mode: 'insensitive' });
    assert.deepEqual(f.codigoPostal, { contains: '28005', mode: 'insensitive' });
    assert.equal('OR' in f, false);
  });

  it('recorta espacios e ignora valores vacíos o no string', () => {
    const f = buildListFilters({ localidad: '  Getafe ', provincia: '   ', codigoPostal: 28005 });
    assert.deepEqual(f.localidad, { contains: 'Getafe', mode: 'insensitive' });
    assert.equal('provincia' in f, false);
    assert.equal('codigoPostal' in f, false);
  });

  it('mantiene estadoVisitaId/categoriaAbc/tipoRegistro y valida sus valores', () => {
    const f = buildListFilters({ estadoVisitaId: 'ev1', categoriaAbc: 'B', tipoRegistro: 'PROSPECTO' });
    assert.equal(f.estadoVisitaId, 'ev1');
    assert.equal(f.categoriaAbc, 'B');
    assert.equal(f.tipoRegistro, 'PROSPECTO');
    const g = buildListFilters({ categoriaAbc: 'Z', tipoRegistro: 'OTRO' });
    assert.equal('categoriaAbc' in g, false);
    assert.equal('tipoRegistro' in g, false);
  });

  it('el antiguo `zona` combinado ya no se soporta (sin OR heredado)', () => {
    const f = buildListFilters({ zona: 'Madrid' });
    assert.deepEqual(f, {});
  });
});
