import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ensureAdminEmployee, type AdminEmployeeDb } from '../admin-employee.js';

// ensureAdminEmployee (vertical comerciales): materializa un crm.empleado por cada
// usuario ADMIN del negocio, idempotente y acotado al businessId. Se prueba con un
// doble en memoria del cliente Prisma (sin BD viva).

interface FakeMembership { businessId: string; role: string; userId: string; user: { firstName: string; lastName: string | null; email: string } }
interface FakeEmployee { id: string; businessId: string; userId: string | null; nombre: string; apellido: string | null; email: string; rol: string; eliminadoEn?: Date | null }

function makeDb(memberships: FakeMembership[], employees: FakeEmployee[] = []) {
  let seq = employees.length;
  const createCalls: FakeEmployee[] = [];
  const findManyWheres: { businessId: string; role: string }[] = [];
  const db: AdminEmployeeDb = {
    membership: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async findMany(args: any) {
        findManyWheres.push(args.where);
        return memberships
          .filter((m) => m.businessId === args.where.businessId && m.role === args.where.role)
          .map((m) => ({ userId: m.userId, user: m.user }));
      },
    },
    employee: {
      async findFirst(args) {
        const { businessId, OR } = args.where;
        const [byUser, byEmail] = OR;
        return employees.find((e) =>
          e.businessId === businessId && e.eliminadoEn == null &&
          (e.userId === byUser.userId || e.email === byEmail.email),
        ) ?? null;
      },
      async findUnique(args) {
        return employees.find((e) => e.userId === args.where.userId) ?? null;
      },
      async create(args) {
        const emp: FakeEmployee = { id: `emp_${++seq}`, ...args.data };
        employees.push(emp);
        createCalls.push(emp);
        return emp;
      },
    },
  };
  return { db, createCalls, findManyWheres, employees };
}

describe('ensureAdminEmployee', () => {
  test('crea un Employee para el usuario ADMIN del negocio (nombre/apellido/email)', async () => {
    const { db, createCalls } = makeDb([
      { businessId: 'biz1', role: 'ADMIN', userId: 'u1', user: { firstName: 'Comercial', lastName: 'Demo', email: 'a@x.es' } },
    ]);
    const created = await ensureAdminEmployee('biz1', db);
    assert.equal(created.length, 1);
    assert.equal(createCalls.length, 1);
    assert.equal(createCalls[0].businessId, 'biz1');
    assert.equal(createCalls[0].userId, 'u1');
    assert.equal(createCalls[0].nombre, 'Comercial');
    assert.equal(createCalls[0].apellido, 'Demo');
    assert.equal(createCalls[0].email, 'a@x.es');
    assert.equal(createCalls[0].rol, 'Administrador');
  });

  test('es idempotente: una segunda ejecución no crea duplicados', async () => {
    const shared: FakeEmployee[] = [];
    const first = makeDb([
      { businessId: 'biz1', role: 'ADMIN', userId: 'u1', user: { firstName: 'Ada', lastName: null, email: 'a@x.es' } },
    ], shared);
    await ensureAdminEmployee('biz1', first.db);
    assert.equal(first.createCalls.length, 1);

    // Segunda llamada con el MISMO array de empleados (ya contiene u1) → no crea.
    const second = makeDb([
      { businessId: 'biz1', role: 'ADMIN', userId: 'u1', user: { firstName: 'Ada', lastName: null, email: 'a@x.es' } },
    ], shared);
    const created2 = await ensureAdminEmployee('biz1', second.db);
    assert.equal(created2.length, 0);
    assert.equal(second.createCalls.length, 0);
    assert.equal(shared.length, 1);
  });

  test('scoping tenant: sólo consulta ADMIN del businessId recibido y no toca otros negocios', async () => {
    const { db, createCalls, findManyWheres } = makeDb([
      { businessId: 'biz1', role: 'ADMIN', userId: 'u1', user: { firstName: 'A', lastName: null, email: 'a@x.es' } },
      { businessId: 'biz2', role: 'ADMIN', userId: 'u2', user: { firstName: 'B', lastName: null, email: 'b@x.es' } },
    ]);
    await ensureAdminEmployee('biz1', db);
    assert.deepEqual(findManyWheres, [{ businessId: 'biz1', role: 'ADMIN' }]);
    assert.equal(createCalls.length, 1);
    assert.equal(createCalls[0].userId, 'u1');
    assert.equal(createCalls[0].businessId, 'biz1');
  });

  test('ignora membresías no ADMIN (el filtro role=ADMIN excluye EMPLOYEE/MANAGER/CLIENT)', async () => {
    const { db, createCalls } = makeDb([
      { businessId: 'biz1', role: 'EMPLOYEE', userId: 'u1', user: { firstName: 'A', lastName: null, email: 'a@x.es' } },
      { businessId: 'biz1', role: 'MANAGER', userId: 'u2', user: { firstName: 'B', lastName: null, email: 'b@x.es' } },
    ]);
    const created = await ensureAdminEmployee('biz1', db);
    assert.equal(created.length, 0);
    assert.equal(createCalls.length, 0);
  });

  test('admin ya empleado en OTRO negocio → crea en éste con userId=null (constraint @unique global)', async () => {
    // El usuario u1 ya es empleado en biz-otro (email null en esa fila legacy).
    const preexisting: FakeEmployee[] = [
      { id: 'emp_old', businessId: 'bizOtro', userId: 'u1', nombre: 'Comercial', apellido: 'Demo', email: '', rol: 'Comercial de campo' },
    ];
    const { db, createCalls } = makeDb([
      { businessId: 'biz1', role: 'ADMIN', userId: 'u1', user: { firstName: 'Adrián', lastName: 'Chozas', email: 'a@x.es' } },
    ], preexisting);
    const created = await ensureAdminEmployee('biz1', db);
    assert.equal(created.length, 1);
    assert.equal(createCalls.length, 1);
    assert.equal(createCalls[0].businessId, 'biz1');
    assert.equal(createCalls[0].userId, null, 'no reutiliza el link userId (ya usado en otro negocio)');
    assert.equal(createCalls[0].email, 'a@x.es');

    // Re-run idempotente: la fila recién creada (userId=null) se detecta por email.
    const created2 = await ensureAdminEmployee('biz1', db);
    assert.equal(created2.length, 0);
  });

  test('múltiples admins: crea sólo los que faltan', async () => {
    const preexisting: FakeEmployee[] = [
      { id: 'emp_1', businessId: 'biz1', userId: 'u1', nombre: 'A', apellido: null, email: 'a@x.es', rol: 'Administrador' },
    ];
    const { db, createCalls } = makeDb([
      { businessId: 'biz1', role: 'ADMIN', userId: 'u1', user: { firstName: 'A', lastName: null, email: 'a@x.es' } },
      { businessId: 'biz1', role: 'ADMIN', userId: 'u2', user: { firstName: 'C', lastName: null, email: 'c@x.es' } },
    ], preexisting);
    const created = await ensureAdminEmployee('biz1', db);
    assert.equal(created.length, 1);
    assert.equal(createCalls.length, 1);
    assert.equal(createCalls[0].userId, 'u2');
  });
});
