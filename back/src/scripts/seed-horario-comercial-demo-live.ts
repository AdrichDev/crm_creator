import 'dotenv/config';
import { prisma } from '../prisma.js';
import { daySlotsWithAvailability } from '../lib/availability.js';

// Seed EN VIVO del horario de apertura (OpeningHour) para "Comercial Demo IA" —
// crm-operaos-agenda-contactos-fichaje-telegram (fix "horas disponibles" vacías).
//
// Causa raíz: iterateDaySlots (availability.ts) genera los chips de hora desde
// OpeningHour y la sucursal del demo tenía CERO filas → sin chips en el calendario.
//
// Horario sembrado (partido L-V, continuo sábado, domingo cerrado):
//   L-V: 09:00-14:00 y 16:00-19:00 (dos filas por día = horario partido)
//   S:   10:00-14:00
//   D:   sin filas (cerrado)
//
// Idempotente: cada tramo se busca por (locationId, diaSemana, apertura, cierre)
// antes de crearse; si existe se salta. Reejecutable sin duplicar.
//
// Verificación in situ: tras sembrar, se piden los huecos de un miércoles y un
// sábado (deben salir chips) y de un domingo (debe salir vacío) con el mismo
// helper que usa GET /bookings/slots (daySlotsWithAvailability).
//
// Ejecutar: cd back && npx tsx src/scripts/seed-horario-comercial-demo-live.ts

const BUSINESS_ID = 'cmr84anhw00005ofx8ba2w4sh'; // "Comercial Demo IA" (demo en vivo)

interface TramoDef { diaSemana: number; apertura: string; cierre: string; }

const TRAMOS: TramoDef[] = [
  // L-V partido: mañana + tarde.
  ...[1, 2, 3, 4, 5].flatMap((dia) => [
    { diaSemana: dia, apertura: '09:00', cierre: '14:00' },
    { diaSemana: dia, apertura: '16:00', cierre: '19:00' },
  ]),
  // Sábado continuo de mañana. Domingo: sin filas = cerrado.
  { diaSemana: 6, apertura: '10:00', cierre: '14:00' },
];

// Fechas de verificación (julio 2026): miércoles 8, sábado 11, domingo 12.
const VERIFY_DATES: { date: string; label: string; expectSlots: boolean }[] = [
  { date: '2026-07-08', label: 'miércoles', expectSlots: true },
  { date: '2026-07-11', label: 'sábado', expectSlots: true },
  { date: '2026-07-12', label: 'domingo (cerrado)', expectSlots: false },
];

async function main() {
  const business = await prisma.business.findUnique({ where: { id: BUSINESS_ID } });
  if (!business) {
    console.error(`ESCALATE: negocio ${BUSINESS_ID} no encontrado. Revisa DATABASE_URL / tenant.`);
    process.exit(1);
  }
  console.log(`\n== Seed horario apertura — ${business.nombre} (${business.id}) ==\n`);

  const location = await prisma.location.findFirst({
    where: { businessId: BUSINESS_ID, activo: true, eliminadoEn: null },
    orderBy: { createdAt: 'asc' },
  });
  if (!location) {
    console.error(`ESCALATE: no hay ninguna sucursal (Location) activa para el negocio ${BUSINESS_ID}.`);
    process.exit(1);
  }
  console.log(`Sucursal: ${location.nombre} (${location.id})`);

  let creadas = 0;
  let saltadas = 0;
  for (const t of TRAMOS) {
    const existente = await prisma.openingHour.findFirst({
      where: { locationId: location.id, diaSemana: t.diaSemana, apertura: t.apertura, cierre: t.cierre },
    });
    if (existente) {
      saltadas++;
      console.log(`  = dia ${t.diaSemana} ${t.apertura}-${t.cierre} ya existía (id ${existente.id}); se salta.`);
      continue;
    }
    const created = await prisma.openingHour.create({
      data: { locationId: location.id, diaSemana: t.diaSemana, apertura: t.apertura, cierre: t.cierre },
    });
    creadas++;
    console.log(`  + dia ${t.diaSemana} ${t.apertura}-${t.cierre} creado (id ${created.id})`);
  }

  const total = await prisma.openingHour.count({ where: { locationId: location.id } });

  // Verificación: mismos huecos que GET /bookings/slots (daySlotsWithAvailability).
  const service = await prisma.service.findFirst({
    where: { businessId: BUSINESS_ID, activo: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!service) {
    console.error('ESCALATE: el negocio no tiene servicios activos; no se pueden verificar los huecos.');
    process.exit(1);
  }
  console.log(`\n-- Verificación de huecos (servicio "${service.nombre}", ${service.duracion} min) --`);

  let verificacionOk = true;
  for (const v of VERIFY_DATES) {
    const slots = await daySlotsWithAvailability({
      businessId: BUSINESS_ID, locationId: location.id, serviceId: service.id, start: v.date, date: v.date,
    });
    const libres = slots.filter((s) => s.disponible).length;
    const ok = v.expectSlots ? slots.length > 0 : slots.length === 0;
    if (!ok) verificacionOk = false;
    console.log(`  ${ok ? 'OK ' : 'FAIL'} ${v.date} (${v.label}): ${slots.length} huecos (${libres} libres)` +
      (slots.length ? ` — primeros: ${slots.slice(0, 4).map((s) => s.hora).join(', ')}` : ''));
  }

  console.log(`\n========================================================`);
  console.log(`RESUMEN`);
  console.log(`========================================================`);
  console.log(`Tramos creados este run: ${creadas} | saltados (ya existían): ${saltadas}`);
  console.log(`Total OpeningHour de la sucursal: ${total} (esperado ${TRAMOS.length})`);
  console.log(`Verificación de huecos: ${verificacionOk ? 'OK' : 'FALLIDA'}`);
  console.log(`========================================================\n`);
  if (!verificacionOk) process.exit(1);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
