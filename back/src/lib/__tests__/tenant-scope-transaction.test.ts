// S2/S3 — la guarda instalada en el cliente Prisma REAL (`$extends` en src/prisma.ts),
// no solo en el `_fake-prisma` de los tests de rutas.
//
// Contratos de runtime que no cubre la suite unitaria del módulo (`tenant-scope.test.ts`,
// que prueba el validador puro y el hook aislado):
//   1. `$extends(tenantScopeExtension)` valida TODA operación de modelo.
//   2. El `tx` de `prisma.$transaction(async (tx) => …)` HEREDA la extensión: la guarda
//      también muerde DENTRO de la transacción. Si no heredara, el cableado dejaría un
//      agujero justo en las escrituras atómicas (reservas, ventas, purgas).
//   3. `runUnscoped` sobrevive a `$transaction` (el carril de operador envuelve el router
//      entero y dentro hay transacciones: purga de negocio, lifecycle, factura de pedido).
//   4. Prisma entrega el modelo en MINÚSCULA (`employee`) en `$allOperations`, mientras la
//      clasificación de la guarda usa el nombre del datamodel (`Employee`) → se normaliza.
//      (Regresión real al cablear: sin normalizar, toda consulta caía en "modelo sin
//      clasificar" y una ruta legítima respondía 500.)
//
// NO hay base de datos: se instancia el cliente generado con un driver adapter de mentira
// (la guarda lanza ANTES de `params.query`, así que la consulta nunca llega a la "BD"). Ese
// stub no sabe ejecutar SQL de verdad, así que las aserciones del camino permitido son "la
// guarda NO lanza" (el error que llega después viene del motor, no de la tenancy).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '../generated/prisma/client.js';
import {
  assertTenantScoped,
  TenantScopeError,
  tenantScopeExtension,
  runUnscoped,
  isUnscoped,
  currentUnscopedReason,
} from '../tenant-scope.js';

type StubResult = { ok: true; value: unknown } | { ok: false; error: unknown };

const emptyResult = (): StubResult => ({
  ok: true,
  value: { columnNames: [], columnTypes: [], rows: [] },
});

/** Fábrica de driver adapter mínima (misma forma que `PrismaPg`): sin base de datos. */
function stubAdapterFactory() {
  const queryable = {
    provider: 'postgres' as const,
    adapterName: '@prisma/adapter-stub',
    queryRaw: async (): Promise<StubResult> => emptyResult(),
    executeRaw: async (): Promise<StubResult> => ({ ok: true, value: 0 }),
    executeScript: async (): Promise<void> => {},
    dispose: async (): Promise<void> => {},
  };
  const adapter = {
    ...queryable,
    startTransaction: async () => ({
      ...queryable,
      options: { usePhantomQuery: false },
      commit: async (): Promise<void> => {},
      rollback: async (): Promise<void> => {},
    }),
  };
  return { provider: 'postgres' as const, adapterName: '@prisma/adapter-stub', connect: async () => adapter };
}

/** Cliente real (generado) extendido igual que el singleton de `src/prisma.ts`. */
function extendedClient(): PrismaClient {
  return new PrismaClient({ adapter: stubAdapterFactory() as never }).$extends(
    tenantScopeExtension,
  ) as unknown as PrismaClient;
}

const isTenantScope = (error: unknown): boolean => error instanceof TenantScopeError;

/** ¿El error viene de la guarda de tenancy? (el stub del motor falla después, por diseño). */
function guardFired(error: unknown): boolean {
  return error instanceof TenantScopeError || /TenantScopeError/.test((error as Error)?.message ?? '');
}

/** Ejecuta `fn` y devuelve el error observado (o `null` si no hubo). */
async function capture(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
    return null;
  } catch (error) {
    return error;
  }
}

test('el cliente extendido: consulta sin negocio → TenantScopeError (no llega al motor)', async () => {
  const client = extendedClient();
  try {
    const error = await capture(() =>
      (client as never as { booking: { findMany: (a: unknown) => Promise<unknown> } }).booking.findMany({ where: {} }),
    );
    assert.ok(isTenantScope(error), `se esperaba TenantScopeError, llegó: ${(error as Error)?.message}`);
  } finally {
    await client.$disconnect();
  }
});

test('el cliente extendido: consulta con negocio → la guarda NO lanza', async () => {
  const client = extendedClient();
  try {
    const error = await capture(() =>
      (client as never as { booking: { findMany: (a: unknown) => Promise<unknown> } }).booking.findMany({
        where: { businessId: 'b1', eliminadoEn: null },
      }),
    );
    assert.equal(guardFired(error), false, `la guarda no debe saltar: ${(error as Error)?.message}`);
  } finally {
    await client.$disconnect();
  }
});

