import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildAddressQuery, isValidCoord, haversineKm } from '../geocoder.js';
import { NominatimGeocoder } from '../nominatim.js';

describe('geocoder helpers', () => {
  test('buildAddressQuery compone y omite vacíos', () => {
    assert.equal(
      buildAddressQuery({ direccion: 'Calle Mayor 1', codigoPostal: '28013', localidad: 'Madrid', provincia: null }),
      'Calle Mayor 1, 28013, Madrid',
    );
    assert.equal(buildAddressQuery({ direccion: '  ', localidad: null }), '');
  });

  test('isValidCoord valida rango', () => {
    assert.ok(isValidCoord(40.4, -3.7));
    assert.ok(!isValidCoord(91, 0));
    assert.ok(!isValidCoord(0, 200));
    assert.ok(!isValidCoord(NaN, 0));
    assert.ok(!isValidCoord('40' as unknown, 0));
  });

  test('haversineKm ~ distancia conocida (Madrid-Barcelona ≈ 505km)', () => {
    const d = haversineKm({ lat: 40.4168, lng: -3.7038 }, { lat: 41.3874, lng: 2.1686 });
    assert.ok(d > 490 && d < 520, `esperado ~505, fue ${d}`);
  });

  test('haversineKm mismo punto = 0', () => {
    assert.equal(haversineKm({ lat: 10, lng: 10 }, { lat: 10, lng: 10 }), 0);
  });
});

describe('NominatimGeocoder (fetch mockeado)', () => {
  const ok = (lat: string, lon: string) => async () => ({ ok: true, status: 200, json: async () => [{ lat, lon }] });

  test('dirección válida → coords + OK', async () => {
    const g = new NominatimGeocoder(ok('40.4168', '-3.7038') as never);
    const r = await g.geocode({ direccion: 'Puerta del Sol, Madrid' });
    assert.deepEqual(r, { lat: 40.4168, lng: -3.7038 });
  });

  test('sin resultados → null', async () => {
    const g = new NominatimGeocoder((async () => ({ ok: true, status: 200, json: async () => [] })) as never);
    assert.equal(await g.geocode({ direccion: 'xyzxyz inexistente' }), null);
  });

  test('error de red → null (no rompe el CRM)', async () => {
    const g = new NominatimGeocoder((async () => { throw new Error('network'); }) as never);
    assert.equal(await g.geocode({ direccion: 'algo' }), null);
  });

  test('query vacía → null sin llamar a la red', async () => {
    let called = false;
    const g = new NominatimGeocoder((async () => { called = true; return { ok: true, status: 200, json: async () => [] }; }) as never);
    assert.equal(await g.geocode({ direccion: '  ' }), null);
    assert.equal(called, false);
  });
});
