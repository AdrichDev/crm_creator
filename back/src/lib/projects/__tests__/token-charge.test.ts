// Unit tests de token-charge.ts (aa-token-metering-crm).
// Runner: node --import tsx --test
//
// Cubre: calculateProjectCost (fórmula), withTransientRetry (reintenta solo sobre
// códigos transitorios, no sobre errores de negocio — T4.5), y chargeTokensForProject
// (transacción update+insert con la forma de fila AC3, y soft-fail T4.6: no lanza y
// loguea una vez tras agotar reintentos).

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateProjectCost,
  withTransientRetry,
  chargeTokensForProject,
  type TokenChargeDb,
  type TokenChargeTx,
} from '../token-charge.js';
import type { ProjectConfig } from '../create-project-service.js';

// ── calculateProjectCost ──────────────────────────────────────────────────────────
describe('calculateProjectCost', () => {
  test('sin módulos → 100 (base)', () => {
    assert.equal(calculateProjectCost({} as ProjectConfig), 100);
  });

  test('3 módulos → 100 + 3*50 = 250', () => {
    assert.equal(calculateProjectCost({ modules: ['a', 'b', 'c'] } as unknown as ProjectConfig), 250);
  });

  test('modules ausente o no-array → cuenta como 0 módulos', () => {
    assert.equal(calculateProjectCost({ modules: 'no-array' } as unknown as ProjectConfig), 100);
    assert.equal(calculateProjectCost({ business: { name: 'X' } } as ProjectConfig), 100);
  });
});

// ── withTransientRetry (T4.5) ───────────────────────────────────────────────────────
describe('withTransientRetry', () => {
  test('reintenta sobre error transitorio (P1001) y devuelve el éxito del intento N', async () => {
    let attempts = 0;
    const result = await withTransientRetry(async () => {
      attempts += 1;
      if (attempts < 3) {
        const e = new Error('conexión caída') as Error & { code: string };
        e.code = 'P1001';
        throw e;
      }
      return 'ok';
    });
    assert.equal(result, 'ok');
    assert.equal(attempts, 3);
  });

  test('agota los 3 intentos si el error transitorio persiste y propaga el último', async () => {
    let attempts = 0;
    await assert.rejects(
      withTransientRetry(async () => {
        attempts += 1;
        const e = new Error('pool timeout') as Error & { code: string };
        e.code = 'P2024';
        throw e;
      }),
      /pool timeout/,
    );
    assert.equal(attempts, 3);
  });

  test('NO reintenta sobre error de negocio / código no transitorio: propaga al primer intento', async () => {
    let attempts = 0;
    await assert.rejects(
      withTransientRetry(async () => {
        attempts += 1;
        const e = new Error('saldo insuficiente') as Error & { code: string };
        e.code = 'BUSINESS_RULE';
        throw e;
      }),
      /saldo insuficiente/,
    );
    assert.equal(attempts, 1);
  });

  test('NO reintenta sobre error sin code (Error plano): propaga inmediato', async () => {
    let attempts = 0;
    await assert.rejects(
      withTransientRetry(async () => {
        attempts += 1;
        throw new Error('boom');
      }),
      /boom/,
    );
    assert.equal(attempts, 1);
  });
});

// ── chargeTokensForProject ──────────────────────────────────────────────────────────
type ExecCall = { strings: string[]; values: unknown[] };

function fakeChargeDb(behaviour?: () => void) {
  const execCalls: ExecCall[] = [];
  let txCount = 0;
  const db: TokenChargeDb = {
    $transaction: async (fn) => {
      txCount += 1;
      if (behaviour) behaviour(); // simula fallo de conexión al abrir la transacción
      const tx: TokenChargeTx = {
        $executeRaw: async (strings, ...values) => {
          execCalls.push({ strings: Array.from(strings), values });
          return 1;
        },
      };
      return fn(tx);
    },
  };
  return { db, execCalls, txCount: () => txCount };
}

describe('chargeTokensForProject', () => {
  let errors: unknown[][];
  const originalError = console.error;
  beforeEach(() => {
    errors = [];
    console.error = (...args: unknown[]) => {
      errors.push(args);
    };
  });
  afterEach(() => {
    console.error = originalError;
  });

  test('AC3: UPDATE aa.tenant + INSERT aa.uso_tokens con operacion/tokens/contexto correctos', async () => {
    const { db, execCalls, txCount } = fakeChargeDb();

    await chargeTokensForProject(db, 't-1', 250, { projectId: 'biz-9', modulesCount: 3 });

    assert.equal(txCount(), 1);
    assert.equal(execCalls.length, 2);

    // UPDATE: incremento aritmético sobre tokens_usados, param tenantId + costo.
    const update = execCalls[0];
    assert.ok(update.strings.join('').includes('UPDATE aa.tenant'));
    assert.ok(update.strings.join('').includes('tokens_usados = tokens_usados +'));
    assert.deepEqual(update.values, [250, 't-1']);

    // INSERT: operacion literal 'crm_generate', tokens=costo, contexto=json.
    const insert = execCalls[1];
    const insertSql = insert.strings.join('');
    assert.ok(insertSql.includes('INSERT INTO aa.uso_tokens'));
    assert.ok(insertSql.includes("'crm_generate'"));
    assert.ok(insertSql.includes('::jsonb'));
    assert.deepEqual(insert.values, ['t-1', 250, JSON.stringify({ projectId: 'biz-9', modulesCount: 3 })]);

    // Éxito NO se loguea.
    assert.equal(errors.length, 0);
  });

  test('T4.6: fallo transitorio persistente → agota reintentos, NO lanza y loguea UNA vez', async () => {
    const { db, txCount } = fakeChargeDb(() => {
      const e = new Error('db down') as Error & { code: string };
      e.code = 'P1001';
      throw e;
    });

    // No debe lanzar (best-effort): el proyecto ya existe y no se revierte.
    await chargeTokensForProject(db, 't-1', 100, { projectId: 'biz-1', modulesCount: 0 });

    assert.equal(txCount(), 3); // 3 intentos de la transacción completa
    assert.equal(errors.length, 1); // exactamente un log de fallo
    const logged = errors[0];
    assert.equal(logged[0], '[service-operator] fallo deduccion tokens:');
    assert.deepEqual(logged[1], { tenantId: 't-1', businessId: 'biz-1', costo: 100, error: (logged[1] as { error: unknown }).error });
  });

  test('error no transitorio → NO reintenta (1 intento), NO lanza, loguea una vez', async () => {
    const { db, txCount } = fakeChargeDb(() => {
      throw new Error('constraint inesperado');
    });

    await chargeTokensForProject(db, 't-2', 200, { projectId: 'biz-2', modulesCount: 2 });

    assert.equal(txCount(), 1);
    assert.equal(errors.length, 1);
  });
});
