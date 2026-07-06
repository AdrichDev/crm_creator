import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildContactosWhere,
  buildContactosOrderBy,
  buildPendingCountWhere,
  contactadoEnPatch,
  defaultContactado,
  nextContactoCodigo,
  dayRange,
  createContactoSchema,
  updateContactoSchema,
  convertContactosSchema,
  contactoTieneDireccion,
  contactoGeoFields,
} from '../contactos.js';

// Contract/unit tests de las funciones puras de la agenda de contactos (crm-operaos WU4).
// No tocan la BD: validan la lógica de negocio replicada de Agents Agency.

describe('contactos · defaultContactado', () => {
  it('nuevos contactos entran como "no" (pendientes de contactar)', () => {
    assert.equal(defaultContactado(), 'no');
    assert.equal(defaultContactado(undefined), 'no');
  });
  it('respeta un valor explícito', () => {
    assert.equal(defaultContactado('si'), 'si');
    assert.equal(defaultContactado('nc'), 'nc');
  });
});

describe('contactos · contactadoEnPatch', () => {
  const now = new Date('2026-07-05T10:00:00Z');
  it('pasar a "si" sella la fecha si no estaba sellada', () => {
    assert.deepEqual(contactadoEnPatch('si', { contactadoEn: null }, now), { contactadoEn: now });
  });
  it('pasar a "si" no re-sella si ya tenía fecha', () => {
    const prev = new Date('2026-01-01T00:00:00Z');
    assert.deepEqual(contactadoEnPatch('si', { contactadoEn: prev }, now), {});
  });
  it('pasar a "no" o "nc" limpia la fecha', () => {
    assert.deepEqual(contactadoEnPatch('no', { contactadoEn: now }, now), { contactadoEn: null });
    assert.deepEqual(contactadoEnPatch('nc', { contactadoEn: now }, now), { contactadoEn: null });
  });
  it('sin cambio de estado no toca la fecha', () => {
    assert.deepEqual(contactadoEnPatch(undefined, { contactadoEn: now }, now), {});
  });
});

describe('contactos · nextContactoCodigo', () => {
  it('arranca en pc-01 sin códigos previos', () => {
    assert.equal(nextContactoCodigo([]), 'pc-01');
  });
  it('incrementa desde el máximo, ignorando saltos', () => {
    assert.equal(nextContactoCodigo(['pc-01', 'pc-03', 'pc-02']), 'pc-04');
  });
  it('supera el rango de dos dígitos', () => {
    assert.equal(nextContactoCodigo(['pc-99']), 'pc-100');
  });
});

describe('contactos · buildContactosWhere', () => {
  it('siempre acota por negocio y excluye borrados', () => {
    const w = buildContactosWhere('b1', {});
    assert.equal(w.businessId, 'b1');
    assert.equal(w.eliminadoEn, null);
    assert.equal(w.tipo, undefined);
  });
  it('aplica filtros de tipo y contactado', () => {
    const w = buildContactosWhere('b1', { tipo: 'lead', contactado: 'no' });
    assert.equal(w.tipo, 'lead');
    assert.equal(w.contactado, 'no');
  });
  it('genera OR de búsqueda cuando hay término', () => {
    const w = buildContactosWhere('b1', { search: 'ana' });
    assert.ok(Array.isArray(w.OR));
    assert.equal((w.OR as unknown[]).length, 5);
  });
  it('ya no aplica filtros por campo (código/nombre/email/sector/fecha retirados de la tabla)', () => {
    // Estos params fueron reemplazados por ordenación de cabecera; el where los ignora.
    const w = buildContactosWhere('b1', { search: 'ana' } as { search?: string });
    assert.ok(Array.isArray(w.OR));
    assert.equal(w.codigo, undefined);
    assert.equal(w.createdAt, undefined);
  });
});

describe('contactos · buildContactosOrderBy (ordenación por cabecera)', () => {
  it('sin sort → orden por defecto createdAt desc (comportamiento previo)', () => {
    assert.deepEqual(buildContactosOrderBy({}), { createdAt: 'desc' });
  });
  it('campo de la whitelist con order asc/desc', () => {
    assert.deepEqual(buildContactosOrderBy({ sort: 'nombre', order: 'asc' }), { nombre: 'asc' });
    assert.deepEqual(buildContactosOrderBy({ sort: 'codigo', order: 'desc' }), { codigo: 'desc' });
    assert.deepEqual(buildContactosOrderBy({ sort: 'sector' }), { sector: 'desc' });
  });
  it('acepta todos los campos ordenables declarados', () => {
    for (const f of ['codigo', 'tipo', 'nombre', 'email', 'sector', 'createdAt']) {
      assert.deepEqual(buildContactosOrderBy({ sort: f, order: 'asc' }), { [f]: 'asc' });
    }
  });
  it('campo fuera de la whitelist → default (no inyecta columnas arbitrarias)', () => {
    assert.deepEqual(buildContactosOrderBy({ sort: 'telefono', order: 'asc' }), { createdAt: 'desc' });
    assert.deepEqual(buildContactosOrderBy({ sort: 'contactado' }), { createdAt: 'desc' });
  });
});

