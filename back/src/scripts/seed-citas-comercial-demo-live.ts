import 'dotenv/config';
import { prisma } from '../prisma.js';
import { BookingStatus } from '../lib/generated/prisma/client.js';

// Seed EN VIVO de Citas (Booking/reserva) para "Comercial Demo IA" — crm-operaos-agenda-contactos.
// Crea (si faltan) un catálogo mínimo de servicios comerciales reales y genera ~22 citas
// repartidas entre junio y julio de 2026, mezclando clientes reales (crm.cliente) y leads
// (crm.contacto). Booking no tiene FK a Contacto, así que el nombre del lead va en las notas.
//
// Convención horaria: el resto del repo trata startAt/endAt como "hora de pared" en UTC
// (bookings.ts hace `b.startAt.toISOString().slice(11,16)` para mostrar la hora sin conversión
// de zona), así que aquí se construyen las fechas con Date.UTC(...) directamente.
//
// employeeId se deja SIEMPRE null (no depende del agente paralelo que gestiona el Employee admin).
//
// Formato canónico de notas (lo consume el parser de Agenda de otro agente):
//   Cliente real:  "Acción: <accion> | Canal: <canal>"
//   Lead/contacto: "Lead: <nombre> — Acción: <accion> | Canal: <canal>"
//
// Idempotente: antes de crear cada cita se comprueba si ya existe una reserva del negocio en
// esa misma sucursal + startAt exacto (combinación estable y determinista); si existe, se
// salta. Reejecutable sin duplicar.
//
// Ejecutar: cd back && npx tsx src/scripts/seed-citas-comercial-demo-live.ts

const BUSINESS_ID = 'cmr84anhw00005ofx8ba2w4sh'; // "Comercial Demo IA" (demo en vivo)

interface ServicioDef { nombre: string; duracion: number; }
const SERVICIOS: ServicioDef[] = [
  { nombre: 'Visita comercial', duracion: 45 },
  { nombre: 'Llamada de seguimiento', duracion: 30 },
  { nombre: 'Reunión', duracion: 60 },
  { nombre: 'Demostración', duracion: 45 },
  { nombre: 'Presentación de presupuesto', duracion: 60 },
];

const ACCIONES = [
  'Visita comercial', 'Llamada de seguimiento', 'Reunión', 'Demostración de producto',
  'Presentación de presupuesto', 'Firma de contrato', 'Prospección', 'Visita de cortesía',
];
const CANALES = ['Presencial', 'Videollamada', 'Llamada'];

// "Hoy" de referencia para el reparto pasado/futuro: 2026-07-06.
// 8 citas pasadas (5 junio + 3 julio antes de hoy) + 14 futuras (julio después de hoy) = 22.
const ESTADOS_PASADO = ['COMPLETED', 'COMPLETED', 'CANCELLED', 'COMPLETED', 'NO_SHOW', 'COMPLETED', 'COMPLETED', 'CANCELLED'];
const ESTADOS_FUTURO = ['CONFIRMED', 'PENDING', 'CONFIRMED', 'PENDING', 'CONFIRMED', 'PENDING', 'DRAFT', 'CONFIRMED', 'PENDING', 'CONFIRMED', 'CANCELLED', 'PENDING', 'CONFIRMED', 'PENDING'];

const FECHAS_PASADO: [number, number][] = [ // [mes, día] 2026, todas antes de hoy 2026-07-06
  [6, 8], [6, 15], [6, 19], [6, 24], [6, 29], // junio
  [7, 2], [7, 3], [7, 4], // julio (antes de hoy)
];
const FECHAS_FUTURO: [number, number][] = [ // julio, después de hoy 2026-07-06
  [7, 8], [7, 9], [7, 10], [7, 13], [7, 14], [7, 16], [7, 17],
  [7, 20], [7, 21], [7, 23], [7, 24], [7, 27], [7, 28], [7, 31],
];

interface CitaPlan {
  month: number; day: number; hour: number; minute: number; estado: string;
}

function buildPlan(): CitaPlan[] {
  const plan: CitaPlan[] = [];
  FECHAS_PASADO.forEach(([month, day], i) => {
    const hour = 9 + ((i * 3) % 10); // 09..19
    const minute = (i % 2) * 30;
    plan.push({ month, day, hour, minute, estado: ESTADOS_PASADO[i % ESTADOS_PASADO.length] });
  });
  FECHAS_FUTURO.forEach(([month, day], i) => {
    const hour = 9 + ((i * 4) % 11); // 09..19
    const minute = (i % 2) * 30;
    plan.push({ month, day, hour, minute, estado: ESTADOS_FUTURO[i % ESTADOS_FUTURO.length] });
  });
  return plan;
}

