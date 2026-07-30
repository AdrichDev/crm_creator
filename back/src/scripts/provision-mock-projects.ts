import 'dotenv/config';
import { prisma } from '../prisma.js';
import {
  createProjectService,
  tenantExists,
  type CreateProjectDeps,
  type ProjectConfig,
} from '../lib/projects/create-project-service.js';
import type { Prisma, ResourceType } from '../lib/generated/prisma/client.js';

// Provisión del CRM de los cuatro clientes mock sectoriales (openspec
// `aa-reservas-multirecurso-y-mocks-sectoriales`, T6.3/T6.4).
//
// Orden que impone el producto: primero CLIENTE, luego CRM, luego bot. Los cuatro mocks ya
// existen como clientes en `aa.tenant` con su código `cli-NN` de la secuencia real (T6.1), y
// como agentes con su catálogo (`scripts/seed-mock-tenants.ts` en agents-agency). Lo que
// faltaba era el proyecto de CRM: sin fila en `crm.negocio` + `crm.membresia` el cliente no
// aparece en /proyectos, porque el listado va POR MEMBRESÍA, no por tenant.
//
// FUENTE ÚNICA: el catálogo se LEE de `aa.*`, no se vuelve a escribir a mano aquí. Duplicar
// las definiciones en dos scripts garantiza deriva; espejar por lectura no. El cruce va por
// `$queryRaw` porque `aa.*` no está modelado en Prisma (sin multiSchema), igual que el resto
// del CRM.
//
// El alta usa `createProjectService`, la MISMA que POST /projects y el operador: Business +
// Location + BusinessSetting(config) + Membership(ADMIN) + estados de visita, en 1 transacción.
// No se insertan filas a mano.
//
// La config guardada lleva solo `business` (nombre + vertical) y contacto: SIN `modules`, para
// que `deserialize()` devuelva null y el front derive el preset de `configFromVertical(vertical)`.
// Así el catálogo de módulos vive en un único sitio (el front) y no se congela una copia aquí.
//
// Lo que NO se inventa: `aa.servicio_agente` no tiene precio, así que los servicios del CRM
// nacen a 0 €. Es preferible un precio vacío a una tarifa fabricada.
//
// Idempotente: reejecutable. Si ya hay negocio para ese tenant lo reutiliza y RESINCRONIZA el
// catálogo (empleados, recursos, servicios, horarios) en vez de duplicarlo.
//
// Ejecutar:  cd back && npx tsx src/scripts/provision-mock-projects.ts
// Teardown:  cd back && npx tsx src/scripts/provision-mock-projects.ts --teardown

/** Nombre del cliente en `aa.tenant` → vertical del CRM. */
const MOCKS: { tenant: string; vertical: string }[] = [
  { tenant: 'Brasserie Lafayette', vertical: 'hosteleria' },
  { tenant: 'Barbería Núñez', vertical: 'peluqueria' },
  { tenant: 'Estética Aurea', vertical: 'estetica' },
  { tenant: 'Casa Mendieta', vertical: 'hosteleria' },
];

/** Propietario de los proyectos mock: recibe la membresía ADMIN. */
const OWNER_EMAIL = process.env.MOCK_OWNER_EMAIL ?? 'achozas9@gmail.com';

/**
 * `aa.recurso.tipo` → `ResourceType` del CRM. `staff` NO cae aquí: un barbero es una persona,
 * va a `crm.empleado`, no al inventario de mobiliario.
 */
const TIPO_RECURSO: Record<string, ResourceType> = {
  table: 'TABLE',
  room: 'CABIN',
};

/** Claves del horario de AA → `dia_semana` del CRM (0=domingo .. 6=sábado). */
const DIA_SEMANA: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

interface TenantRow {
  id: string;
  codigo: string | null;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  email: string | null;
}
interface AgentRow { id: string; nombre: string }
interface ResourceRow {
  id: string;
  nombre: string;
  tipo: string;
  capacidad_min: number;
  capacidad_max: number;
  zona: string | null;
}
interface ServiceRow {
  id: string;
  nombre: string;
  duracion: number;
  descripcion: string | null;
  buffer_minutos: number;
}
interface LinkRow { servicio_id: string; recurso_id: string }

