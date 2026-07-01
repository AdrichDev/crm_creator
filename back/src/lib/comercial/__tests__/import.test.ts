import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { planImport, type ExistingCustomer, type ImportRow } from '../import.js';

const existing: ExistingCustomer[] = [
  { id: 'c1', nombre: 'Ana', apellido: 'Gómez', telefono: '600 555 666', direccion: 'Calle Mayor 1' },
  { id: 'c2', nombre: 'Luis', apellido: 'Pérez', telefono: null, direccion: 'Avda Sol 5' },
];

describe('planImport (dedupe RF-03)', () => {
  test('duplicado por teléfono (ignora formato)', () => {
    const rows: ImportRow[] = [{ nombre: 'Ana Gómez', telefono: '+34600555666' }];
    const plan = planImport(rows, existing);
    assert.equal(plan.nuevos.length, 0);
    assert.equal(plan.duplicados.length, 1);
    assert.equal(plan.duplicados[0].motivo, 'telefono');
    assert.equal(plan.duplicados[0].matchId, 'c1');
  });

  test('duplicado por nombre+dirección (ignora tildes/mayúsculas)', () => {
    const rows: ImportRow[] = [{ nombre: 'LUIS PEREZ', direccion: 'avda sol 5' }];
    const plan = planImport(rows, existing);
    assert.equal(plan.duplicados.length, 1);
    assert.equal(plan.duplicados[0].motivo, 'nombre+direccion');
    assert.equal(plan.duplicados[0].matchId, 'c2');
  });

  test('fila nueva sin coincidencia', () => {
    const rows: ImportRow[] = [{ nombre: 'Marta Ruiz', telefono: '611222333', direccion: 'Otra Calle 9' }];
    const plan = planImport(rows, existing);
    assert.equal(plan.nuevos.length, 1);
    assert.equal(plan.duplicados.length, 0);
  });

  test('mismo nombre pero distinta dirección → NO es duplicado', () => {
    const rows: ImportRow[] = [{ nombre: 'Ana Gómez', direccion: 'Calle Distinta 99' }];
    const plan = planImport(rows, existing);
    assert.equal(plan.nuevos.length, 1);
    assert.equal(plan.duplicados.length, 0);
  });
});
