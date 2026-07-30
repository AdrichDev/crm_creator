// Unit tests del puente OperaOS ← aa.cita (crm-citas-del-bot-en-operaos).
// Runner: node --import tsx --test

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  listAgentBookings,
  mapCitaAgente,
  fusionarCitas,
  resumirCitas,
  type AgentBookingsDb,
  type CitaAgenteRow,
} from '../bookings/agent-bookings.js';

/** Fila base; cada test sobreescribe lo que le importa. */
function fila(over: Partial<CitaAgenteRow> = {}): CitaAgenteRow {
  return {
    id: 'cita1',
    inicio: new Date('2026-08-03T21:00:00.000Z'),
    estado: 'scheduled',
    comensales: 4,
    nombre_cliente: 'Ana Serrano',
    email: 'ana@example.com',
    notas: null,
    servicio_nombre: 'Cena',
    ...over,
  };
}

/** Doble de BD que registra el tenant consultado y cuántas veces se tocó `aa.cita`. */
function fakeDb(tenantId: string | null, rows: CitaAgenteRow[] = []) {
  const consultas: { sql: string; params: unknown[] }[] = [];
  const db: AgentBookingsDb = {
    business: {
      async findUnique() {
        return tenantId === null ? { tenantId: null } : { tenantId };
      },
    },
    async $queryRaw(query: TemplateStringsArray, ...values: unknown[]) {
      consultas.push({ sql: query.join('?'), params: values });
      return rows as never;
    },
  };
  return { db, consultas };
}

describe('mapCitaAgente', () => {
  test('shape castellano con id prefijado y origen agente', () => {
    const c = mapCitaAgente(fila({ notas: 'Alergia a frutos secos' }));
    assert.equal(c.id, 'aa:cita1');
    assert.equal(c.origen, 'agente');
    assert.equal(c.servicio, 'Cena');
    assert.equal(c.fecha, '2026-08-03');
    assert.equal(c.hora, '21:00');
    assert.equal(c.aforo, 4);
    assert.equal(c.notes, 'Alergia a frutos secos');
    // El esquema de agentes no asigna empleado ni recurso a la reserva.
    assert.equal(c.empleado, '');
    assert.equal(c.recurso, null);
  });

  test('todos los estados del agente mapean a etiqueta castellana', () => {
    assert.equal(mapCitaAgente(fila({ estado: 'scheduled' })).estado, 'Confirmada');
    assert.equal(mapCitaAgente(fila({ estado: 'attended' })).estado, 'Completada');
    assert.equal(mapCitaAgente(fila({ estado: 'cancelled' })).estado, 'Cancelada');
    assert.equal(mapCitaAgente(fila({ estado: 'no-show' })).estado, 'Cancelada');
    // Estado desconocido no puede reventar la agenda entera.
    assert.equal(mapCitaAgente(fila({ estado: 'lo-que-sea' })).estado, 'Pendiente');
  });

  test('nombre cae a email y luego a literal', () => {
    assert.equal(mapCitaAgente(fila()).cliente, 'Ana Serrano');
    assert.equal(mapCitaAgente(fila({ nombre_cliente: null })).cliente, 'ana@example.com');
    assert.equal(
      mapCitaAgente(fila({ nombre_cliente: null, email: null })).cliente,
      'Cliente del bot',
    );
  });
});

