// Unit tests para digestScheduler.ts (Fases 3-5).
// Runner: node --import tsx --test
//
// Estrategia: dependencias inyectadas vía DigestDeps (DI). Sin DB ni red real.
// Se verifican: idempotencia (create/sent/retry), cada digest con datos → payload
// correcto / sin datos → no emite, caja emite con 0, cumpleaños sin duplicado en
// el 2º run, y el gate semanal (lunes).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  runDigestsWithDeps,
  startOfUtcDay,
  mondayOfUtcWeek,
  isBirthdayToday,
  type DigestDeps,
  type CreateDigestResult,
} from '../digestScheduler.js';

// 2026-07-06 es lunes (2026-07-02 es jueves). 2026-07-07 es martes.
const MONDAY = new Date('2026-07-06T10:00:00.000Z');
const THURSDAY = new Date('2026-07-02T10:00:00.000Z');

interface EmitCall { name: string; data: Record<string, unknown>; eventId?: string; businessId: string }

function makeDeps(overrides: Partial<DigestDeps> = {}) {
  const emitCalls: EmitCall[] = [];
  const sentIds: string[] = [];
  let counter = 0;

  const deps: DigestDeps = {
    enabled: true,
    emit: (async (name: string, data: unknown, opts: { businessId: string; eventId?: string }) => {
      emitCalls.push({ name, data: data as Record<string, unknown>, eventId: opts.eventId, businessId: opts.businessId });
      return { status: 'sent', eventId: opts.eventId ?? 'auto' };
    }) as DigestDeps['emit'],
    listBusinesses: async () => [{ id: 'biz-1', nombre: 'Negocio Test' }],
    adminEmails: async () => ['admin@test.com'],
    createDigestRow: async (): Promise<CreateDigestResult> => ({ created: true, id: `n-${++counter}` }),
    markSent: async (id) => { sentIds.push(id); },
    invoicePending: async () => [],
    salesForRange: async () => [],
    lowStock: async () => [],
    birthdaysToday: async () => [],
    inactiveCustomers: async () => [],
    dueRenewals: async () => [],
    fichajesForRange: async () => [],
    ...overrides,
  };

  return Object.assign(deps, { emitCalls, sentIds });
}

function only(deps: ReturnType<typeof makeDeps>, name: string): EmitCall[] {
  return deps.emitCalls.filter((c) => c.name === name);
}