const deps: CreateProjectDeps = {
  tenantExists: (tenantId) => tenantExists(prisma, tenantId),
  transaction: (fn) => prisma.$transaction(fn),
};

/** Lee el catálogo del agente en AA: recursos, servicios, enlaces y horario. */
async function leerCatalogoAA(agentId: string) {
  const recursos = await prisma.$queryRaw<ResourceRow[]>`
    SELECT id, nombre, tipo, capacidad_min, capacidad_max, zona
    FROM aa.recurso WHERE agente_id = ${agentId} AND activo = true ORDER BY nombre`;
  const servicios = await prisma.$queryRaw<ServiceRow[]>`
    SELECT id, nombre, duracion, descripcion, buffer_minutos
    FROM aa.servicio_agente WHERE agente_id = ${agentId} AND activo = true ORDER BY nombre`;
  const enlaces = await prisma.$queryRaw<LinkRow[]>`
    SELECT sr.servicio_id, sr.recurso_id
    FROM aa.servicio_recurso sr
    JOIN aa.servicio_agente s ON s.id = sr.servicio_id
    WHERE s.agente_id = ${agentId}`;
  const horario = await prisma.$queryRaw<{ horario: unknown }[]>`
    SELECT horario FROM aa.horario_agente WHERE agente_id = ${agentId} LIMIT 1`;
  return { recursos, servicios, enlaces, horario: (horario[0]?.horario ?? {}) as Record<string, string> };
}

/**
 * Espeja el horario del agente en las franjas de apertura de la sede. Una clave puede traer
 * varios turnos separados por `|` ("13:00-16:00|19:30-23:00"): cada turno es una fila.
 */
async function sincronizarHorario(locationId: string, horario: Record<string, string>) {
  const filas: { locationId: string; diaSemana: number; apertura: string; cierre: string }[] = [];
  for (const [clave, valor] of Object.entries(horario)) {
    const diaSemana = DIA_SEMANA[clave];
    if (diaSemana === undefined || !valor) continue;
    for (const turno of valor.split('|')) {
      const [apertura, cierre] = turno.split('-');
      if (!apertura || !cierre) continue;
      filas.push({ locationId, diaSemana, apertura: apertura.trim(), cierre: cierre.trim() });
    }
  }
  // Reemplazo completo: el horario de AA manda, no se acumulan franjas de ejecuciones previas.
  await prisma.openingHour.deleteMany({ where: { locationId } });
  if (filas.length > 0) await prisma.openingHour.createMany({ data: filas });
  return filas.length;
}

/** Empleados a partir de los recursos `staff` (personas), idempotente por (negocio, nombre). */
async function sincronizarEmpleados(businessId: string, locationId: string, staff: ResourceRow[]) {
  const porNombre = new Map<string, string>();
  for (const r of staff) {
    const existente = await prisma.employee.findFirst({
      where: { businessId, nombre: r.nombre, eliminadoEn: null },
      select: { id: true },
    });
    const datos = { locationId, especialidad: r.zona ?? null };
    const emp = existente
      ? await prisma.employee.update({ where: { id: existente.id }, data: datos })
      : await prisma.employee.create({ data: { businessId, nombre: r.nombre, ...datos } });
    porNombre.set(r.nombre, emp.id);
  }
  return porNombre;
}

