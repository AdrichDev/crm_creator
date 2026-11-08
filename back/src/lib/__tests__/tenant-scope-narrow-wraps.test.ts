// S2 — los dos call sites que estaban JUSTIFICADOS con `runUnscoped` ya tienen el negocio
// disponible en su firma, así que la escritura por id se acota en el `where`
// (`{ id, businessId }`) y deja de necesitar la salida explícita:
//   - `lib/calendarSync.ts`  → `updateBooking(businessId, bookingId, data)` (espejo de reserva)
//   - `lib/integrations/oauth.ts` → `updateCredential(businessId, id, data)` (credencial OAuth;
//     `businessId: null` es una credencial de PLATAFORMA y sigue siendo un `null` explícito)
//
// Sin base de datos: se instala un Prisma de mentira en `globalThis.prisma` (el singleton de
// `src/prisma.ts` es un Proxy perezoso sobre esa propiedad) y se inspeccionan los argumentos
// EXACTOS con los que se llamaría a `update`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertTenantScoped, currentUnscopedReason, isUnscoped } from '../tenant-scope.js';

interface Recorded {
  model: string;
  op: string;
  args: { where?: Record<string, unknown>; data?: unknown };
  unscoped: boolean;
  reason: string | undefined;
}

const calls: Recorded[] = [];

const record = (model: string, op: string) => async (args: Recorded['args']) => {
  calls.push({ model, op, args, unscoped: isUnscoped(), reason: currentUnscopedReason() });
  return { id: 'row-1' };
};

(globalThis as { prisma?: unknown }).prisma = {
  booking: { update: record('booking', 'update') },
  bookingStatusHistory: { create: record('bookingStatusHistory', 'create') },
  oAuthCredential: { update: record('oAuthCredential', 'update') },
};

const { buildProdDeps } = await import('../calendarSync.js');
const { defaultDeps: oauthDefaultDeps } = await import('../integrations/oauth.js');

function lastCall(model: string, op: string): Recorded {
  const found = [...calls].reverse().find((c) => c.model === model && c.op === op);
  assert.ok(found, `no se llamó a ${model}.${op}`);
  return found!;
}

test('calendarSync.updateBooking acota la escritura por negocio (sin runUnscoped)', async () => {
  calls.length = 0;
  const deps = buildProdDeps();
  const startAt = new Date('2026-07-10T09:00:00.000Z');
  const endAt = new Date('2026-07-10T09:30:00.000Z');

  await deps.updateBooking('biz_A', 'bk-1', { startAt, endAt });

  const update = lastCall('booking', 'update');
  assert.deepEqual(update.args.where, { id: 'bk-1', businessId: 'biz_A' });
  assert.equal(update.unscoped, false, 'ya no hace falta runUnscoped: el negocio va en el where');
  // La forma registrada tiene que pasar la guarda (S2) por sí sola.
  assert.doesNotThrow(() => assertTenantScoped('booking', 'update', update.args));
});

test('calendarSync.updateBooking conserva el historial de estado ligado a la reserva', async () => {
  calls.length = 0;
  const deps = buildProdDeps();

  await deps.updateBooking('biz_A', 'bk-1', { status: 'CANCELLED', prevStatus: 'CONFIRMED' });

  const update = lastCall('booking', 'update');
  assert.deepEqual(update.args.where, { id: 'bk-1', businessId: 'biz_A' });
  assert.deepEqual(update.args.data, { status: 'CANCELLED' });
  const history = lastCall('bookingStatusHistory', 'create');
  assert.deepEqual(history.args.data, {
    bookingId: 'bk-1',
    estadoAnterior: 'CONFIRMED',
    estadoNuevo: 'CANCELLED',
    motivo: 'Sincronización Google Calendar',
  });
});

test('oauth.updateCredential acota la escritura por negocio (sin runUnscoped)', async () => {
  calls.length = 0;
  const deps = oauthDefaultDeps();

  await deps.updateCredential('biz_A', 'cred-1', { estado: 'connected' });

  const update = lastCall('oAuthCredential', 'update');
  assert.deepEqual(update.args.where, { id: 'cred-1', businessId: 'biz_A' });
  assert.equal(update.unscoped, false, 'ya no hace falta runUnscoped: el negocio va en el where');
  assert.doesNotThrow(() => assertTenantScoped('oAuthCredential', 'update', update.args));
});

test('oauth.updateCredential mantiene el null EXPLÍCITO en credenciales de plataforma', async () => {
  calls.length = 0;
  const deps = oauthDefaultDeps();

  await deps.updateCredential(null, 'cred-admin', { estado: 'reauth_required' });

  const update = lastCall('oAuthCredential', 'update');
  assert.deepEqual(update.args.where, { id: 'cred-admin', businessId: null });
  // Para OAuthCredential la guarda acepta `null` explícito, nunca la ausencia.
  assert.doesNotThrow(() => assertTenantScoped('oAuthCredential', 'update', update.args));
});
