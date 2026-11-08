// S4 — fugas entre negocios, probadas por FAMILIA de ruta (tabla): con datos de los
// negocios A y B y actuando como A, ninguna ruta puede devolver una fila de B ni escribir
// en ella.
//
// Por familia se comprueban tres cosas:
//   1. `list`: el listado devuelve EXACTAMENTE las filas de A (nunca las de B).
//   2. Cada operación por id ajeno responde con EL CONTRATO QUE YA TIENE esa ruta (404, o
//      422 `cross_tenant` donde ya aplicaba) — el test NO cambia contratos, los fija.
//   3. Esa operación no deja ninguna escritura registrada en sus modelos y las filas de B
//      siguen byte-identical.
//
// LÍMITE del doble (`_fake-prisma`): su `update`/`delete` devuelven la fila fusionada pero
// NO mutan el store, así que la comprobación de inmutabilidad solo tiene dientes reales en
// los caminos que usan `updateMany`/`deleteMany` (mutan de verdad, como Prisma). La prueba
// FUERTE de "no se tocó B" es el registro de escrituras (`fake.writes`), que es la que falla
// si una ruta llega a escribir sobre un id ajeno.
//
// Las filas sembradas llevan como fixture los campos que las rutas leen de un `include`
// (`resources`, `_count`, `user`): el doble no resuelve includes, y sin esos campos el
// listado reventaría por un `undefined`, no por una fuga.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Router } from 'express';
import { installFakePrisma, call, type Seed } from './_fake-prisma.js';
import { runUnscoped } from '../../lib/tenant-scope.js';

const fake = installFakePrisma();

// Imports dinámicos: el singleton de Prisma lee `globalThis.prisma`, que instala el doble.
const { crudRouter } = await import('../../lib/crud.js');
const { customersRouter } = await import('../customers.js');
const { employeesRouter } = await import('../employees.js');
const { bookingsRouter } = await import('../bookings.js');
const { categoriesRouter } = await import('../categories.js');
const { contactosRouter } = await import('../contactos.js');
const { pedidosRouter } = await import('../pedidos.js');
const { invoicesRouter } = await import('../invoices.js');
const { documentsRouter } = await import('../documents.js');
const { remindersRouter } = await import('../reminders.js');
const { visitStatesRouter } = await import('../visit-states.js');
const { visitsRouter } = await import('../visits.js');
const { timeOffRouter } = await import('../timeoff.js');
const { packagesRouter } = await import('../packages.js');
const { saleLinesRouter } = await import('../sale-lines.js');
const { configHorarioRouter } = await import('../config-horario.js');
const { settingsRouter } = await import('../settings.js');
const { usersRouter } = await import('../users.js');
const { tenantKeysRouter } = await import('../tenant-keys.js');

// ---------------------------------------------------------------------------------------
// Semilla: los negocios A y B con filas de TODAS las familias servidas por la API.
// ---------------------------------------------------------------------------------------
const live = { eliminadoEn: null };
const day = new Date('2026-12-01T00:00:00.000Z');
const stamp = new Date('2026-01-01T00:00:00.000Z');