describe('listAgentBookings', () => {
  test('negocio sin tenant → [] sin consultar aa.cita', async () => {
    const { db, consultas } = fakeDb(null, [fila()]);
    const r = await listAgentBookings(db, { businessId: 'neg1' });
    assert.deepEqual(r, []);
    assert.equal(consultas.length, 0);
  });

  test('sin businessId → [] sin consultar aa.cita', async () => {
    const { db, consultas } = fakeDb('tenant1', [fila()]);
    const r = await listAgentBookings(db, { businessId: undefined });
    assert.deepEqual(r, []);
    assert.equal(consultas.length, 0);
  });

  test('filtrar por empleado → [] sin consultar (ninguna cita del agente lo tiene)', async () => {
    const { db, consultas } = fakeDb('tenant1', [fila()]);
    const r = await listAgentBookings(db, { businessId: 'neg1', employeeId: 'emp1' });
    assert.deepEqual(r, []);
    assert.equal(consultas.length, 0);
  });

  test('tenancy: el WHERE se ancla en el tenant del negocio, no en la petición', async () => {
    const { db, consultas } = fakeDb('tenant-propio', [fila()]);
    await listAgentBookings(db, { businessId: 'neg1' });
    assert.equal(consultas.length, 1);
    assert.ok(consultas[0].sql.includes('a.tenant_id ='));
    // El id del tenant viaja SIEMPRE como parámetro, nunca interpolado en el SQL.
    assert.equal(consultas[0].params[0], 'tenant-propio');
    assert.ok(!consultas[0].sql.includes('tenant-propio'));
  });

  test('la hora se traduce a la zona del agente antes de salir de la base de datos', async () => {
    const { db, consultas } = fakeDb('t1', [fila()]);
    await listAgentBookings(db, { businessId: 'n1', from: '2026-08-01', to: '2026-08-31' });
    const { sql } = consultas[0]!;
    // `aa.cita.inicio` guarda un instante UTC; el listado pinta reloj de pared. Sin esta
    // traducción una cena de las 21:00 se mostraba a las 19:00, fuera del horario.
    assert.ok(sql.includes("AT TIME ZONE 'UTC'"));
    assert.ok(sql.includes('COALESCE(h.zona_horaria'));
    assert.ok(sql.includes('LEFT JOIN aa.horario_agente'));
    // Y el rango se compara contra la hora ya traducida, no contra el instante crudo.
    assert.ok(!/c\.inicio\s*>=/.test(sql));
    // `fakeDb` une los fragmentos con "?", así que el hueco del parámetro sale como "?".
    assert.ok(/inicio\s*>=\s*\?::timestamp\b/.test(sql));
  });

  test('filtro por estado colapsa cancelled y no-show en "Cancelada"', async () => {
    const rows = [
      fila({ id: 'a', estado: 'scheduled' }),
      fila({ id: 'b', estado: 'cancelled' }),
      fila({ id: 'c', estado: 'no-show' }),
      fila({ id: 'd', estado: 'attended' }),
    ];
    const { db } = fakeDb('t1', rows);
    const canceladas = await listAgentBookings(db, { businessId: 'n1', estado: 'Cancelada' });
    assert.deepEqual(canceladas.map((c) => c.id), ['aa:b', 'aa:c']);
  });

  test('pendientes=1 excluye los estados terminales', async () => {
    const rows = [
      fila({ id: 'a', estado: 'scheduled' }),
      fila({ id: 'b', estado: 'cancelled' }),
      fila({ id: 'c', estado: 'attended' }),
      fila({ id: 'd', estado: 'no-show' }),
    ];
    const { db } = fakeDb('t1', rows);
    const abiertas = await listAgentBookings(db, { businessId: 'n1', soloPendientes: true });
    assert.deepEqual(abiertas.map((c) => c.id), ['aa:a']);
  });

  test('búsqueda casa por cliente o por servicio, sin distinguir mayúsculas', async () => {
    const rows = [
      fila({ id: 'a', nombre_cliente: 'Ana Serrano', email: 'a@example.com', servicio_nombre: 'Cena' }),
      fila({ id: 'b', nombre_cliente: 'Hugo Lasa', email: 'h@example.com', servicio_nombre: 'Comida' }),
    ];
    const { db } = fakeDb('t1', rows);
    assert.deepEqual((await listAgentBookings(db, { businessId: 'n1', search: 'ana' })).map((c) => c.id), ['aa:a']);
    assert.deepEqual((await listAgentBookings(db, { businessId: 'n1', search: 'COMIDA' })).map((c) => c.id), ['aa:b']);
    assert.deepEqual((await listAgentBookings(db, { businessId: 'n1', search: 'zzz' })), []);
  });

  test('el rango de fechas viaja como parámetro, y sin rango va null', async () => {
    const { db, consultas } = fakeDb('t1', []);
    await listAgentBookings(db, { businessId: 'n1', from: '2026-08-01', to: '2026-08-31' });
    // params: [tenant, desde, desde, hasta, hasta, cap]. Cada límite aparece dos veces
    // porque el SQL lo usa en la guarda `IS NULL` y en la comparación.
    assert.deepEqual(consultas[0].params.slice(1, 5), [
      new Date('2026-08-01'), new Date('2026-08-01'),
      new Date('2026-08-31'), new Date('2026-08-31'),
    ]);
    await listAgentBookings(db, { businessId: 'n1' });
    assert.deepEqual(consultas[1].params.slice(1, 5), [null, null, null, null]);
  });
});