test('el tx de $transaction hereda la guarda: consulta sin negocio dentro de la tx → TenantScopeError', async () => {
  const client = extendedClient();
  let reachedCallback = false;
  try {
    const error = await capture(() =>
      client.$transaction(async (tx) => {
        reachedCallback = true;
        await (tx as never as { booking: { findMany: (a: unknown) => Promise<unknown[]> } }).booking.findMany({ where: {} });
      }),
    );
    assert.equal(reachedCallback, true, 'el callback de la transacción debe ejecutarse');
    assert.ok(isTenantScope(error), `se esperaba TenantScopeError dentro de la tx, llegó: ${(error as Error)?.message}`);
  } finally {
    await client.$disconnect();
  }
});

test('el tx de $transaction: consulta con negocio → la guarda NO lanza', async () => {
  const client = extendedClient();
  try {
    const error = await capture(() =>
      client.$transaction(async (tx) =>
        (tx as never as { booking: { findMany: (a: unknown) => Promise<unknown[]> } }).booking.findMany({
          where: { businessId: 'b1' },
        }),
      ),
    );
    assert.equal(guardFired(error), false, `la guarda no debe saltar: ${(error as Error)?.message}`);
  } finally {
    await client.$disconnect();
  }
});

test('runUnscoped cubre también las consultas de dentro de $transaction', async () => {
  const client = extendedClient();
  const observed: boolean[] = [];
  try {
    const error = await capture(() =>
      runUnscoped('test: cron que escribe dentro de una transacción', () =>
        client.$transaction(async (tx) => {
          observed.push(isUnscoped());
          await (tx as never as { notification: { findMany: (a: unknown) => Promise<unknown[]> } }).notification.findMany({ where: {} });
        }),
      ),
    );
    assert.deepEqual(observed, [true], 'el contexto de runUnscoped debe llegar al callback de la tx');
    assert.equal(guardFired(error), false, `la guarda no debe saltar: ${(error as Error)?.message}`);
  } finally {
    await client.$disconnect();
  }
});

test('runUnscoped sobre una consulta perezosa: hay que esperar DENTRO del wrap', async () => {
  // `prisma.x.findMany()` devuelve un PrismaPromise PEREZOSO: la guarda corre al hacer
  // `then`. Por eso los `runUnscoped` de producción envuelven una función async que espera
  // la consulta; devolver la promesa sin esperarla dejaría la guarda fuera del contexto.
  const client = extendedClient();
  try {
    const wrapped = await capture(() =>
      runUnscoped('test: consulta esperada dentro del wrap', async () =>
        (client as never as { booking: { findMany: (a: unknown) => Promise<unknown[]> } }).booking.findMany({ where: {} }),
      ),
    );
    assert.equal(guardFired(wrapped), false, `la guarda no debe saltar: ${(wrapped as Error)?.message}`);

    const leaked = await capture(() =>
      runUnscoped('test: consulta devuelta sin esperar (antipatrón)', () =>
        (client as never as { booking: { findMany: (a: unknown) => Promise<unknown[]> } }).booking.findMany({ where: {} }),
      ),
    );
    assert.ok(
      isTenantScope(leaked),
      'el PrismaPromise se resuelve fuera del wrap: la guarda debe seguir mordiendo (no es una salida)',
    );
  } finally {
    await client.$disconnect();
  }
});

test('el modelo en minúscula que entrega Prisma se clasifica igual (employee → Employee)', () => {
  assert.throws(() => assertTenantScoped('employee', 'findFirst', { where: { id: 'e1' } }), isTenantScope);
  assert.throws(() => assertTenantScoped('saleLine', 'findMany', { where: { saleId: 's1' } }), isTenantScope);
  assert.doesNotThrow(() =>
    assertTenantScoped('employee', 'findFirst', { where: { id: 'e1', businessId: 'b1' } }),
  );
  // Los modelos exentos también se reconocen en minúscula.
  assert.doesNotThrow(() => assertTenantScoped('business', 'findUnique', { where: { id: 'b1' } }));
  assert.doesNotThrow(() => assertTenantScoped('oAuthCredential', 'findMany', { where: { businessId: null } }));
});

test('runUnscoped expone su motivo durante la operación y no fuera', async () => {
  assert.equal(currentUnscopedReason(), undefined);
  const inside = await runUnscoped('digestScheduler: marcar como enviado el digest por id', async () => ({
    reason: currentUnscopedReason(),
    unscoped: isUnscoped(),
  }));
  assert.deepEqual(inside, { reason: 'digestScheduler: marcar como enviado el digest por id', unscoped: true });
  assert.equal(currentUnscopedReason(), undefined);
  assert.equal(isUnscoped(), false);
});