describe('contactos · buildPendingCountWhere (badge del sidebar)', () => {
  it('acota SIEMPRE por negocio, excluye borrados y solo cuenta contactado != "si"', () => {
    assert.deepEqual(buildPendingCountWhere('b1'), {
      businessId: 'b1', eliminadoEn: null, contactado: { not: 'si' },
    });
  });
  it('nunca es un conteo global: businessId de un negocio nunca contamina el de otro', () => {
    const wa = buildPendingCountWhere('negocio-a');
    const wb = buildPendingCountWhere('negocio-b');
    assert.notEqual(wa.businessId, wb.businessId);
  });
});

describe('contactos · dayRange', () => {
  it('devuelve [inicio del día, inicio del día siguiente)', () => {
    const r = dayRange('2026-01-15');
    assert.ok(r);
    assert.deepEqual(r!.gte, new Date('2026-01-15T00:00:00.000'));
    assert.deepEqual(r!.lt, new Date('2026-01-16T00:00:00.000'));
  });
  it('devuelve undefined para strings no parseables', () => {
    assert.equal(dayRange('not-a-date'), undefined);
  });
});

describe('contactos · schemas zod', () => {
  it('create exige nombre y rechaza email inválido', () => {
    assert.equal(createContactoSchema.safeParse({ nombre: '' }).success, false);
    assert.equal(createContactoSchema.safeParse({ nombre: 'Ana', email: 'no-mail' }).success, false);
    const ok = createContactoSchema.safeParse({ nombre: 'Ana', tipo: 'lead' });
    assert.equal(ok.success, true);
    assert.equal(ok.success && ok.data.tipo, 'lead');
  });
  it('create default tipo = prospecto', () => {
    const r = createContactoSchema.safeParse({ nombre: 'Ana' });
    assert.equal(r.success && r.data.tipo, 'prospecto');
  });
  it('update admite null para limpiar campos opcionales', () => {
    assert.equal(updateContactoSchema.safeParse({ telefono: null, sector: null }).success, true);
  });
  // crm-operaos 9.2: dirección estructurada en contactos.
  it('create acepta numero, piso y codigoPostal estructurados', () => {
    const r = createContactoSchema.safeParse({
      nombre: 'Ana', direccion: 'Calle Bailen', numero: '5', piso: '3B', codigoPostal: '28005',
    });
    assert.equal(r.success, true);
    assert.equal(r.success && r.data.numero, '5');
    assert.equal(r.success && r.data.piso, '3B');
    assert.equal(r.success && r.data.codigoPostal, '28005');
  });
  it('update admite null para limpiar numero/piso/codigoPostal', () => {
    assert.equal(updateContactoSchema.safeParse({ numero: null, piso: null, codigoPostal: null }).success, true);
    const r = updateContactoSchema.safeParse({ numero: '12', piso: 'Bajo A', codigoPostal: '28013' });
    assert.equal(r.success, true);
    assert.equal(r.success && r.data.piso, 'Bajo A');
  });
  it('convert exige al menos un id', () => {
    assert.equal(convertContactosSchema.safeParse({ ids: [] }).success, false);
    assert.equal(convertContactosSchema.safeParse({ ids: ['x'] }).success, true);
  });
});

// crm-operaos 9.12: geolocalización de contactos para el mapa comercial.
describe('contactos · contactoTieneDireccion', () => {
  it('true si hay calle, localidad o código postal con contenido', () => {
    assert.equal(contactoTieneDireccion({ direccion: 'Calle Mayor 1' }), true);
    assert.equal(contactoTieneDireccion({ localidad: 'Madrid' }), true);
    assert.equal(contactoTieneDireccion({ codigoPostal: '28013' }), true);
  });
  it('false sin dirección o con campos vacíos/nulos', () => {
    assert.equal(contactoTieneDireccion({}), false);
    assert.equal(contactoTieneDireccion({ direccion: '   ', localidad: null, codigoPostal: '' }), false);
  });
});

describe('contactos · contactoGeoFields', () => {
  it('sin dirección → no toca el estado geo (objeto vacío)', () => {
    assert.deepEqual(contactoGeoFields(false, { lat: 1, lng: 2 }), {});
  });
  it('con dirección resuelta → OK + coordenadas', () => {
    assert.deepEqual(contactoGeoFields(true, { lat: 40.4, lng: -3.7 }), { latitud: 40.4, longitud: -3.7, geoEstado: 'OK' });
  });
  it('con dirección no resuelta → FAILED sin coordenadas', () => {
    assert.deepEqual(contactoGeoFields(true, null), { geoEstado: 'FAILED' });
  });
});