// ---------------------------------------------------------------------------
// Helpers de fecha
// ---------------------------------------------------------------------------
describe('digest — helpers de fecha (UTC)', () => {
  test('startOfUtcDay trunca a 00:00 UTC', () => {
    const d = startOfUtcDay(new Date('2026-07-06T18:34:00Z'));
    assert.equal(d.toISOString(), '2026-07-06T00:00:00.000Z');
  });
  test('mondayOfUtcWeek devuelve el lunes 00:00 UTC', () => {
    assert.equal(mondayOfUtcWeek(new Date('2026-07-08T12:00:00Z')).toISOString(), '2026-07-06T00:00:00.000Z');
    assert.equal(mondayOfUtcWeek(new Date('2026-07-06T00:00:00Z')).toISOString(), '2026-07-06T00:00:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// isBirthdayToday — coincidencia normal + caso 29-feb en año no bisiesto
// ---------------------------------------------------------------------------
describe('digest — isBirthdayToday', () => {
  const born = (iso: string) => new Date(iso);

  test('coincide mismo día y mes (UTC)', () => {
    assert.equal(isBirthdayToday(born('1990-07-02T00:00:00Z'), new Date('2026-07-02T10:00:00Z')), true);
  });
  test('no coincide otro día', () => {
    assert.equal(isBirthdayToday(born('1990-07-02T00:00:00Z'), new Date('2026-07-03T10:00:00Z')), false);
  });
  test('nacido 29-feb + año NO bisiesto → se felicita el 28-feb', () => {
    // 2027 no es bisiesto.
    assert.equal(isBirthdayToday(born('2000-02-29T00:00:00Z'), new Date('2027-02-28T10:00:00Z')), true);
  });
  test('nacido 29-feb + año bisiesto → NO se adelanta al 28-feb (se felicita el 29)', () => {
    // 2028 es bisiesto → el 28 no dispara, el 29 sí.
    assert.equal(isBirthdayToday(born('2000-02-29T00:00:00Z'), new Date('2028-02-28T10:00:00Z')), false);
    assert.equal(isBirthdayToday(born('2000-02-29T00:00:00Z'), new Date('2028-02-29T10:00:00Z')), true);
  });
  test('nacido 28-feb no se ve afectado por el caso especial en año no bisiesto', () => {
    assert.equal(isBirthdayToday(born('1990-02-28T00:00:00Z'), new Date('2027-02-28T10:00:00Z')), true);
  });
});

// ---------------------------------------------------------------------------
// Skip suave global: sin webhook (enabled:false) no se emite ni se crea nada
// ---------------------------------------------------------------------------
describe('digest — enabled=false', () => {
  test('no emite ni crea filas cuando el webhook no está configurado', async () => {
    let created = 0;
    const deps = makeDeps({
      enabled: false,
      invoicePending: async () => [{ numero: 'F1', cliente: 'Ana', total: 100, estado: 'Pendiente' }],
      createDigestRow: async () => { created++; return { created: true, id: 'x' }; },
    });
    await runDigestsWithDeps(deps, THURSDAY);
    assert.equal(deps.emitCalls.length, 0);
    assert.equal(created, 0);
  });
});

// ---------------------------------------------------------------------------
// 3.0 — Idempotencia del scheduler
// ---------------------------------------------------------------------------
describe('digest — idempotencia (3.0)', () => {
  const invoice = { numero: 'F1', cliente: 'Ana', total: 100, estado: 'Pendiente' };

  test('fila ya existente en estado sent → NO re-emite', async () => {
    const deps = makeDeps({
      invoicePending: async () => [invoice],
      createDigestRow: async () => ({ created: false, existing: { id: 'n1', estado: 'sent' } }),
    });
    await runDigestsWithDeps(deps, THURSDAY);
    assert.equal(deps.emitCalls.length, 0);
    assert.equal(deps.sentIds.length, 0);
  });

  test('fila existente NO sent (pending) → reintenta el emit reutilizándola', async () => {
    const deps = makeDeps({
      invoicePending: async () => [invoice],
      // Solo la fila de facturas existe en 'pending'; el resto se crea nuevo.
      createDigestRow: async (input) => input.tipo === 'invoice.pending_digest'
        ? { created: false, existing: { id: 'n1', estado: 'pending' } }
        : { created: true, id: 'other' },
    });
    await runDigestsWithDeps(deps, THURSDAY);
    assert.equal(only(deps, 'invoice.pending_digest').length, 1);
    assert.equal(only(deps, 'invoice.pending_digest')[0].eventId, 'n1');
    assert.ok(deps.sentIds.includes('n1'));
  });

  test('emit falla → NO marca sent, deja la fila para retry, no lanza', async () => {
    const deps = makeDeps({
      invoicePending: async () => [invoice],
      emit: (async () => ({ status: 'failed', eventId: 'n-1', error: 'http_500' })) as DigestDeps['emit'],
    });
    await assert.doesNotReject(() => runDigestsWithDeps(deps, THURSDAY));
    assert.equal(deps.sentIds.length, 0);
  });

  test('error global (listBusinesses lanza) no se propaga', async () => {
    const deps = makeDeps({ listBusinesses: async () => { throw new Error('DB down'); } });
    await assert.doesNotReject(() => runDigestsWithDeps(deps, THURSDAY));
  });
});

// ---------------------------------------------------------------------------
// 3.2 — Facturas pendientes/vencidas
// ---------------------------------------------------------------------------
describe('digest — facturas pendientes (3.2)', () => {
  test('2 pendientes → emit con detalle de 2 líneas y totalPendientes=2', async () => {
    const deps = makeDeps({
      invoicePending: async () => [
        { numero: 'F1', cliente: 'Ana', total: 100, estado: 'Pendiente' },
        { numero: 'F2', cliente: 'Luis', total: 50, estado: 'Vencida' },
      ],
    });
    await runDigestsWithDeps(deps, THURSDAY);
    const calls = only(deps, 'invoice.pending_digest');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].data.email, 'admin@test.com');
    assert.equal(calls[0].data.totalPendientes, 2);
    assert.equal((calls[0].data.detalle as string).split('\n').length, 2);
  });

  test('sin pendientes → no emite', async () => {
    const deps = makeDeps({ invoicePending: async () => [] });
    await runDigestsWithDeps(deps, THURSDAY);
    assert.equal(only(deps, 'invoice.pending_digest').length, 0);
  });
});

// ---------------------------------------------------------------------------
// 3.3 — Resumen de caja
// ---------------------------------------------------------------------------
describe('digest — caja diaria (3.3)', () => {
  test('3 ventas (2 efectivo, 1 tarjeta) → total y desglose por método', async () => {
    const deps = makeDeps({
      salesForRange: async () => [
        { metodo: 'Efectivo', total: 20 },
        { metodo: 'Efectivo', total: 30 },
        { metodo: 'Tarjeta', total: 50 },
      ],
    });
    await runDigestsWithDeps(deps, THURSDAY);
    const calls = only(deps, 'cash.daily_summary');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].data.total, 100);
    const detalle = calls[0].data.detalle as string;
    assert.ok(detalle.includes('Efectivo'));
    assert.ok(detalle.includes('Tarjeta'));
  });

  test('0 ventas → emite igualmente con total 0', async () => {
    const deps = makeDeps({ salesForRange: async () => [] });
    await runDigestsWithDeps(deps, THURSDAY);
    const calls = only(deps, 'cash.daily_summary');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].data.total, 0);
    assert.equal(calls[0].data.detalle, 'Sin ventas');
  });
});

