// S2 — el cron `digestScheduler` corre con la guarda de tenancy activa.
//
// Las dependencias de producción del digest se construyen sobre el singleton extendido
// (`src/prisma.ts`). Este test las ejercita con un Prisma de mentira instalado en
// `globalThis.prisma` (mismo mecanismo que `_fake-prisma` en los tests de rutas) y comprueba:
//   1. Las consultas que NO pueden llevar negocio (marcar un digest como enviado) van dentro
//      de `runUnscoped` con el motivo DOCUMENTADO en el código (S2, última viñeta).
//   2. Las que sí pueden (resolver la fila existente por su clave única) llevan `businessId`
//      en el nivel superior del `where`, que es la forma que la guarda acepta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertTenantScoped, currentUnscopedReason, isUnscoped } from '../tenant-scope.js';

interface RecordedCall {
  op: string;
  args: unknown;
  reason: string | undefined;
  unscoped: boolean;
}

const calls: RecordedCall[] = [];
let failCreateWithP2002 = false;

const record = (op: string, result: unknown) => async (args: unknown) => {
  calls.push({ op, args, reason: currentUnscopedReason(), unscoped: isUnscoped() });
  if (op === 'notification.create' && failCreateWithP2002) {
    throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
  }
  return typeof result === 'function' ? (result as () => unknown)() : result;
};

// El singleton de src/prisma.ts es un Proxy perezoso sobre `globalThis.prisma`: se instala
// el doble ANTES de importar el scheduler para que las deps de producción lo resuelvan.
(globalThis as { prisma?: unknown }).prisma = {
  notification: {
    create: record('notification.create', { id: 'n1' }),
    findUnique: record('notification.findUnique', null),
    update: record('notification.update', { id: 'n1' }),
  },
};

const { buildProdDeps } = await import('../digestScheduler.js');

test('markSent corre dentro de runUnscoped con el motivo documentado', async () => {
  calls.length = 0;
  const deps = buildProdDeps();
  await deps.markSent('n1');

  assert.equal(calls.length, 1);
  const [call] = calls;
  assert.equal(call.op, 'notification.update');
  assert.equal(call.unscoped, true, 'la consulta debe ejecutarse dentro de runUnscoped');
  assert.equal(
    call.reason,
    'digestScheduler: marcar como enviado el digest por id (fila creada/listada en esta pasada)',
  );
  assert.deepEqual((call.args as { where: unknown }).where, { id: 'n1' });
});

test('createDigestRow manda businessId en el nivel superior del where (forma que la guarda acepta)', async () => {
  calls.length = 0;
  failCreateWithP2002 = true;
  try {
    const deps = buildProdDeps();
    const result = await deps.createDigestRow({
      businessId: 'A',
      tipo: 'digest.weekly.admin',
      destino: 'admin@example.com',
      payload: { hola: 1 },
      programadoEn: new Date('2026-01-05T08:00:00.000Z'),
    });
    assert.equal(result.created, false);
  } finally {
    failCreateWithP2002 = false;
  }

  const findUnique = calls.find((c) => c.op === 'notification.findUnique');
  assert.ok(findUnique, 'el camino P2002 debe releer la fila existente');
  const where = (findUnique!.args as { where: Record<string, unknown> }).where;
  assert.equal(where.businessId, 'A');
  // La forma exacta que valida la guarda: si el `businessId` solo viajara anidado en la
  // clave compuesta, `assertTenantScoped` lanzaría y el cron fallaría en producción.
  assert.doesNotThrow(() => assertTenantScoped('Notification', 'findUnique', findUnique!.args));
});