const seed: Seed = {
  // Raíz (`Business`, exenta de la guarda) — solo para las lecturas de vertical/nombre.
  business: [{ id: 'A', nombre: 'Negocio A' }, { id: 'B', nombre: 'Negocio B' }],

  // --- crudRouter: catálogo (locations, services, products, resources, tags, campaigns, fichajes, sales)
  location: [
    { id: 'lA', businessId: 'A', nombre: 'Sede A', activo: true, direccion: 'Calle A 1', ...live },
    { id: 'lB', businessId: 'B', nombre: 'Sede B', activo: true, direccion: 'Calle B 1', ...live },
  ],
  service: [
    { id: 'sA', businessId: 'A', nombre: 'Corte A', duracion: 30, activo: true, requiereProfesional: false, margenAntes: 0, margenDespues: 0, ...live },
    { id: 'sB', businessId: 'B', nombre: 'Masaje B', duracion: 30, activo: true, requiereProfesional: false, margenAntes: 0, margenDespues: 0, ...live },
  ],
  product: [
    { id: 'prodA', businessId: 'A', nombre: 'Champú A', ...live },
    { id: 'prodB', businessId: 'B', nombre: 'Champú B', ...live },
  ],
  resource: [
    { id: 'rA', businessId: 'A', locationId: 'lA', nombre: 'Sala A', ...live },
    { id: 'rB', businessId: 'B', locationId: 'lB', nombre: 'Sala B', ...live },
  ],
  tag: [
    { id: 'tagA', businessId: 'A', nombre: 'VIP', ...live },
    { id: 'tagB', businessId: 'B', nombre: 'Ajeno', ...live },
  ],
  campaign: [
    { id: 'campA', businessId: 'A', nombre: 'Campaña A', ...live },
    { id: 'campB', businessId: 'B', nombre: 'Campaña B', ...live },
  ],
  fichaje: [
    { id: 'fichA', businessId: 'A', employeeId: 'eA', empleado: 'Ana', ...live },
    { id: 'fichB', businessId: 'B', employeeId: 'eB', empleado: 'Beto', ...live },
  ],
  sale: [
    { id: 'saleA', businessId: 'A', cliente: 'Cliente A', total: 10, ...live },
    { id: 'saleB', businessId: 'B', cliente: 'Cliente B', total: 20, ...live },
  ],
  // Tabla hija: la línea hereda el negocio de su venta.
  saleLine: [
    { id: 'lineA', saleId: 'saleA', concepto: 'Corte', cantidad: 1, precioUnitario: 10, subtotal: 10 },
    { id: 'lineB', saleId: 'saleB', concepto: 'Ajeno', cantidad: 1, precioUnitario: 20, subtotal: 20 },
  ],

  // --- customers / employees (+ horario)
  customer: [
    { id: 'cA', businessId: 'A', nombre: 'Cliente A', ...live },
    { id: 'cB', businessId: 'B', nombre: 'Cliente B', ...live },
  ],
  employee: [
    { id: 'eA', businessId: 'A', nombre: 'Ana', apellido: 'A', ...live },
    { id: 'eB', businessId: 'B', nombre: 'Beto', apellido: 'B', email: 'beto@b.test', ...live },
  ],
  // Tabla hija: el tramo hereda el negocio de su empleado.
  employeeSchedule: [
    { id: 'schA', employeeId: 'eA', diaSemana: 1, inicio: '09:00', fin: '17:00' },
    { id: 'schB', employeeId: 'eB', diaSemana: 1, inicio: '10:00', fin: '20:00' },
  ],

  // --- bookings (el listado lee `resources[0]` y las relaciones: fixture explícito)
  booking: [
    {
      id: 'bkA', businessId: 'A', startAt: day, status: 'PENDING', notes: null,
      customerId: null, teamId: null, serviceId: null, employeeId: null, locationId: null,
      customer: null, contacto: null, team: null, service: null, employee: null,
      location: null, resources: [], ...live,
    },
    {
      id: 'bkB', businessId: 'B', startAt: day, status: 'PENDING', notes: null,
      customerId: null, teamId: null, serviceId: null, employeeId: null, locationId: null,
      customer: null, contacto: null, team: null, service: null, employee: null,
      location: null, resources: [], ...live,
    },
  ],

  // --- categories: equipos (+ miembros, tabla hija) — `_count` es fixture (el doble no resuelve includes)
  team: [
    { id: 'teamA', businessId: 'A', nombre: 'Equipo A', _count: { members: 0 }, ...live },
    { id: 'teamB', businessId: 'B', nombre: 'Equipo B', _count: { members: 0 }, ...live },
  ],
  teamMember: [
    { id: 'memberA', teamId: 'teamA', employeeId: 'eA', customerId: null, rol: 'Entrenador' },
    { id: 'memberB', teamId: 'teamB', employeeId: 'eB', customerId: null, rol: 'Jugador' },
  ],

  // --- contactos / pedidos / facturas / documentos / recordatorios
  contacto: [
    { id: 'ctA', businessId: 'A', codigo: 'pc-01', nombre: 'Lead A', contactado: 'no', ...live },
    { id: 'ctB', businessId: 'B', codigo: 'pc-01', nombre: 'Lead B', contactado: 'no', ...live },
  ],
  pedido: [
    { id: 'pedA', businessId: 'A', numero: 'P-A', estado: 'generada', tasaIva: 0.21, totalImpl: 10, ...live },
    { id: 'pedB', businessId: 'B', numero: 'P-B', estado: 'generada', tasaIva: 0.21, totalImpl: 20, ...live },
  ],
  invoice: [
    { id: 'invA', businessId: 'A', estado: 'Pendiente', total: 10, cliente: 'Cliente A', ...live },
    { id: 'invB', businessId: 'B', estado: 'Pendiente', total: 20, cliente: 'Cliente B', ...live },
  ],
  document: [
    { id: 'docA', businessId: 'A', titulo: 'Doc A', rutaArchivo: 'a.pdf' },
    { id: 'docB', businessId: 'B', titulo: 'Doc B', rutaArchivo: 'b.pdf' },
  ],
  reminder: [
    { id: 'remA', businessId: 'A', titulo: 'Llamar A', estado: 'PENDING', ...live },
    { id: 'remB', businessId: 'B', titulo: 'Llamar B', estado: 'PENDING', ...live },
  ],

  // --- comercial de campo: estados de visita, visitas, bajas
  visitState: [
    { id: 'vsA', businessId: 'A', nombre: 'Nuevo', orden: 1, ...live },
    { id: 'vsB', businessId: 'B', nombre: 'Ajeno', orden: 1, ...live },
  ],
  visit: [
    { id: 'visA', businessId: 'A', customerId: 'cA', fecha: day, ...live },
    { id: 'visB', businessId: 'B', customerId: 'cB', fecha: day, ...live },
  ],
  timeOffRequest: [
    { id: 'toA', businessId: 'A', employeeId: 'eA', tipo: 'VACATION', estado: 'PENDING', inicio: day, fin: day, dias: 1, ...live },
    { id: 'toB', businessId: 'B', employeeId: 'eB', tipo: 'VACATION', estado: 'PENDING', inicio: day, fin: day, dias: 1, ...live },
  ],

  // --- bonos (+ paquete de cliente)
  package: [
    { id: 'pkgA', businessId: 'A', nombre: 'Bono A', sesionesTotal: 5, diasValidez: 365 },
    { id: 'pkgB', businessId: 'B', nombre: 'Bono B', sesionesTotal: 5, diasValidez: 365 },
  ],
  customerPackage: [
    { id: 'cpkA', businessId: 'A', customerId: 'cA', packageId: 'pkgA', estado: 'ACTIVE', sesionesUsadas: 0, sesionesTotal: 5, expiraEn: null },
    { id: 'cpkB', businessId: 'B', customerId: 'cB', packageId: 'pkgB', estado: 'ACTIVE', sesionesUsadas: 0, sesionesTotal: 5, expiraEn: null },
  ],

  // --- horario de apertura (OpeningHour, hija de la sucursal)
  openingHour: [
    { id: 'hourA', locationId: 'lA', diaSemana: 1, apertura: '09:00', cierre: '18:00' },
    { id: 'hourB', locationId: 'lB', diaSemana: 1, apertura: '10:00', cierre: '20:00' },
  ],

  // --- ajustes por categoría (sin id de negocio en la ruta)
  businessSetting: [
    { id: 'setA', businessId: 'A', locationId: null, categoria: 'marca', datos: { color: 'A' } },
    { id: 'setB', businessId: 'B', locationId: null, categoria: 'marca', datos: { color: 'B', interno: 'no filtrar' } },
  ],

  // --- usuarios/membresías (`user` es fixture: el doble no resuelve el include) y secretos
  membership: [
    { id: 'mA', userId: 'uA', businessId: 'A', role: 'ADMIN', user: { id: 'uA', email: 'ana@a.test', firstName: 'Ana', lastName: null, createdAt: stamp } },
    { id: 'mB', userId: 'uB', businessId: 'B', role: 'ADMIN', user: { id: 'uB', email: 'beto@b.test', firstName: 'Beto', lastName: null, createdAt: stamp } },
  ],
  tenantSecret: [
    { id: 'secA', businessId: 'A', name: 'OPENAI_API_KEY', scope: 'BACKEND_SECRET', envVarName: null, updatedAt: stamp },
    { id: 'secB', businessId: 'B', name: 'OPENAI_API_KEY', scope: 'BACKEND_SECRET', envVarName: null, updatedAt: stamp },
  ],
};

