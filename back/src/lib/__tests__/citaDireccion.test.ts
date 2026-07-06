// Unit tests del mapeo cita → dirección (pin de ubicación). Runner: node --import tsx --test

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildCustomerDireccion, resolveCitaDireccion } from '../citaDireccion.js';

describe('buildCustomerDireccion', () => {
  test('solo calle', () => {
    assert.equal(buildCustomerDireccion({ direccion: 'C/ Mayor' }), 'C/ Mayor');
  });
  test('calle + número', () => {
    assert.equal(buildCustomerDireccion({ direccion: 'C/ Mayor', numero: '3' }), 'C/ Mayor 3');
  });
  test('calle + número + piso + localidad/provincia + CP', () => {
    assert.equal(
      buildCustomerDireccion({
        direccion: 'C/ Mayor', numero: '3', piso: '2ºA', localidad: 'Madrid', provincia: 'Madrid', codigoPostal: '28001',
      }),
      'C/ Mayor 3, 2ºA, Madrid, Madrid, 28001',
    );
  });
  test('sin calle → null aunque haya localidad/CP', () => {
    assert.equal(buildCustomerDireccion({ localidad: 'Madrid', codigoPostal: '28001' }), null);
  });
  test('cliente null/undefined → null', () => {
    assert.equal(buildCustomerDireccion(null), null);
    assert.equal(buildCustomerDireccion(undefined), null);
  });
});

describe('resolveCitaDireccion', () => {
  test('usa la dirección del cliente cuando existe', () => {
    assert.equal(
      resolveCitaDireccion({ direccion: 'C/ Mayor', numero: '3' }, { direccion: 'Av. Sucursal 1' }),
      'C/ Mayor 3',
    );
  });
  test('sin dirección de cliente → fallback a la sucursal', () => {
    assert.equal(resolveCitaDireccion({ direccion: null }, { direccion: 'Av. Sucursal 1' }), 'Av. Sucursal 1');
    assert.equal(resolveCitaDireccion(null, { direccion: 'Av. Sucursal 1' }), 'Av. Sucursal 1');
  });
  test('sin cliente ni sucursal con dirección → null (oculta el pin)', () => {
    assert.equal(resolveCitaDireccion(null, null), null);
    assert.equal(resolveCitaDireccion({ direccion: null }, { direccion: null }), null);
  });
});
