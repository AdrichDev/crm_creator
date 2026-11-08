// S3 — con la guarda de tenancy ACTIVA en el `_fake-prisma`, toda escritura por id de las
// rutas existentes viaja acotada al negocio: `where: { id, businessId }`. Antes del cambio
// de T2 el `where` era `{ id }` y la guarda (o el propio negocio) no podía demostrar nada.
//
// Se cubren las dos superficies:
//   - `crudRouter` (compartido por /locations, /services, /products, /resources, /tags,
//     /campaigns, /fichajes, /sales): PATCH y DELETE (soft delete).
//   - rutas escritas a mano con escritura por id (PATCH /reminders/:id, DELETE).
//
// La aserción es sobre los argumentos REGISTRADOS por el doble, no sobre la respuesta: es el
// `where` lo que decide el aislamiento.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installFakePrisma, call } from './_fake-prisma.js';
import { TenantScopeError } from '../../lib/tenant-scope.js';

const fake = installFakePrisma();
const { crudRouter } = await import('../../lib/crud.js');
const { remindersRouter } = await import('../reminders.js');

const live = { eliminadoEn: null };
const seed = {
  tag: [{ id: 'tagA', businessId: 'A', nombre: 'VIP', ...live }],
  reminder: [{ id: 'remA', businessId: 'A', titulo: 'Llamar', estado: 'PENDING', ...live }],
  customer: [{ id: 'cA', businessId: 'A', nombre: 'Cli A', ...live }],
};

beforeEach(() => fake.reset(seed));

type UpdateWrite = { where?: Record<string, unknown>; data?: Record<string, unknown> };

function updatesTo(model: string): UpdateWrite[] {
  return fake.writesTo(model).filter((w) => w.op === 'update').map((w) => w.args as UpdateWrite);
}

describe('crudRouter · escrituras acotadas al negocio', () => {
  const tags = crudRouter('tag', { fields: ['nombre', 'color'] });

  test('PATCH /:id manda { id, businessId } en el where', async () => {
    const r = await call(tags, 'PATCH', '/tagA', { nombre: 'VIP+' });
    assert.equal(r.status, 200);
    const [update] = updatesTo('tag');
    assert.deepEqual(update.where, { id: 'tagA', businessId: 'A' });
  });

  test('DELETE /:id (soft delete) manda { id, businessId } en el where', async () => {
    const r = await call(tags, 'DELETE', '/tagA');
    assert.equal(r.status, 204);
    const [update] = updatesTo('tag');
    assert.deepEqual(update.where, { id: 'tagA', businessId: 'A' });
    assert.ok(update.data?.eliminadoEn instanceof Date);
  });

  test('un id de otro negocio sigue respondiendo 404 sin escribir', async () => {
    const r = await call(tags, 'PATCH', '/tagB', { nombre: 'Ajeno' });
    assert.equal(r.status, 404);
    assert.equal(updatesTo('tag').length, 0);
  });
});

describe('reminders · escritura por id acotada al negocio', () => {
  test('PATCH /:id manda { id, businessId } en el where', async () => {
    const r = await call(remindersRouter, 'PATCH', '/remA', { titulo: 'Llamar otra vez' });
    assert.equal(r.status, 200);
    const [update] = updatesTo('reminder');
    assert.deepEqual(update.where, { id: 'remA', businessId: 'A' });
  });

  test('DELETE /:id manda { id, businessId } en el where', async () => {
    const r = await call(remindersRouter, 'DELETE', '/remA');
    assert.equal(r.status, 204);
    const [update] = updatesTo('reminder');
    assert.deepEqual(update.where, { id: 'remA', businessId: 'A' });
  });
});

describe('el doble de Prisma aplica la guarda a todo delegado (incluido tx)', () => {
  test('una lectura sin negocio lanza TenantScopeError', () => {
    const client = fake.client as unknown as { customer: { findMany: (a: unknown) => unknown } };
    assert.throws(() => client.customer.findMany({ where: {} }), TenantScopeError);
  });

  test('el cliente de la transacción también está guardado', async () => {
    const client = fake.client as unknown as {
      $transaction: (fn: (tx: { customer: { findMany: (a: unknown) => unknown } }) => Promise<unknown>) => Promise<unknown>;
    };
    await assert.rejects(
      client.$transaction(async (tx) => tx.customer.findMany({ where: {} })),
      TenantScopeError,
    );
  });

  test('runUnscoped deja pasar la misma consulta sin negocio', async () => {
    const { runUnscoped } = await import('../../lib/tenant-scope.js');
    const client = fake.client as unknown as { customer: { findMany: (a: unknown) => Promise<unknown[]> } };
    const rows = await runUnscoped('test: consulta cross-tenant explícita', async () =>
      await client.customer.findMany({ where: {} }),
    );
    assert.equal(rows.length, 1);
  });
});
