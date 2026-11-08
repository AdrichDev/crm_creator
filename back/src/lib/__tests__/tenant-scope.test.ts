// Tests unitarios de la guarda estructural de tenancy (S2). Sin base de datos:
// ejercitan el validador puro, la salida explícita `runUnscoped` y el hook de la
// extensión de Prisma invocado a mano. Runner: node --import tsx --test

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '../generated/prisma/client.js';
import {
  TENANT_MODELS,
  NULLABLE_TENANT_MODELS,
  CHILD_MODELS,
  EXEMPT_MODELS,
  TENANT_SCOPE_WHERE_OPS,
  TENANT_SCOPE_DATA_OPS,
  TenantScopeError,
  assertTenantScoped,
  guardDelegateCall,
  runUnscoped,
  isUnscoped,
  currentUnscopedReason,
  tenantScopeExtension,
} from '../tenant-scope.js';

const BUSINESS_ID = 'biz_A';

/** Aserción común: TenantScopeError que nombra modelo y operación. */
function throwsTenantScope(fn: () => unknown, model: string, operation: string): void {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof TenantScopeError, 'debe ser TenantScopeError');
    assert.equal((error as Error).name, 'TenantScopeError');
    assert.ok((error as Error).message.includes(model), `mensaje sin modelo ${model}`);
    assert.ok((error as Error).message.includes(operation), `mensaje sin operación ${operation}`);
    return true;
  });
}

// ----------------------------- Clasificación de modelos -----------------------------

describe('clasificación de modelos (S2/L3)', () => {
  test('todo modelo del cliente generado está clasificado en exactamente un conjunto', () => {
    const generated = Object.values(Prisma.ModelName) as string[];
    const seen = new Map<string, string[]>();
    const sets: Array<[string, readonly string[]]> = [
      ['TENANT_MODELS', TENANT_MODELS],
      ['NULLABLE_TENANT_MODELS', NULLABLE_TENANT_MODELS],
      ['CHILD_MODELS', Object.keys(CHILD_MODELS)],
      ['EXEMPT_MODELS', EXEMPT_MODELS],
    ];
    for (const [name, models] of sets) {
      for (const model of models) {
        const hits = seen.get(model) ?? [];
        hits.push(name);
        seen.set(model, hits);
      }
    }
    for (const model of generated) {
      assert.equal(seen.get(model)?.length, 1, `${model} debe estar en exactamente un conjunto`);
    }
    for (const model of seen.keys()) {
      assert.ok(generated.includes(model), `${model} clasificado pero inexistente en el cliente`);
    }
    assert.equal(generated.length, seen.size);
  });

  test('los conjuntos son disjuntos entre sí', () => {
    const sets: Array<readonly string[]> = [
      TENANT_MODELS,
      NULLABLE_TENANT_MODELS,
      Object.keys(CHILD_MODELS),
      EXEMPT_MODELS,
    ];
    for (let i = 0; i < sets.length; i++) {
      for (let j = i + 1; j < sets.length; j++) {
        const overlap = sets[i].filter((m) => sets[j].includes(m));
        assert.deepEqual(overlap, [], `conjuntos ${i} y ${j} solapados`);
      }
    }
  });

  test('cada modelo hijo declara su relación padre y la FK escalar correspondiente', () => {
    for (const [child, spec] of Object.entries(CHILD_MODELS)) {
      assert.equal(spec.relations.length, 1, `${child} debe declarar una relación padre obligatoria`);
      assert.equal(spec.foreignKeys.length, 1, `${child} debe declarar la FK de esa relación`);
      for (const relation of spec.relations) {
        assert.ok(!(TENANT_MODELS as readonly string[]).includes(relation));
      }
      for (const fk of spec.foreignKeys) {
        assert.match(fk, /Id$/);
      }
    }
  });

  test('las listas de operaciones cubren where-ops y data-ops requeridas', () => {
    for (const op of ['findUnique', 'findMany', 'updateMany', 'deleteMany', 'count', 'aggregate', 'groupBy', 'upsert']) {
      assert.ok(TENANT_SCOPE_WHERE_OPS.includes(op), `falta ${op}`);
    }
    for (const op of ['create', 'createMany']) {
      assert.ok(TENANT_SCOPE_DATA_OPS.includes(op), `falta ${op}`);
    }
    assert.ok(!TENANT_SCOPE_WHERE_OPS.includes('create'));
  });
});

