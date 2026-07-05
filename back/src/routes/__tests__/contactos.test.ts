import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildContactosWhere,
  contactadoEnPatch,
  defaultContactado,
  nextContactoCodigo,
  createContactoSchema,
  updateContactoSchema,
  convertContactosSchema,
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
  it('convert exige al menos un id', () => {
    assert.equal(convertContactosSchema.safeParse({ ids: [] }).success, false);
    assert.equal(convertContactosSchema.safeParse({ ids: ['x'] }).success, true);
  });
});
