import { prisma } from '../../prisma.js';

// Empleado espejo del ADMIN del negocio (vertical `comerciales`). En este vertical el
// responsable (admin) actúa como comercial de campo, así que la lista de "empleados"
// (asignables a una cita/booking) DEBE incluirlo. Como el booking valida `employeeId`
// contra una fila real de crm.empleado, el admin necesita su propia fila de Employee.
//
// CLAVE DE IDEMPOTENCIA (tenancy-safe): el par (businessId, email del admin). NO se usa
// Employee.userId como clave porque es @unique GLOBAL: un mismo usuario sólo puede ligarse
// a UN empleado en toda la BD, de modo que un admin que administra varios negocios sólo
// podría ser empleado en uno. Por eso:
//   - Si el admin aún no es empleado en NINGÚN negocio → se crea con el link userId.
//   - Si ya es empleado en OTRO negocio → se crea en ESTE con userId=null (link imposible
//     por el constraint único), quedando identificado por email dentro del negocio.
// La búsqueda previa por (businessId, userId|email) evita duplicados en relanzamientos.

// Fila de membresía ADMIN + datos del usuario necesarios para materializar el Employee.
interface AdminMembershipRow {
  userId: string;
  user: { firstName: string; lastName: string | null; email: string };
}

// Superficie mínima de Prisma que consume el helper. Tipada aparte para poder inyectar
// un doble en los tests unitarios sin depender de una BD viva.
export interface AdminEmployeeDb {
  membership: {
    findMany(args: {
      where: { businessId: string; role: 'ADMIN' };
      select: { userId: true; user: { select: { firstName: true; lastName: true; email: true } } };
    }): Promise<AdminMembershipRow[]>;
  };
  employee: {
    // Empleado del admin YA presente EN ESTE negocio (activo), por userId o por email.
    findFirst(args: {
      where: { businessId: string; eliminadoEn: null; OR: [{ userId: string }, { email: string }] };
    }): Promise<{ id: string } | null>;
    // ¿El usuario ya está ligado a un empleado en cualquier negocio? (constraint @unique global).
    findUnique(args: { where: { userId: string } }): Promise<{ id: string } | null>;
    create(args: {
      data: {
        businessId: string;
        userId: string | null;
        nombre: string;
        apellido: string | null;
        email: string;
        rol: string;
      };
    }): Promise<{ id: string; nombre: string; apellido: string | null; userId: string | null; businessId: string }>;
  };
}

export interface EnsuredEmployee {
  id: string;
  nombre: string;
  apellido: string | null;
  userId: string | null;
  businessId: string;
}

/**
 * Garantiza que todo usuario con membresía ADMIN del negocio tenga una fila
 * crm.empleado en ESE negocio. Idempotente: no crea duplicados en relanzamientos
 * (busca por Employee.userId, que es único). Devuelve sólo los empleados creados
 * en esta ejecución (vacío si ya existían todos).
 *
 * Scoping tenant: sólo consulta membresías del `businessId` recibido y crea el
 * Employee con ese mismo `businessId`.
 */
export async function ensureAdminEmployee(
  businessId: string,
  db: AdminEmployeeDb = prisma as unknown as AdminEmployeeDb,
): Promise<EnsuredEmployee[]> {
  const admins = await db.membership.findMany({
    where: { businessId, role: 'ADMIN' },
    select: { userId: true, user: { select: { firstName: true, lastName: true, email: true } } },
  });

  const created: EnsuredEmployee[] = [];
  for (const m of admins) {
    // ¿Ya es empleado EN ESTE negocio? (por userId o por email) → idempotente, no duplicar.
    const inThisBusiness = await db.employee.findFirst({
      where: { businessId, eliminadoEn: null, OR: [{ userId: m.userId }, { email: m.user.email }] },
    });
    if (inThisBusiness) continue;

    // Si el usuario ya está ligado a un empleado en OTRO negocio, no se puede reutilizar el
    // link (Employee.userId @unique global) → se crea con userId=null (clave por email).
    const linkedElsewhere = await db.employee.findUnique({ where: { userId: m.userId } });

    // El create puede chocar con P2002 si dos peticiones concurrentes (p.ej. dos GET
    // /employees en paralelo) intentan materializar el mismo admin a la vez y colisionan en
    // Employee.userId (@unique global). En ese caso el empleado ya quedó creado por la otra
    // petición → se trata como "ya existe" y se salta, en vez de propagar un 500.
    try {
      const emp = await db.employee.create({
        data: {
          businessId,
          userId: linkedElsewhere ? null : m.userId,
          nombre: m.user.firstName,
          apellido: m.user.lastName,
          email: m.user.email,
          rol: 'Administrador',
        },
      });
      created.push(emp);
    } catch (err) {
      if ((err as { code?: string })?.code === 'P2002') continue; // creado en paralelo: idempotente
      throw err;
    }
  }
  return created;
}