/** Recursos físicos (mesas, cabinas), idempotente por (negocio, nombre). */
async function sincronizarRecursos(businessId: string, locationId: string, fisicos: ResourceRow[]) {
  const porNombre = new Map<string, string>();
  for (const r of fisicos) {
    const datos = {
      locationId,
      tipo: TIPO_RECURSO[r.tipo] ?? ('OTHER' as ResourceType),
      // El CRM guarda un aforo único; el máximo de AA es el que decide si el grupo cabe.
      capacidad: r.capacidad_max,
      notaUbicacion: r.zona ?? null,
    };
    const existente = await prisma.resource.findFirst({
      where: { businessId, nombre: r.nombre, eliminadoEn: null },
      select: { id: true },
    });
    const rec = existente
      ? await prisma.resource.update({ where: { id: existente.id }, data: datos })
      : await prisma.resource.create({ data: { businessId, nombre: r.nombre, ...datos } });
    porNombre.set(r.nombre, rec.id);
  }
  return porNombre;
}

/** Servicios + sus enlaces a recursos/empleados, idempotente por (negocio, nombre). */
async function sincronizarServicios(
  businessId: string,
  servicios: ServiceRow[],
  enlaces: LinkRow[],
  recursosAA: ResourceRow[],
  idsRecursoCRM: Map<string, string>,
  idsEmpleadoCRM: Map<string, string>,
) {
  const recursoPorId = new Map(recursosAA.map((r) => [r.id, r]));
  for (const s of servicios) {
    const explicitos = enlaces
      .filter((e) => e.servicio_id === s.id)
      .map((e) => recursoPorId.get(e.recurso_id))
      .filter((r): r is ResourceRow => Boolean(r));
    // Sin vínculos explícitos, AA considera elegible TODO el inventario del agente
    // (`appointments.ts`: "Sin vinculos explicitos, todo el inventario del agente presta el
    // servicio"). Espejar la lista vacía como "sin recursos" invertiría el significado: la
    // Cena de Lafayette pasaría de 12 mesas a ninguna.
    const asignados = explicitos.length > 0 ? explicitos : recursosAA;
    const staff = asignados.filter((r) => r.tipo === 'staff');
    const fisicos = asignados.filter((r) => r.tipo !== 'staff');
    const datos = {
      descripcion: s.descripcion,
      duracion: s.duracion,
      // `bufferMin` de AA ocupa el recurso DESPUÉS del servicio: es margen posterior.
      margenDespues: s.buffer_minutos,
      requiereRecurso: fisicos.length > 0,
      tipoRecurso: fisicos.length > 0 ? TIPO_RECURSO[fisicos[0]!.tipo] ?? ('OTHER' as ResourceType) : null,
      requiereProfesional: staff.length > 0,
    };
    const idsFisicos = fisicos.map((r) => ({ id: idsRecursoCRM.get(r.nombre)! }));
    const idsStaff = staff.map((r) => ({ id: idsEmpleadoCRM.get(r.nombre)! }));
    const existente = await prisma.service.findFirst({
      where: { businessId, nombre: s.nombre, eliminadoEn: null },
      select: { id: true },
    });
    if (existente) {
      // `set` reemplaza los enlaces: el catálogo de AA manda también al resincronizar.
      await prisma.service.update({
        where: { id: existente.id },
        data: { ...datos, resources: { set: idsFisicos }, employees: { set: idsStaff } },
      });
    } else {
      await prisma.service.create({
        data: {
          businessId, nombre: s.nombre, ...datos,
          resources: { connect: idsFisicos },
          employees: { connect: idsStaff },
        },
      });
    }
  }
}