// ---------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------
type Result = { status: number; body: any };

/** Identidad de A: ADMIN del negocio A (el rol alto deja pasar staffOnly/requireRole). */
const asA = { businessId: 'A', userId: 'uA', role: 'ADMIN' };

const WRITE_OPS = new Set(['create', 'createMany', 'update', 'updateMany', 'delete', 'deleteMany', 'upsert']);

/**
 * Fila tal como está AHORA en el doble. Se lee en `runUnscoped` porque la guarda de tenancy
 * exige el negocio en el `where` y aquí solo interesa el id (la lectura es del test, no de
 * la ruta).
 */
async function readRow(model: string, id: string): Promise<unknown> {
  return runUnscoped(
    'test de fuga: leer la fila sembrada del negocio B para comprobar que sigue intacta',
    async () =>
      await (fake.client as unknown as Record<string, { findFirst: (a: unknown) => Promise<unknown> }>)[model]!
        .findFirst({ where: { id } }),
  );
}

interface ForeignOp {
  label: string;
  method: string;
  path: string;
  body?: unknown;
  /** Contrato que YA tiene esta ruta para un id que no es del negocio activo. */
  expect: number[];
  /** Modelos que escribe la operación (default: los de la familia). */
  writes?: string[];
  /** Comprobaciones propias (p. ej. el `where` exacto de la escritura permitida). */
  after?: (r: Result) => void;
}

interface Family {
  name: string;
  router: Router;
  /** Modelos que la familia sabe escribir: un id ajeno no debe generar ninguna escritura. */
  writes: string[];
  /** Filas del negocio B que deben seguir byte-identical tras cada operación. */
  untouched: { model: string; id: string }[];
  list?: { path: string; check: (r: Result) => void };
  ops: ForeignOp[];
}

function itemIds(body: any): string[] {
  return (body?.items ?? []).map((r: any) => r.id);
}