// ----------------------------- Modelos con businessId -----------------------------

describe('modelos con businessId — where obligatorio', () => {
  for (const operation of TENANT_SCOPE_WHERE_OPS) {
    test(`${operation} sin businessId lanza`, () => {
      throwsTenantScope(() => assertTenantScoped('Customer', operation, { where: { id: 'x' } }), 'Customer', operation);
    });

    test(`${operation} sin where lanza`, () => {
      throwsTenantScope(() => assertTenantScoped('Customer', operation, {}), 'Customer', operation);
    });
  }

  test('businessId como cadena no vacía pasa', () => {
    assert.doesNotThrow(() => assertTenantScoped('Customer', 'findMany', { where: { businessId: BUSINESS_ID } }));
  });

  test('businessId como { equals } pasa', () => {
    assert.doesNotThrow(() =>
      assertTenantScoped('Customer', 'findFirst', { where: { businessId: { equals: BUSINESS_ID } } }),
    );
  });

  test('businessId dentro de un AND de nivel superior (array) pasa', () => {
    assert.doesNotThrow(() =>
      assertTenantScoped('Customer', 'findMany', { where: { AND: [{ eliminadoEn: null }, { businessId: BUSINESS_ID }] } }),
    );
  });

  test('businessId dentro de un AND de nivel superior (objeto) pasa', () => {
    assert.doesNotThrow(() =>
      assertTenantScoped('Booking', 'findMany', { where: { AND: { businessId: BUSINESS_ID, status: 'PENDING' } } }),
    );
  });

  test('businessId vacío lanza', () => {
    throwsTenantScope(() => assertTenantScoped('Customer', 'findMany', { where: { businessId: '' } }), 'Customer', 'findMany');
  });

  test('businessId con { equals: "" } lanza', () => {
    throwsTenantScope(
      () => assertTenantScoped('Customer', 'findMany', { where: { businessId: { equals: '' } } }),
      'Customer',
      'findMany',
    );
  });

  test('filtro { in: [...] } NO vale como businessId', () => {
    throwsTenantScope(
      () => assertTenantScoped('Customer', 'findMany', { where: { businessId: { in: [BUSINESS_ID] } } }),
      'Customer',
      'findMany',
    );
  });

  test('filtro { not } NO vale como businessId', () => {
    throwsTenantScope(
      () => assertTenantScoped('Customer', 'deleteMany', { where: { businessId: { not: 'otro' } } }),
      'Customer',
      'deleteMany',
    );
  });

  test('where con negocio anidado en una relación no cuenta como filtro propio', () => {
    throwsTenantScope(
      () => assertTenantScoped('Customer', 'findMany', { where: { business: { nombre: 'A' } } }),
      'Customer',
      'findMany',
    );
  });

  test('where anidado dentro de OR no cuenta (debe ser nivel superior)', () => {
    throwsTenantScope(
      () => assertTenantScoped('Customer', 'findMany', { where: { OR: [{ businessId: BUSINESS_ID }] } }),
      'Customer',
      'findMany',
    );
  });

  test('where con businessId nulo lanza en modelos obligatorios', () => {
    throwsTenantScope(
      () => assertTenantScoped('Customer', 'findMany', { where: { businessId: null } }),
      'Customer',
      'findMany',
    );
  });

  test('delete de un id con businessId pasa (patrón { id, businessId })', () => {
    assert.doesNotThrow(() => assertTenantScoped('Customer', 'delete', { where: { id: 'x', businessId: BUSINESS_ID } }));
  });

  test('updateManyAndReturn exige businessId', () => {
    throwsTenantScope(
      () => assertTenantScoped('Customer', 'updateManyAndReturn', { where: { eliminadoEn: null }, data: {} }),
      'Customer',
      'updateManyAndReturn',
    );
  });
});