async function provisionar(owner: { id: string; email: string }) {
  for (const mock of MOCKS) {
    const [tenant] = await prisma.$queryRaw<TenantRow[]>`
      SELECT id, codigo, nombre, direccion, telefono, email
      FROM aa.tenant WHERE nombre = ${mock.tenant} AND activo = true LIMIT 1`;
    if (!tenant) {
      console.log(`SKIP  ${mock.tenant}: no existe como cliente en aa.tenant`);
      continue;
    }
    const [agent] = await prisma.$queryRaw<AgentRow[]>`
      SELECT id, nombre FROM aa.agente WHERE tenant_id = ${tenant.id} ORDER BY creado_en ASC LIMIT 1`;
    if (!agent) {
      console.log(`SKIP  ${mock.tenant}: el cliente no tiene agente en AA`);
      continue;
    }

    const config: ProjectConfig = {
      business: {
        name: tenant.nombre,
        vertical: mock.vertical,
        clienteId: tenant.id,
      },
    };

    let business = await prisma.business.findFirst({
      where: { tenantId: tenant.id, eliminadoEn: null },
      select: { id: true },
    });
    let creado = false;
    if (!business) {
      const alta = await createProjectService({ tenantId: tenant.id, userId: owner.id, config }, deps);
      if (!alta.ok) {
        console.log(`ERROR ${mock.tenant}: ${alta.error}`);
        continue;
      }
      business = { id: alta.business.id };
      creado = true;
    } else {
      // Reejecución: refresca las columnas espejo y la config por si cambió el nombre/vertical.
      await prisma.business.update({
        where: { id: business.id },
        data: { nombre: tenant.nombre, vertical: mock.vertical },
      });
      const ajuste = await prisma.businessSetting.findFirst({
        where: { businessId: business.id, categoria: 'config' },
        select: { id: true },
      });
      if (ajuste) {
        await prisma.businessSetting.update({
          where: { id: ajuste.id },
          data: { datos: config as Prisma.InputJsonValue },
        });
      }
      // La membresía del propietario debe existir aunque el negocio venga de antes.
      const membresia = await prisma.membership.findFirst({
        where: { businessId: business.id, userId: owner.id },
        select: { id: true },
      });
      if (!membresia) {
        await prisma.membership.create({
          data: { businessId: business.id, userId: owner.id, role: 'ADMIN' },
        });
      }
    }

    const location = await prisma.location.findFirst({
      where: { businessId: business.id, eliminadoEn: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!location) {
      console.log(`ERROR ${mock.tenant}: el negocio no tiene sede`);
      continue;
    }
    // Ficha de la sede desde los datos del cliente: dirección, teléfono y email reales.
    await prisma.location.update({
      where: { id: location.id },
      data: {
        direccion: tenant.direccion,
        telefono: tenant.telefono,
        email: tenant.email,
      },
    });

    const catalogo = await leerCatalogoAA(agent.id);
    const staff = catalogo.recursos.filter((r) => r.tipo === 'staff');
    const fisicos = catalogo.recursos.filter((r) => r.tipo !== 'staff');
    const idsEmpleado = await sincronizarEmpleados(business.id, location.id, staff);
    const idsRecurso = await sincronizarRecursos(business.id, location.id, fisicos);
    await sincronizarServicios(
      business.id, catalogo.servicios, catalogo.enlaces, catalogo.recursos, idsRecurso, idsEmpleado,
    );
    const franjas = await sincronizarHorario(location.id, catalogo.horario);

    console.log(
      `${creado ? 'ALTA ' : 'SYNC '} ${(tenant.codigo ?? '-').padEnd(7)} ${tenant.nombre.padEnd(22)} ` +
      `negocio=${business.id} vertical=${mock.vertical} | ` +
      `servicios=${catalogo.servicios.length} recursos=${fisicos.length} empleados=${staff.length} franjas=${franjas}`,
    );
  }
}

/** Borra los negocios de los clientes mock. Solo toca esos cuatro tenants. */
async function teardown() {
  for (const mock of MOCKS) {
    const [tenant] = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM aa.tenant WHERE nombre = ${mock.tenant} LIMIT 1`;
    if (!tenant) continue;
    const borrados = await prisma.business.deleteMany({ where: { tenantId: tenant.id } });
    console.log(`TEARDOWN ${mock.tenant}: ${borrados.count} negocio(s) borrado(s)`);
  }
}

async function main() {
  if (process.argv.includes('--teardown')) {
    await teardown();
    return;
  }
  const owner = await prisma.user.findUnique({
    where: { email: OWNER_EMAIL },
    select: { id: true, email: true },
  });
  if (!owner) {
    throw new Error(`No existe el usuario propietario ${OWNER_EMAIL} en crm.usuario`);
  }
  console.log(`Propietario: ${owner.email} (${owner.id})\n`);
  await provisionar(owner);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