/** Listado paginado `{ items }` que debe contener EXACTAMENTE las filas de A. */
function expectItems(...ids: string[]) {
  return (r: Result) => {
    assert.equal(r.status, 200);
    assert.deepEqual(itemIds(r.body), ids);
  };
}

/** Listado que responde un array plano (packages, time-off). */
function expectArray(...ids: string[]) {
  return (r: Result) => {
    assert.equal(r.status, 200);
    assert.deepEqual((r.body as Array<{ id: string }>).map((x) => x.id), ids);
  };
}

// ---------------------------------------------------------------------------------------
// Tabla: una fila por familia de ruta.
// ---------------------------------------------------------------------------------------
const FAMILIES: Family[] = [
  {
    name: 'locations (crudRouter · location)',
    router: crudRouter('location', { fields: ['nombre', 'direccion'] }),
    writes: ['location'],
    untouched: [{ model: 'location', id: 'lB' }],
    list: { path: '/', check: expectItems('lA') },
    ops: [
      { label: 'GET /:id', method: 'GET', path: '/lB', expect: [404] },
      { label: 'PATCH /:id', method: 'PATCH', path: '/lB', body: { nombre: 'Suplantada' }, expect: [404] },
      { label: 'DELETE /:id', method: 'DELETE', path: '/lB', expect: [404] },
    ],
  },
  {
    name: 'services (crudRouter · service)',
    router: crudRouter('service', { fields: ['nombre', 'precio'] }),
    writes: ['service'],
    untouched: [{ model: 'service', id: 'sB' }],
    list: { path: '/', check: expectItems('sA') },
    ops: [
      { label: 'GET /:id', method: 'GET', path: '/sB', expect: [404] },
      { label: 'PATCH /:id', method: 'PATCH', path: '/sB', body: { nombre: 'Suplantado' }, expect: [404] },
      { label: 'DELETE /:id', method: 'DELETE', path: '/sB', expect: [404] },
    ],
  },
  {
    name: 'products (crudRouter · product)',
    router: crudRouter('product', { fields: ['nombre', 'precio'] }),
    writes: ['product'],
    untouched: [{ model: 'product', id: 'prodB' }],
    list: { path: '/', check: expectItems('prodA') },
    ops: [
      { label: 'GET /:id', method: 'GET', path: '/prodB', expect: [404] },
      { label: 'PATCH /:id', method: 'PATCH', path: '/prodB', body: { nombre: 'Suplantado' }, expect: [404] },
      { label: 'DELETE /:id', method: 'DELETE', path: '/prodB', expect: [404] },
    ],
  },
  {
    name: 'resources (crudRouter · resource)',
    router: crudRouter('resource', { fields: ['nombre'] }),
    writes: ['resource'],
    untouched: [{ model: 'resource', id: 'rB' }],
    list: { path: '/', check: expectItems('rA') },
    ops: [
      { label: 'GET /:id', method: 'GET', path: '/rB', expect: [404] },
      { label: 'PATCH /:id', method: 'PATCH', path: '/rB', body: { nombre: 'Suplantado' }, expect: [404] },
      { label: 'DELETE /:id', method: 'DELETE', path: '/rB', expect: [404] },
    ],
  },
  {
    name: 'tags (crudRouter · tag)',
    router: crudRouter('tag', { fields: ['nombre', 'color'] }),
    writes: ['tag'],
    untouched: [{ model: 'tag', id: 'tagB' }],
    list: { path: '/', check: expectItems('tagA') },
    ops: [
      { label: 'GET /:id', method: 'GET', path: '/tagB', expect: [404] },
      { label: 'PATCH /:id', method: 'PATCH', path: '/tagB', body: { nombre: 'Suplantada' }, expect: [404] },
      { label: 'DELETE /:id', method: 'DELETE', path: '/tagB', expect: [404] },
    ],
  },
  {
    name: 'campaigns (crudRouter · campaign)',
    router: crudRouter('campaign', { fields: ['nombre', 'canal'] }),
    writes: ['campaign'],
    untouched: [{ model: 'campaign', id: 'campB' }],
    list: { path: '/', check: expectItems('campA') },
    ops: [
      { label: 'GET /:id', method: 'GET', path: '/campB', expect: [404] },
      { label: 'PATCH /:id', method: 'PATCH', path: '/campB', body: { nombre: 'Suplantada' }, expect: [404] },
      { label: 'DELETE /:id', method: 'DELETE', path: '/campB', expect: [404] },
    ],
  },
  {
    name: 'fichajes (crudRouter · fichaje)',
    router: crudRouter('fichaje', { fields: ['empleado'] }),
    writes: ['fichaje'],
    untouched: [{ model: 'fichaje', id: 'fichB' }],
    list: { path: '/', check: expectItems('fichA') },
    ops: [
      { label: 'GET /:id', method: 'GET', path: '/fichB', expect: [404] },
      { label: 'PATCH /:id', method: 'PATCH', path: '/fichB', body: { empleado: 'Suplantado' }, expect: [404] },
      { label: 'DELETE /:id', method: 'DELETE', path: '/fichB', expect: [404] },
    ],
  },
  {
    name: 'sales (crudRouter · sale)',
    router: crudRouter('sale', { fields: ['cliente', 'total'], include: { lines: true } }),
    writes: ['sale'],
    untouched: [{ model: 'sale', id: 'saleB' }],
    list: { path: '/', check: expectItems('saleA') },
    ops: [
      { label: 'GET /:id', method: 'GET', path: '/saleB', expect: [404] },
      { label: 'PATCH /:id', method: 'PATCH', path: '/saleB', body: { cliente: 'Suplantado' }, expect: [404] },
      { label: 'DELETE /:id', method: 'DELETE', path: '/saleB', expect: [404] },
    ],
  },
  {
    name: 'sale-lines (SaleLine, hija de sale)',
    router: saleLinesRouter,
    writes: ['saleLine', 'sale'],
    untouched: [{ model: 'saleLine', id: 'lineB' }, { model: 'sale', id: 'saleB' }],
    list: { path: '/saleA/lineas', check: (r) => {
      assert.equal(r.status, 200);
      assert.deepEqual((r.body.lineas as Array<{ id: string }>).map((l) => l.id), ['lineA']);
    } },
    ops: [
      { label: 'POST /:id/lineas (venta de B)', method: 'POST', path: '/saleB/lineas', body: { concepto: 'X', cantidad: 1, precioUnitario: 1 }, expect: [404] },
      { label: 'DELETE /:id/lineas/:lineaId (venta de B)', method: 'DELETE', path: '/saleB/lineas/lineB', expect: [404] },
      { label: 'DELETE /:id/lineas/:lineaId (línea de B bajo venta de A)', method: 'DELETE', path: '/saleA/lineas/lineB', expect: [404] },
    ],
  },
  {
    name: 'customers',
    router: customersRouter,
    writes: ['customer'],
    untouched: [{ model: 'customer', id: 'cB' }],
    list: { path: '/', check: expectItems('cA') },
    ops: [
      { label: 'GET /:id', method: 'GET', path: '/cB', expect: [404] },
      { label: 'PATCH /:id', method: 'PATCH', path: '/cB', body: { nombre: 'Suplantado' }, expect: [404] },
      { label: 'DELETE /:id', method: 'DELETE', path: '/cB', expect: [404] },
      { label: 'POST /:id/convert', method: 'POST', path: '/cB/convert', expect: [404] },
    ],
  },
  {
    name: 'employees (+ horario, hija de employee)',
    router: employeesRouter,
    writes: ['employee', 'employeeSchedule'],
    untouched: [{ model: 'employee', id: 'eB' }, { model: 'employeeSchedule', id: 'schB' }],
    list: { path: '/', check: expectItems('eA') },
    ops: [
      { label: 'PATCH /:id', method: 'PATCH', path: '/eB', body: { nombre: 'Suplantado' }, expect: [404] },
      { label: 'DELETE /:id', method: 'DELETE', path: '/eB', expect: [404] },
      { label: 'GET /:id/horario', method: 'GET', path: '/eB/horario', expect: [404] },
      {
        label: 'PUT /:id/horario',
        method: 'PUT',
        path: '/eB/horario',
        body: { tramos: [{ diaSemana: 2, inicio: '08:00', fin: '09:00' }] },
        expect: [404],
      },
    ],
  },
  {
    name: 'bookings',
    router: bookingsRouter,
    writes: ['booking', 'bookingStatusHistory'],
    untouched: [{ model: 'booking', id: 'bkB' }],
    list: { path: '/', check: expectItems('bkA') },
    ops: [
      { label: 'GET /:id', method: 'GET', path: '/bkB', expect: [404] },
      { label: 'PATCH /:id', method: 'PATCH', path: '/bkB', body: { notes: 'Suplantada' }, expect: [404] },
      { label: 'DELETE /:id', method: 'DELETE', path: '/bkB', expect: [404] },
      { label: 'POST /:id/cancel', method: 'POST', path: '/bkB/cancel', expect: [404] },
    ],
  },
  {
    name: 'categories (equipos + members, hija de team)',
    router: categoriesRouter,
    writes: ['team', 'teamMember'],
    untouched: [{ model: 'team', id: 'teamB' }, { model: 'teamMember', id: 'memberB' }],
    list: { path: '/', check: expectItems('teamA') },
    ops: [
      { label: 'GET /:id', method: 'GET', path: '/teamB', expect: [404] },
      { label: 'PATCH /:id', method: 'PATCH', path: '/teamB', body: { nombre: 'Suplantado' }, expect: [404] },
      { label: 'DELETE /:id', method: 'DELETE', path: '/teamB', expect: [404] },
      { label: 'POST /:id/members', method: 'POST', path: '/teamB/members', body: { employeeId: 'eA', rol: 'Entrenador' }, expect: [404] },
      { label: 'PATCH /:id/members/:memberId (equipo de B)', method: 'PATCH', path: '/teamB/members/memberB', body: { rol: 'X' }, expect: [404] },
      { label: 'DELETE /:id/members/:memberId (equipo de B)', method: 'DELETE', path: '/teamB/members/memberB', expect: [404] },
      { label: 'PATCH /:id/members/:memberId (miembro de B bajo equipo de A)', method: 'PATCH', path: '/teamA/members/memberB', body: { rol: 'X' }, expect: [404] },
      { label: 'DELETE /:id/members/:memberId (miembro de B bajo equipo de A)', method: 'DELETE', path: '/teamA/members/memberB', expect: [404] },
    ],
  },
  {
    name: 'contactos',
    router: contactosRouter,
    writes: ['contacto'],
    untouched: [{ model: 'contacto', id: 'ctB' }],
    list: { path: '/', check: expectItems('ctA') },
    ops: [
      { label: 'GET /:id', method: 'GET', path: '/ctB', expect: [404] },
      { label: 'PATCH /:id', method: 'PATCH', path: '/ctB', body: { nombre: 'Suplantado' }, expect: [404] },
      {
        // El soft delete de contactos es un `updateMany` idempotente (count 0 → 404): sí emite
        // una escritura, así que aquí se fija que su `where` viaja acotado al negocio de A
        // (nunca puede morder la fila de B) y que B queda intacto.
        label: 'DELETE /:id (soft delete vía updateMany)',
        method: 'DELETE',
        path: '/ctB',
        expect: [404],
        writes: [],
        after: () => {
          const writes = fake.writesTo('contacto').filter((w) => w.op === 'updateMany');
          assert.equal(writes.length, 1, 'un único updateMany (idempotente)');
          assert.deepEqual((writes[0]!.args as { where?: unknown }).where, {
            id: 'ctB', businessId: 'A', eliminadoEn: null,
          });
        },
      },
    ],
  },
  {
    name: 'pedidos',
    router: pedidosRouter,
    writes: ['pedido', 'pedidoLine', 'invoice'],
    untouched: [{ model: 'pedido', id: 'pedB' }],
    list: { path: '/', check: expectItems('pedA') },
    ops: [
      { label: 'GET /:id', method: 'GET', path: '/pedB', expect: [404] },
      { label: 'PATCH /:id', method: 'PATCH', path: '/pedB', body: { notas: 'Suplantado' }, expect: [404] },
      { label: 'PUT /:id/status', method: 'PUT', path: '/pedB/status', body: { estado: 'aceptada' }, expect: [404] },
      // `pedidos` NO tiene DELETE: no hay ruta que borre (queda documentado en el informe).
    ],
  },
  {
    name: 'invoices (crudRouter · invoice + PUT /:id/status)',
    router: invoicesRouter(),
    writes: ['invoice'],
    untouched: [{ model: 'invoice', id: 'invB' }],
    list: { path: '/', check: expectItems('invA') },
    ops: [
      { label: 'GET /:id', method: 'GET', path: '/invB', expect: [404] },
      { label: 'PATCH /:id', method: 'PATCH', path: '/invB', body: { cliente: 'Suplantado' }, expect: [404] },
      { label: 'DELETE /:id', method: 'DELETE', path: '/invB', expect: [404] },
      { label: 'PUT /:id/status', method: 'PUT', path: '/invB/status', body: { estado: 'Pagada' }, expect: [404] },
    ],
  },
  {
    name: 'documents',
    router: documentsRouter,
    writes: ['document'],
    untouched: [{ model: 'document', id: 'docB' }],
    list: { path: '/', check: expectItems('docA') },
    ops: [
      { label: 'GET /:id', method: 'GET', path: '/docB', expect: [404] },
      { label: 'PATCH /:id', method: 'PATCH', path: '/docB', body: { titulo: 'Suplantado' }, expect: [404] },
      { label: 'DELETE /:id (hard delete)', method: 'DELETE', path: '/docB', expect: [404] },
    ],
  },
  {
    name: 'reminders',
    router: remindersRouter,
    writes: ['reminder'],
    untouched: [{ model: 'reminder', id: 'remB' }],
    list: { path: '/', check: expectItems('remA') },
    ops: [
      { label: 'PATCH /:id', method: 'PATCH', path: '/remB', body: { titulo: 'Suplantado' }, expect: [404] },
      { label: 'DELETE /:id', method: 'DELETE', path: '/remB', expect: [404] },
    ],
  },
  {
    name: 'visit-states',
    router: visitStatesRouter,
    writes: ['visitState'],
    untouched: [{ model: 'visitState', id: 'vsB' }],
    list: { path: '/', check: expectItems('vsA') },
    ops: [
      { label: 'PATCH /:id', method: 'PATCH', path: '/vsB', body: { nombre: 'Suplantado' }, expect: [404] },
      { label: 'DELETE /:id', method: 'DELETE', path: '/vsB', expect: [404] },
    ],
  },
  {
    name: 'visits',
    router: visitsRouter,
    writes: ['visit', 'customer'],
    untouched: [{ model: 'visit', id: 'visB' }, { model: 'customer', id: 'cB' }],
    list: { path: '/?customerId=cA', check: expectItems('visA') },
    ops: [
      { label: 'GET /?customerId= (cliente de B)', method: 'GET', path: '/?customerId=cB', expect: [404] },
      { label: 'POST / (cliente de B)', method: 'POST', path: '/', body: { customerId: 'cB' }, expect: [404] },
    ],
  },
  {
    name: 'time-off',
    router: timeOffRouter,
    writes: ['timeOffRequest'],
    untouched: [{ model: 'timeOffRequest', id: 'toB' }],
    list: { path: '/', check: expectArray('toA') },
    ops: [
      { label: 'PATCH /:id/approve', method: 'PATCH', path: '/toB/approve', expect: [404] },
      { label: 'PATCH /:id/reject', method: 'PATCH', path: '/toB/reject', expect: [404] },
    ],
  },
  {
    name: 'packages (bonos + customer-packages)',
    router: packagesRouter,
    writes: ['package', 'customerPackage', 'packageSession'],
    untouched: [{ model: 'package', id: 'pkgB' }, { model: 'customerPackage', id: 'cpkB' }],
    list: { path: '/', check: expectArray('pkgA') },
    ops: [
      { label: 'POST /customer-packages/:id/consume-session', method: 'POST', path: '/customer-packages/cpkB/consume-session', body: { bookingId: 'bkA' }, expect: [404] },
      { label: 'POST /assign (cliente de B → 422 cross_tenant)', method: 'POST', path: '/assign', body: { customerId: 'cB', packageId: 'pkgA' }, expect: [422] },
      { label: 'POST /assign (bono de B → 404)', method: 'POST', path: '/assign', body: { customerId: 'cA', packageId: 'pkgB' }, expect: [404] },
    ],
  },
  {
    name: 'config-horario (OpeningHour, hija de location)',
    router: configHorarioRouter,
    writes: ['openingHour'],
    untouched: [{ model: 'openingHour', id: 'hourB' }],
    list: {
      path: '/horario',
      check: (r) => {
        assert.equal(r.status, 200);
        assert.equal(r.body.locationId, 'lA', 'la sucursal resuelta debe ser la de A');
        assert.deepEqual(r.body.tramos, [{ diaSemana: 1, inicio: '09:00', fin: '18:00' }]);
      },
    },
    ops: [
      {
        // No lleva id en el path: el reemplazo del horario debe acotarse a la sucursal de A
        // (el `deleteMany` de la tx) y no tocar el horario de B.
        label: 'PUT /horario (reemplazo del horario de A)',
        method: 'PUT',
        path: '/horario',
        body: { tramos: [{ diaSemana: 2, inicio: '08:00', fin: '09:00' }] },
        expect: [200],
        writes: [],
        after: (r) => {
          assert.equal(r.body.locationId, 'lA');
          const [deleted] = fake.writesTo('openingHour').filter((w) => w.op === 'deleteMany');
          assert.deepEqual(
            (deleted?.args as { where?: unknown })?.where,
            { locationId: 'lA', location: { businessId: 'A' } },
            'el reemplazo del horario debe acotarse a la sucursal y al negocio',
          );
        },
      },
    ],
  },
  {
    name: 'settings (BusinessSetting por categoría, sin id en la ruta)',
    router: settingsRouter,
    writes: ['businessSetting'],
    untouched: [{ model: 'businessSetting', id: 'setB' }],
    list: {
      path: '/marca',
      check: (r) => {
        assert.equal(r.status, 200);
        assert.deepEqual(r.body, { categoria: 'marca', datos: { color: 'A' } });
      },
    },
    ops: [
      {
        label: 'PUT /:categoria (escribe solo el ajuste de A)',
        method: 'PUT',
        path: '/marca',
        body: { datos: { color: 'A2' } },
        expect: [200],
        writes: [],
        after: () => {
          const writes = fake.writesTo('businessSetting');
          assert.equal(writes.length, 1, 'un solo ajuste escrito');
          assert.deepEqual((writes[0]!.args as { where?: unknown }).where, { id: 'setA', businessId: 'A' });
        },
      },
    ],
  },
  {
    name: 'users (membresías del negocio activo)',
    router: usersRouter,
    writes: ['membership'],
    untouched: [{ model: 'membership', id: 'mB' }],
    list: { path: '/', check: (r) => {
      assert.equal(r.status, 200);
      assert.deepEqual((r.body as Array<{ id: string }>).map((u) => u.id), ['uA']);
    } },
    ops: [
      { label: 'PATCH /:id (membresía de B)', method: 'PATCH', path: '/uB', body: { role: 'EMPLOYEE' }, expect: [404] },
      { label: 'DELETE /:id (membresía de B)', method: 'DELETE', path: '/uB', expect: [404] },
    ],
  },
  {
    name: 'tenant-keys (:businessId ajeno)',
    router: tenantKeysRouter,
    writes: ['tenantSecret'],
    untouched: [{ model: 'tenantSecret', id: 'secB' }],
    ops: [
      // Sin membresía en B el gate (`requireMemberAdmin`) corta con su contrato: 404.
      { label: 'GET /:businessId/secrets', method: 'GET', path: '/B/secrets', expect: [404] },
      { label: 'PUT /:businessId/secrets/:name', method: 'PUT', path: '/B/secrets/OPENAI_API_KEY', body: { value: 'sk-ajena' }, expect: [404] },
      { label: 'DELETE /:businessId/secrets/:name', method: 'DELETE', path: '/B/secrets/OPENAI_API_KEY', expect: [404] },
      { label: 'GET /:businessId/secrets/:name/reveal', method: 'GET', path: '/B/secrets/OPENAI_API_KEY/reveal', expect: [404] },
    ],
  },
];