// Formas que un revisor probó como posible BYPASS de la guarda (S2). Todas tienen que
// fallar cerrado: ninguna acota de verdad la consulta a un negocio. Las variantes que ya
// están cubiertas arriba ({ in }, { not }, OR anidado, businessId: null, …) no se repiten.
describe('no hay bypass: formas que NO acotan el negocio', () => {
  test('OR con una rama por negocio y otra por id no acota (devuelve filas ajenas)', () => {
    throwsTenantScope(
      () =>
        assertTenantScoped('Customer', 'findMany', {
          where: { OR: [{ businessId: BUSINESS_ID }, { id: 'de_otro_negocio' }] },
        }),
      'Customer',
      'findMany',
    );
  });

  test('businessId: undefined NO acota (Prisma ignora el filtro)', () => {
    throwsTenantScope(
      () => assertTenantScoped('Customer', 'findMany', { where: { businessId: undefined } }),
      'Customer',
      'findMany',
    );
  });

  test('AND vacío no acota (no demuestra el negocio)', () => {
    throwsTenantScope(
      () => assertTenantScoped('Customer', 'findMany', { where: { AND: [] } }),
      'Customer',
      'findMany',
    );
  });

  test('businessId dentro de NOT no acota (negación, no filtro)', () => {
    throwsTenantScope(
      () => assertTenantScoped('Customer', 'findMany', { where: { NOT: { businessId: BUSINESS_ID } } }),
      'Customer',
      'findMany',
    );
  });

  test('businessId solo dentro de una relación anidada no acota el modelo con negocio', () => {
    throwsTenantScope(
      () => assertTenantScoped('Sale', 'findMany', { where: { customer: { businessId: BUSINESS_ID } } }),
      'Sale',
      'findMany',
    );
  });

  test('el delegado en minúscula se clasifica igual: oAuthCredential exige negocio explícito', () => {
    throwsTenantScope(
      () => assertTenantScoped('oAuthCredential', 'update', { where: { id: 'cred-1' }, data: { estado: 'connected' } }),
      'OAuthCredential',
      'update',
    );
    assert.doesNotThrow(() =>
      assertTenantScoped('oAuthCredential', 'update', {
        where: { id: 'cred-1', businessId: null },
        data: { estado: 'connected' },
      }),
    );
  });

  test('el delegado en minúscula se clasifica igual: tenantApiKey exige negocio', () => {
    throwsTenantScope(
      () => assertTenantScoped('tenantApiKey', 'findUnique', { where: { tokenHash: 'h' } }),
      'TenantApiKey',
      'findUnique',
    );
    assert.doesNotThrow(() =>
      assertTenantScoped('tenantApiKey', 'findUnique', { where: { id: 'k1', businessId: BUSINESS_ID } }),
    );
  });
});

describe('modelos con businessId — data obligatorio', () => {
  for (const operation of TENANT_SCOPE_DATA_OPS) {
    test(`${operation} sin businessId lanza`, () => {
      const data = operation === 'create' ? { nombre: 'Ana' } : [{ nombre: 'Ana' }];
      throwsTenantScope(() => assertTenantScoped('Customer', operation, { data }), 'Customer', operation);
    });
  }

  test('create con businessId pasa', () => {
    assert.doesNotThrow(() =>
      assertTenantScoped('Customer', 'create', { data: { nombre: 'Ana', businessId: BUSINESS_ID } }),
    );
  });

  test('create con business: { connect } pasa', () => {
    assert.doesNotThrow(() =>
      assertTenantScoped('Customer', 'create', {
        data: { nombre: 'Ana', business: { connect: { id: BUSINESS_ID } } },
      }),
    );
  });

  test('create con businessId vacío lanza', () => {
    throwsTenantScope(() => assertTenantScoped('Customer', 'create', { data: { businessId: '' } }), 'Customer', 'create');
  });

  test('create con business.connect.id vacío lanza', () => {
    throwsTenantScope(
      () => assertTenantScoped('Customer', 'create', { data: { business: { connect: { id: '' } } } }),
      'Customer',
      'create',
    );
  });

  test('createMany con todas las filas correctas pasa', () => {
    assert.doesNotThrow(() =>
      assertTenantScoped('Tag', 'createMany', {
        data: [{ nombre: 'a', businessId: BUSINESS_ID }, { nombre: 'b', businessId: BUSINESS_ID }],
      }),
    );
  });

  test('createMany con una sola fila mala lanza', () => {
    throwsTenantScope(
      () =>
        assertTenantScoped('Tag', 'createMany', {
          data: [{ nombre: 'a', businessId: BUSINESS_ID }, { nombre: 'b' }],
        }),
      'Tag',
      'createMany',
    );
  });

  test('createMany con data vacía lanza (no se puede probar el negocio)', () => {
    throwsTenantScope(() => assertTenantScoped('Tag', 'createMany', { data: [] }), 'Tag', 'createMany');
  });

  test('createManyAndReturn exige businessId por fila', () => {
    throwsTenantScope(
      () => assertTenantScoped('Tag', 'createManyAndReturn', { data: [{ nombre: 'a' }] }),
      'Tag',
      'createManyAndReturn',
    );
  });

  test('create sin data lanza', () => {
    throwsTenantScope(() => assertTenantScoped('Customer', 'create', {}), 'Customer', 'create');
  });
});

