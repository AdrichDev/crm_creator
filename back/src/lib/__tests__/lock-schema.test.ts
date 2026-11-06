// Review finding R3-schema-locks: el SQL de los locks de fila no puede fijar el schema `crm`
// porque el adapter de Prisma lo resuelve como `DB_SCHEMA ?? 'crm'` (src/prisma.ts). El lock
// debe cualificar con el MISMO schema, y un valor de configuración que no sea un identificador
// válido no puede acabar interpolado en el SQL.
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { installFakePrisma } from '../../routes/__tests__/_fake-prisma.js';
import { lockSchema, lockEmployee, lockCustomerPackage, type BookingTxClient } from '../availability.js';

const fake = installFakePrisma();
const ORIGINAL = process.env.DB_SCHEMA;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.DB_SCHEMA;
  else process.env.DB_SCHEMA = ORIGINAL;
});

describe('lockSchema — mismo schema que el adapter de Prisma', () => {
  test('sin DB_SCHEMA → crm (igual que prisma.ts)', () => {
    assert.equal(lockSchema(undefined), 'crm');
  });

  test('DB_SCHEMA alternativo se respeta', () => {
    assert.equal(lockSchema('crm_alto'), 'crm_alto');
    assert.equal(lockSchema('Schema2'), 'Schema2');
  });

  test('un valor que no es un identificador válido cae a crm (no se interpela en el SQL)', () => {
    for (const bad of ['crm; DROP TABLE crm.empleado', 'crm"public', 'crm-ali', '', '  crm ', 'crm schema']) {
      assert.equal(lockSchema(bad), 'crm', `DB_SCHEMA=${JSON.stringify(bad)} debe caer a crm`);
    }
  });
});

describe('los locks cualifican con el schema configurado', () => {
  beforeEach(() => fake.reset({}));
  const rawSql = () => (fake.writes.filter((w) => w.model === '$queryRaw')[0]?.args as { query: string }).query;
  const withTx = (fn: (tx: BookingTxClient) => Promise<void>) =>
    (fake.client['$transaction'] as (cb: typeof fn) => Promise<unknown>)(fn);

  test('con DB_SCHEMA=crm_alto el lock apunta a crm_alto.empleado', async () => {
    process.env.DB_SCHEMA = 'crm_alto';
    await withTx(async (tx) => {
      await lockEmployee(tx, 'eA');
    });
    assert.equal(rawSql(), 'SELECT id FROM crm_alto.empleado WHERE id = ? FOR UPDATE');
  });

  test('con DB_SCHEMA inválido el lock sigue apuntando a crm.empleado', async () => {
    process.env.DB_SCHEMA = 'crm; DROP TABLE crm.empleado';
    await withTx(async (tx) => {
      await lockCustomerPackage(tx, 'cpA');
    });
    assert.equal(rawSql(), 'SELECT id FROM crm.paquete_cliente WHERE id = ? FOR UPDATE');
  });
});