// ---------------------------------------------------------------------------
// 3.4 — Stock bajo
// ---------------------------------------------------------------------------
describe('digest — stock bajo (3.4)', () => {
  test('producto stock<=minimo → aparece con numProductos', async () => {
    const deps = makeDeps({ lowStock: async () => [{ nombre: 'Champú', stock: 2, minimo: 5 }] });
    await runDigestsWithDeps(deps, THURSDAY);
    const calls = only(deps, 'stock.low_digest');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].data.numProductos, 1);
    assert.ok((calls[0].data.detalle as string).includes('Champú'));
  });

  test('ninguno → no emite', async () => {
    const deps = makeDeps({ lowStock: async () => [] });
    await runDigestsWithDeps(deps, THURSDAY);
    assert.equal(only(deps, 'stock.low_digest').length, 0);
  });
});

// ---------------------------------------------------------------------------
// 4.1 — Cumpleaños (idempotencia sin duplicado en 2º run)
// ---------------------------------------------------------------------------
describe('digest — cumpleaños (4.1)', () => {
  const cliente = { nombre: 'Ana', apellido: 'García', email: 'ana@test.com' };

  test('cliente con cumpleaños hoy y email → emit al cliente', async () => {
    const deps = makeDeps({ birthdaysToday: async () => [cliente] });
    await runDigestsWithDeps(deps, THURSDAY);
    const calls = only(deps, 'customer.birthday');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].data.email, 'ana@test.com');
    assert.equal(calls[0].data.customerName, 'Ana García');
  });

  test('segundo run mismo día (fila ya sent) → 0 duplicados', async () => {
    const deps = makeDeps({
      birthdaysToday: async () => [cliente],
      createDigestRow: async () => ({ created: false, existing: { id: 'n1', estado: 'sent' } }),
    });
    await runDigestsWithDeps(deps, THURSDAY);
    assert.equal(only(deps, 'customer.birthday').length, 0);
  });
});

// ---------------------------------------------------------------------------
// 4.4 — Renovación de bono (uno por bono; idempotencia por packageId)
// ---------------------------------------------------------------------------
describe('digest — renovación de bono (4.4)', () => {
  test('bono con sesionesRestantes<=1 → emit al cliente, destino=packageId', async () => {
    const deps = makeDeps({
      dueRenewals: async () => [
        { packageId: 'pkg-1', customerName: 'Ana García', email: 'ana@test.com', packageName: 'Bono 10', sesionesRestantes: 1 },
        { packageId: 'pkg-2', customerName: 'Ana García', email: 'ana@test.com', packageName: 'Bono Masaje', sesionesRestantes: 0 },
      ],
    });
    await runDigestsWithDeps(deps, THURSDAY);
    const calls = only(deps, 'package.renewal_due');
    // Dos bonos del mismo cliente → dos emisiones (uno por bono), sin colisión.
    assert.equal(calls.length, 2);
    assert.equal(calls[0].data.email, 'ana@test.com');
    assert.ok(['Bono 10', 'Bono Masaje'].includes(calls[0].data.packageName as string));
  });
});

// ---------------------------------------------------------------------------
// 4.2 / 5.2 — Semanales: solo corren en lunes
// ---------------------------------------------------------------------------
describe('digest — semanales (gate lunes)', () => {
  test('reactivación NO emite en jueves aunque haya datos', async () => {
    const deps = makeDeps({
      inactiveCustomers: async () => [{ nombre: 'Ana', apellido: 'García', ultimaVisita: new Date('2026-01-01T00:00:00Z') }],
    });
    await runDigestsWithDeps(deps, THURSDAY);
    assert.equal(only(deps, 'customer.reactivation_digest').length, 0);
  });

  test('reactivación emite en lunes con detalle y numClientes', async () => {
    const deps = makeDeps({
      inactiveCustomers: async () => [{ nombre: 'Ana', apellido: 'García', ultimaVisita: new Date('2026-01-01T00:00:00Z') }],
    });
    await runDigestsWithDeps(deps, MONDAY);
    const calls = only(deps, 'customer.reactivation_digest');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].data.numClientes, 1);
    assert.ok((calls[0].data.detalle as string).includes('Ana García'));
  });

  test('fichajes semanales emiten en lunes con horas por empleado', async () => {
    const deps = makeDeps({
      fichajesForRange: async () => [{ empleado: 'Miguel Torres', horas: 38.5 }],
    });
    await runDigestsWithDeps(deps, MONDAY);
    const calls = only(deps, 'fichaje.weekly_summary');
    assert.equal(calls.length, 1);
    assert.ok((calls[0].data.detalle as string).includes('38.5'));
  });
});