describe('upsert — where y create', () => {
  test('sin create.businessId lanza', () => {
    throwsTenantScope(
      () =>
        assertTenantScoped('BusinessSetting', 'upsert', {
          where: { businessId: BUSINESS_ID, categoria: 'x' },
          create: { categoria: 'x' },
          update: {},
        }),
      'BusinessSetting',
      'upsert',
    );
  });

  test('sin where.businessId lanza', () => {
    throwsTenantScope(
      () =>
        assertTenantScoped('BusinessSetting', 'upsert', {
          where: { categoria: 'x' },
          create: { categoria: 'x', businessId: BUSINESS_ID },
          update: {},
        }),
      'BusinessSetting',
      'upsert',
    );
  });

  test('con where y create correctos pasa', () => {
    assert.doesNotThrow(() =>
      assertTenantScoped('BusinessSetting', 'upsert', {
        where: { businessId: BUSINESS_ID, categoria: 'x' },
        create: { categoria: 'x', businessId: BUSINESS_ID },
        update: { datos: {} },
      }),
    );
  });
});

// ----------------------------- OAuthCredential (nullable) -----------------------------

describe('OAuthCredential — businessId opcional pero exigido explícito', () => {
  test('where con businessId: null pasa (credencial de plataforma)', () => {
    assert.doesNotThrow(() =>
      assertTenantScoped('OAuthCredential', 'findFirst', { where: { businessId: null, servicio: 'gmail' } }),
    );
  });

  test('where con businessId cadena pasa', () => {
    assert.doesNotThrow(() =>
      assertTenantScoped('OAuthCredential', 'findMany', { where: { businessId: BUSINESS_ID } }),
    );
  });

  test('where sin businessId lanza', () => {
    throwsTenantScope(
      () => assertTenantScoped('OAuthCredential', 'findFirst', { where: { servicio: 'gmail' } }),
      'OAuthCredential',
      'findFirst',
    );
  });

  test('create con businessId: null pasa', () => {
    assert.doesNotThrow(() =>
      assertTenantScoped('OAuthCredential', 'create', { data: { servicio: 'gmail', scope: 'admin', businessId: null } }),
    );
  });

  test('create sin businessId lanza', () => {
    throwsTenantScope(
      () => assertTenantScoped('OAuthCredential', 'create', { data: { servicio: 'gmail', scope: 'admin' } }),
      'OAuthCredential',
      'create',
    );
  });

  test('create con business: { connect } pasa', () => {
    assert.doesNotThrow(() =>
      assertTenantScoped('OAuthCredential', 'create', {
        data: { servicio: 'gmail', business: { connect: { id: BUSINESS_ID } } },
      }),
    );
  });

  test('update con businessId: null explícito pasa', () => {
    assert.doesNotThrow(() =>
      assertTenantScoped('OAuthCredential', 'update', {
        where: { id: 'x', businessId: null },
        data: { estado: 'revoked' },
      }),
    );
  });
});

// ----------------------------- Tablas hijas -----------------------------