// ---------------------------------------------------------------------------------------
// Ejecución de la tabla
// ---------------------------------------------------------------------------------------
beforeEach(() => fake.reset(seed));

describe('el doble evalúa los filtros por relación con el padre (tablas hijas)', () => {
  // Sin esto, un `where` como `{ location: { businessId: 'A' } }` cuenta como "coincide"
  // SIEMPRE y los tests de fuga de una tabla hija pasarían en vacío.
  type ChildClient = {
    findMany: (a: unknown) => Promise<Array<Row>>;
    findFirst: (a: unknown) => Promise<Row | null>;
  };
  type Row = { id: string };
  const client = fake.client as unknown as Record<string, ChildClient>;

  test('{ padre: { businessId } } deja fuera las filas cuyo padre es de otro negocio', async () => {
    const rows = await client.openingHour!.findMany({ where: { location: { businessId: 'A' } } });
    assert.deepEqual(rows.map((r) => r.id), ['hourA']);
  });

  test('{ padre: { is: { businessId } } } idem (forma explícita de Prisma)', async () => {
    const rows = await client.openingHour!.findMany({ where: { location: { is: { businessId: 'A' } } } });
    assert.deepEqual(rows.map((r) => r.id), ['hourA']);
  });

  test('un id de B no se alcanza con un where de A', async () => {
    const own = await client.employeeSchedule!.findFirst({ where: { id: 'schB', employee: { businessId: 'A' } } });
    assert.equal(own, null, 'el tramo de B no puede ser visible con el filtro de A');
  });

  test('control: sin filtro por el padre SÍ están las filas de A y de B (la aserción no es vacía)', async () => {
    const rows = await runUnscoped(
      'test de fuga: control del doble — leer las hijas de los dos negocios sin filtro',
      async () => await client.openingHour!.findMany({ where: { diaSemana: 1 } }),
    );
    assert.deepEqual(rows.map((r) => r.id), ['hourA', 'hourB']);
  });

  test('el filtro por el padre correcto sigue encontrando la fila propia (lectura intacta)', async () => {
    const own = await client.employeeSchedule!.findFirst({ where: { id: 'schA', employee: { businessId: 'A' } } });
    assert.equal(own?.id, 'schA');
  });
});