describe('fusionarCitas', () => {
  const propia = (id: string, fecha: string, hora: string) => ({ id, fecha, hora });
  const agente = (id: string, fecha: string, hora: string) =>
    mapCitaAgente(fila({ id, inicio: new Date(`${fecha}T${hora}:00.000Z`) }));

  test('mezcla ambas fuentes en orden cronológico', () => {
    const r = fusionarCitas(
      [propia('crm1', '2026-08-03', '18:00'), propia('crm2', '2026-08-05', '09:00')],
      [agente('aa1', '2026-08-03', '21:00'), agente('aa2', '2026-08-01', '13:00')],
      1, 10,
    );
    assert.deepEqual(r.map((c) => c.id), ['aa:aa2', 'crm1', 'aa:aa1', 'crm2']);
  });

  test('pagina sobre el conjunto ya fusionado', () => {
    const propias = [propia('crm1', '2026-08-01', '10:00'), propia('crm2', '2026-08-04', '10:00')];
    const agentes = [agente('aa1', '2026-08-02', '10:00'), agente('aa2', '2026-08-03', '10:00')];
    assert.deepEqual(fusionarCitas(propias, agentes, 1, 2).map((c) => c.id), ['crm1', 'aa:aa1']);
    assert.deepEqual(fusionarCitas(propias, agentes, 2, 2).map((c) => c.id), ['aa:aa2', 'crm2']);
  });

  test('el mismo día ordena por hora', () => {
    const r = fusionarCitas(
      [propia('crm1', '2026-08-03', '21:30')],
      [agente('aa1', '2026-08-03', '09:15')],
      1, 10,
    );
    assert.deepEqual(r.map((c) => c.id), ['aa:aa1', 'crm1']);
  });
});

// B2 — las tarjetas de resumen de /citas cuentan ambas fuentes. El resumen es global
// (sin rango), así que un desajuste aquí se ve como "Total 3" sobre un calendario de 5.
describe('resumirCitas — resumen de /citas con las dos fuentes', () => {
  const grupo = (status: string, n: number) => ({ status, _count: { _all: n } });
  const conEstado = (id: string, estado: CitaAgenteRow['estado']) =>
    mapCitaAgente(fila({ id, estado }));

  test('el total es la suma de las citas propias y las del agente', () => {
    const r = resumirCitas(
      [grupo('CONFIRMED', 3), grupo('PENDING', 2), grupo('CANCELLED', 1)],
      [conEstado('aa1', 'scheduled'), conEstado('aa2', 'attended')],
    );
    assert.deepEqual(r, { total: 8, confirmadas: 4, pendientes: 2 });
  });

  test('las canceladas y los no-show del agente cuentan en el total, no en los desgloses', () => {
    const r = resumirCitas([], [conEstado('aa1', 'cancelled'), conEstado('aa2', 'no-show')]);
    assert.deepEqual(r, { total: 2, confirmadas: 0, pendientes: 0 });
  });

  test('un negocio sin agente devuelve exactamente lo que agrega el CRM', () => {
    const r = resumirCitas([grupo('CONFIRMED', 5), grupo('PENDING', 1)], []);
    assert.deepEqual(r, { total: 6, confirmadas: 5, pendientes: 1 });
  });

  test('varios grupos del mismo estado se acumulan en vez de pisarse', () => {
    const r = resumirCitas([grupo('CONFIRMED', 2), grupo('CONFIRMED', 3)], []);
    assert.equal(r.confirmadas, 5);
  });
});