describe('tablas hijas — filtro por el padre', () => {
  for (const [child, spec] of Object.entries(CHILD_MODELS)) {
    const [relation] = spec.relations;
    const [fk] = spec.foreignKeys;

    test(`${child}: ${TENANT_SCOPE_WHERE_OPS.join('/')} exige filtro por ${relation}`, () => {
      for (const operation of TENANT_SCOPE_WHERE_OPS) {
        // El upsert además exige la FK del padre en el create (se prueba también aparte).
        const valid =
          operation === 'upsert'
            ? { where: { [relation]: { businessId: BUSINESS_ID } }, create: { [fk]: 'parent_1' }, update: {} }
            : { where: { [relation]: { businessId: BUSINESS_ID } } };
        throwsTenantScope(
          () => assertTenantScoped(child, operation, { where: { [fk]: 'parent_1' } }),
          child,
          operation,
        );
        assert.doesNotThrow(() => assertTenantScoped(child, operation, valid));
      }
    });

    test(`${child}: create exige la FK del padre`, () => {
      for (const operation of TENANT_SCOPE_DATA_OPS) {
        const bad = operation === 'create' ? { data: {} } : [{}, {}];
        throwsTenantScope(() => assertTenantScoped(child, operation, { data: bad }), child, operation);
        const good = operation === 'create' ? { [fk]: 'parent_1' } : [{ [fk]: 'parent_1' }];
        assert.doesNotThrow(() => assertTenantScoped(child, operation, { data: good }));
      }
    });
  }

  test('SaleLine: filtro por la relación en un AND de nivel superior pasa', () => {
    assert.doesNotThrow(() =>
      assertTenantScoped('SaleLine', 'findMany', { where: { AND: [{ sale: { businessId: BUSINESS_ID } }] } }),
    );
  });

  test('SaleLine: forma { is: { businessId } } pasa', () => {
    assert.doesNotThrow(() =>
      assertTenantScoped('SaleLine', 'deleteMany', { where: { sale: { is: { businessId: BUSINESS_ID } } } }),
    );
  });

  test('SaleLine: relación con businessId vacío lanza', () => {
    throwsTenantScope(
      () => assertTenantScoped('SaleLine', 'findMany', { where: { sale: { businessId: '' } } }),
      'SaleLine',
      'findMany',
    );
  });

  test('SaleLine: create con sale.connect pasa', () => {
    assert.doesNotThrow(() =>
      assertTenantScoped('SaleLine', 'create', { data: { sale: { connect: { id: 'sale_1' } } } }),
    );
  });

  test('SaleLine: upsert exige where por el padre y FK en create', () => {
    throwsTenantScope(
      () =>
        assertTenantScoped('SaleLine', 'upsert', {
          where: { id: 'x' },
          create: { saleId: 'sale_1' },
          update: {},
        }),
      'SaleLine',
      'upsert',
    );
    throwsTenantScope(
      () =>
        assertTenantScoped('SaleLine', 'upsert', {
          where: { id: 'x', sale: { businessId: BUSINESS_ID } },
          create: {},
          update: {},
        }),
      'SaleLine',
      'upsert',
    );
    assert.doesNotThrow(() =>
      assertTenantScoped('SaleLine', 'upsert', {
        where: { id: 'x', sale: { businessId: BUSINESS_ID } },
        create: { saleId: 'sale_1' },
        update: {},
      }),
    );
  });

  test('OpeningHour: filtro por location pasa; por locationId solo, no', () => {
    assert.doesNotThrow(() =>
      assertTenantScoped('OpeningHour', 'findMany', { where: { location: { businessId: BUSINESS_ID } } }),
    );
    throwsTenantScope(
      () => assertTenantScoped('OpeningHour', 'findMany', { where: { locationId: 'loc_1' } }),
      'OpeningHour',
      'findMany',
    );
  });
});

// ----------------------------- Modelos exentos -----------------------------

describe('modelos globales exentos', () => {
  for (const model of EXEMPT_MODELS) {
    test(`${model} pasa sin businessId`, () => {
      assert.doesNotThrow(() => assertTenantScoped(model, 'findMany', {}));
      assert.doesNotThrow(() => assertTenantScoped(model, 'create', { data: { email: 'x@y.z' } }));
      assert.doesNotThrow(() => assertTenantScoped(model, 'delete', { where: { id: 'x' } }));
    });
  }
});

// ----------------------------- Modelo sin clasificar -----------------------------

describe('modelo no clasificado', () => {
  test('falla cerrado: modelo desconocido lanza', () => {
    throwsTenantScope(() => assertTenantScoped('ModeloNuevo', 'findMany', { where: {} }), 'ModeloNuevo', 'findMany');
  });
});

// ----------------------------- runUnscoped -----------------------------