for (const family of FAMILIES) {
  describe(`fuga entre negocios · ${family.name}`, () => {
    if (family.list) {
      test(`listar como A devuelve solo las filas de A`, async () => {
        fake.reset(seed);
        const r = await call(family.router, 'GET', family.list!.path, undefined, asA);
        family.list!.check(r);
      });
    }

    for (const op of family.ops) {
      test(`${op.label} con un id de B: contrato ${op.expect.join('|')} y B intacto`, async () => {
        fake.reset(seed);
        const before = structuredClone(await Promise.all(family.untouched.map((u) => readRow(u.model, u.id))));

        const r = await call(family.router, op.method, op.path, op.body, asA);

        assert.ok(
          op.expect.includes(r.status),
          `${op.label}: la ruta respondió ${r.status} y su contrato para un id ajeno es ${op.expect.join('|')} (body: ${JSON.stringify(r.body)})`,
        );

        const models = op.writes ?? family.writes;
        const writes = fake.writes.filter((w) => WRITE_OPS.has(w.op) && models.includes(w.model));
        assert.equal(
          writes.length,
          0,
          `un id de B no puede generar escrituras (${writes.map((w) => `${w.model}.${w.op}`).join(', ')})`,
        );

        const after = await Promise.all(family.untouched.map((u) => readRow(u.model, u.id)));
        assert.deepEqual(after, before, 'las filas del negocio B deben quedar byte-identical');

        op.after?.(r);
      });
    }
  });
}