async function main() {
  const business = await prisma.business.findUnique({ where: { id: BUSINESS_ID } });
  if (!business) {
    console.error(`ESCALATE: negocio ${BUSINESS_ID} no encontrado. Revisa DATABASE_URL / tenant.`);
    process.exit(1);
  }
  console.log(`\n== Seed citas comerciales — ${business.nombre} (${business.id}) ==\n`);

  const location = await prisma.location.findFirst({ where: { businessId: BUSINESS_ID } });
  if (!location) {
    console.error(`ESCALATE: no hay ninguna sucursal (Location) para el negocio ${BUSINESS_ID}.`);
    process.exit(1);
  }
  console.log(`Sucursal: ${location.nombre} (${location.id})`);

  // 1) Servicios comerciales reales — idempotente por (negocio, nombre).
  console.log(`\n-- Asegurando catálogo de servicios comerciales --`);
  const serviceIds: Record<string, string> = {};
  for (const s of SERVICIOS) {
    const existing = await prisma.service.findFirst({ where: { businessId: BUSINESS_ID, nombre: s.nombre } });
    if (existing) {
      serviceIds[s.nombre] = existing.id;
      console.log(`  = ${s.nombre} ya existía (id ${existing.id})`);
      continue;
    }
    const created = await prisma.service.create({
      data: {
        businessId: BUSINESS_ID,
        nombre: s.nombre,
        duracion: s.duracion,
        precio: 0,
        requiereProfesional: false,
        requiereRecurso: false,
        reservableOnline: false,
      },
    });
    serviceIds[s.nombre] = created.id;
    console.log(`  + ${s.nombre} creado (id ${created.id}, ${s.duracion} min)`);
  }

  // 2) Clientes reales + leads/contactos reales del negocio (orden estable, no se crean).
  const customers = await prisma.customer.findMany({
    where: { businessId: BUSINESS_ID, eliminadoEn: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true, nombre: true, apellido: true },
  });
  const contactos = await prisma.contacto.findMany({
    where: { businessId: BUSINESS_ID, eliminadoEn: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true, nombre: true },
  });
  if (customers.length === 0) {
    console.error(`ESCALATE: 0 clientes en el negocio ${BUSINESS_ID}; se necesitan clientes reales.`);
    process.exit(1);
  }
  if (contactos.length === 0) {
    console.error(`ESCALATE: 0 contactos/leads en el negocio ${BUSINESS_ID}; se necesitan leads reales.`);
    process.exit(1);
  }
  console.log(`\nClientes disponibles: ${customers.length}. Leads disponibles: ${contactos.length}.`);

  // 3) Plan determinista de citas (junio + julio 2026).
  const plan = buildPlan();
  console.log(`Generando ${plan.length} citas (${FECHAS_PASADO.length} junio/julio pasado, ${FECHAS_FUTURO.length} julio futuro)...\n`);

  let creadas = 0;
  let saltadas = 0;
  let customerCounter = 0;
  let leadCounter = 0;

  for (let i = 0; i < plan.length; i++) {
    const p = plan[i];
    const startAt = new Date(Date.UTC(2026, p.month - 1, p.day, p.hour, p.minute, 0));
    const isLead = i % 2 === 1; // alterna cliente real / lead ~ 50%
    const servicio = SERVICIOS[i % SERVICIOS.length];
    const serviceId = serviceIds[servicio.nombre];
    const endAt = new Date(startAt.getTime() + servicio.duracion * 60000);
    const accion = ACCIONES[i % ACCIONES.length];
    const canal = CANALES[i % CANALES.length];

    let customerId: string | null = null;
    let notes: string;
    if (isLead) {
      const lead = contactos[leadCounter % contactos.length];
      leadCounter++;
      notes = `Lead: ${lead.nombre} — Acción: ${accion} | Canal: ${canal}`;
    } else {
      const customer = customers[customerCounter % customers.length];
      customerCounter++;
      customerId = customer.id;
      notes = `Acción: ${accion} | Canal: ${canal}`;
    }

    // Idempotencia: misma sucursal + mismo startAt exacto ⇒ ya generado en un run previo.
    const existente = await prisma.booking.findFirst({
      where: { businessId: BUSINESS_ID, locationId: location.id, startAt },
    });
    if (existente) {
      saltadas++;
      console.log(`  = ${startAt.toISOString()} ya existía (id ${existente.id}); se salta.`);
      continue;
    }

    const booking = await prisma.booking.create({
      data: {
        businessId: BUSINESS_ID,
        locationId: location.id,
        customerId,
        serviceId,
        employeeId: null,
        startAt,
        endAt,
        status: p.estado as BookingStatus, // valor validado contra el enum BookingStatus del plan
        channel: 'MANUAL',
        notes,
      },
    });
    creadas++;
    console.log(`  + ${startAt.toISOString().slice(0, 16).replace('T', ' ')} — ${notes} — ${p.estado} (id ${booking.id})`);
  }

  // Verificación in situ.
  const all = await prisma.booking.findMany({
    where: { businessId: BUSINESS_ID },
    select: { startAt: true, status: true, serviceId: true, locationId: true, notes: true },
  });
  const total = all.length;
  const junio = all.filter((b) => b.startAt.getUTCMonth() === 5).length; // junio = mes índice 5
  const julio = all.filter((b) => b.startAt.getUTCMonth() === 6).length; // julio = mes índice 6
  const porEstado: Record<string, number> = {};
  for (const b of all) porEstado[b.status] = (porEstado[b.status] ?? 0) + 1;
  const sinServicioOSucursal = all.filter((b) => !b.serviceId || !b.locationId).length;
  const sinNotas = all.filter((b) => !b.notes || b.notes.trim() === '').length;

  console.log(`\n========================================================`);
  console.log(`RESUMEN`);
  console.log(`========================================================`);
  console.log(`Servicios asegurados: ${SERVICIOS.length}`);
  console.log(`Citas creadas este run: ${creadas}`);
  console.log(`Citas saltadas (ya existían): ${saltadas}`);
  console.log(`Total citas del negocio: ${total}`);
  console.log(`  Junio 2026: ${junio} | Julio 2026: ${julio}`);
  console.log(`  Por estado: ${JSON.stringify(porEstado)}`);
  console.log(`  Sin serviceId/locationId: ${sinServicioOSucursal} | Sin notas: ${sinNotas}`);
  console.log(`========================================================\n`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