describe('runUnscoped — salida explícita', () => {
  test('fuera de runUnscoped, una consulta sin negocio lanza', () => {
    assert.equal(isUnscoped(), false);
    throwsTenantScope(() => guardDelegateCall('Customer', 'findMany', { where: {} }), 'Customer', 'findMany');
  });

  test('dentro de runUnscoped la consulta sin negocio pasa y expone el motivo', () => {
    const result = runUnscoped('cron:recordatorios', () => {
      assert.equal(isUnscoped(), true);
      assert.equal(currentUnscopedReason(), 'cron:recordatorios');
      guardDelegateCall('Customer', 'findMany', { where: {} });
      return 'hecho';
    });
    assert.equal(result, 'hecho');
  });

  test('el contexto se restaura al salir', () => {
    runUnscoped('cron:recordatorios', () => {
      assert.equal(isUnscoped(), true);
    });
    assert.equal(isUnscoped(), false);
    assert.equal(currentUnscopedReason(), undefined);
    throwsTenantScope(() => guardDelegateCall('Customer', 'findMany', { where: {} }), 'Customer', 'findMany');
  });

  test('el contexto se propaga a través de await', async () => {
    await runUnscoped('cron:async', async () => {
      await Promise.resolve();
      assert.equal(isUnscoped(), true);
      guardDelegateCall('Sale', 'updateMany', { where: {} });
    });
    assert.equal(isUnscoped(), false);
  });

  test('anidado: el motivo interno sombrea y se restaura al salir', () => {
    runUnscoped('externo', () => {
      assert.equal(currentUnscopedReason(), 'externo');
      runUnscoped('interno', () => {
        assert.equal(currentUnscopedReason(), 'interno');
      });
      assert.equal(currentUnscopedReason(), 'externo');
    });
  });

  test('motivo vacío o en blanco lanza y no ejecuta la función', () => {
    let ejecutada = false;
    for (const reason of ['', '   ', '\n\t']) {
      assert.throws(
        () =>
          runUnscoped(reason, () => {
            ejecutada = true;
          }),
        /motivo/,
      );
    }
    assert.equal(ejecutada, false);
    assert.equal(isUnscoped(), false);
  });
});

// ----------------------------- Errores -----------------------------

describe('TenantScopeError', () => {
  test('nombra modelo y operación y no filtra valores del where', () => {
    assert.throws(
      () => assertTenantScoped('Customer', 'findMany', { where: { email: 'secreto@ejemplo.com' } }),
      (error: unknown) => {
        const message = (error as Error).message;
        assert.ok(message.includes('Customer'));
        assert.ok(message.includes('findMany'));
        assert.ok(!message.includes('secreto@ejemplo.com'));
        return true;
      },
    );
  });
});

// ----------------------------- Extensión de Prisma -----------------------------

type AllOperationsParams = {
  model?: string;
  operation: string;
  args: unknown;
  query: (args: unknown) => Promise<unknown>;
};

const allOperationsHook = (tenantScopeExtension as unknown as {
  query: { $allModels: { $allOperations: (params: AllOperationsParams) => Promise<unknown> } };
}).query.$allModels.$allOperations;

describe('tenantScopeExtension — hook $allModels.$allOperations', () => {
  test('sin negocio no llama a query y lanza', async () => {
    let called = false;
    await assert.rejects(
      allOperationsHook({
        model: 'Customer',
        operation: 'findMany',
        args: { where: {} },
        query: async () => {
          called = true;
          return [];
        },
      }),
      (error: unknown) => error instanceof TenantScopeError,
    );
    assert.equal(called, false);
  });

  test('con negocio llama a query y devuelve su resultado', async () => {
    const seen: unknown[] = [];
    const result = await allOperationsHook({
      model: 'Customer',
      operation: 'findMany',
      args: { where: { businessId: BUSINESS_ID } },
      query: async (args) => {
        seen.push(args);
        return [{ id: 'c1' }];
      },
    });
    assert.deepEqual(result, [{ id: 'c1' }]);
    assert.equal(seen.length, 1);
  });

  test('dentro de runUnscoped deja pasar la consulta', async () => {
    const result = await runUnscoped('cron:digest', async () =>
      allOperationsHook({
        model: 'Customer',
        operation: 'findMany',
        args: {},
        query: async () => 'ok',
      }),
    );
    assert.equal(result, 'ok');
  });

  test('modelo exento pasa tal cual', async () => {
    const result = await allOperationsHook({
      model: 'User',
      operation: 'findUnique',
      args: { where: { id: 'u1' } },
      query: async () => ({ id: 'u1' }),
    });
    assert.deepEqual(result, { id: 'u1' });
  });
});
