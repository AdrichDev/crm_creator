import { prisma } from '../prisma.js';
import { supabaseAdmin } from '../lib/auth.js';
import { seedVisitStates } from '../lib/comercial/visit-states.js';
import { generateOrRegenerateToken } from '../lib/calendarToken.js';
import type { CalendarTokenRepo } from '../lib/calendarToken.js';

// Seed de demo EN VIVO para prueba real de crm-comercial-colores-seguimiento +
// crm-citas-google-calendar: negocio "comerciales", 20 clientes generados (IA),
// citas y recordatorios reales, usuario ligado a un email real del usuario para
// poder suscribir el feed ICS en su Google Calendar / Outlook de verdad.
// Ejecutar: npx tsx src/scripts/seed-comercial-demo-live.ts <email>

const DEMO_PASSWORD = 'DemoCalendar2026!';

const NOMBRES = ['Lucía', 'Mateo', 'Sofía', 'Hugo', 'Martina', 'Daniel', 'Valeria', 'Pablo', 'Emma', 'Álvaro',
  'Carmen', 'Marcos', 'Julia', 'Diego', 'Paula', 'Adrián', 'Noa', 'Bruno', 'Vera', 'Iker'];
const APELLIDOS = ['García', 'Fernández', 'López', 'Martínez', 'Sánchez', 'Pérez', 'Gómez', 'Ruiz', 'Díaz', 'Moreno',
  'Álvarez', 'Romero', 'Navarro', 'Torres', 'Domínguez', 'Vázquez', 'Ramos', 'Gil', 'Serrano', 'Blanco'];
const CALLES = ['Calle Alcalá', 'Gran Vía', 'Calle Serrano', 'Paseo de la Castellana', 'Calle Fuencarral',
  'Calle Goya', 'Calle Bravo Murillo', 'Avenida de América', 'Calle Princesa', 'Calle Atocha'];

// Coordenadas centradas en Madrid, dispersión pequeña para simular cartera de una zona.
const MADRID_LAT = 40.4168; const MADRID_LNG = -3.7038;

function pick<T>(arr: T[], i: number): T { return arr[i % arr.length]; }
function jitter(base: number, seed: number, spread: number): number {
  return base + ((seed * 37) % 100 - 50) / 100 * spread;
}

async function main() {
  const email = process.argv[2];
  if (!email) { console.error('Uso: npx tsx src/scripts/seed-comercial-demo-live.ts <email>'); process.exit(1); }

  console.log(`\n== Seed demo comercial en vivo — usuario ${email} ==\n`);

  const business = await prisma.business.create({
    data: { nombre: 'Comercial Demo IA', vertical: 'comerciales', marcaPrimario: '#c9a227', marcaSecundario: '#1b1b1b' },
  });
  const location = await prisma.location.create({ data: { businessId: business.id, nombre: 'Ruta Madrid Centro', direccion: 'Madrid' } });
  for (let wd = 1; wd <= 5; wd++) await prisma.openingHour.create({ data: { locationId: location.id, diaSemana: wd, apertura: '09:00', cierre: '18:00' } });

  // Usuario Supabase: reusa si ya existe (idempotente para relanzar la demo).
  let userId: string;
  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email, password: DEMO_PASSWORD, email_confirm: true,
  });
  if (createErr) {
    const { data: list } = await supabaseAdmin.auth.admin.listUsers();
    const existing = list?.users.find((u) => u.email === email);
    if (!existing) throw new Error(`No se pudo crear ni encontrar usuario Supabase: ${createErr.message}`);
    userId = existing.id;
    console.log(`Usuario Supabase ya existía, reusando id ${userId}`);
  } else {
    userId = created.user.id;
    console.log(`Usuario Supabase creado: ${userId} (password: ${DEMO_PASSWORD})`);
  }

  const user = await prisma.user.upsert({
    where: { id: userId },
    create: { id: userId, email, firstName: 'Comercial', lastName: 'Demo', calendarPushEnabled: true },
    update: { calendarPushEnabled: true },
  });
  await prisma.membership.upsert({
    where: { userId_businessId: { userId: user.id, businessId: business.id } },
    create: { userId: user.id, businessId: business.id, role: 'ADMIN' },
    update: {},
  });
  const employee = await prisma.employee.create({
    data: { businessId: business.id, locationId: location.id, userId: user.id, nombre: 'Comercial', apellido: 'Demo', rol: 'Comercial de campo', color: '#c9a227' },
  });

  const service = await prisma.service.create({
    data: { businessId: business.id, nombre: 'Visita comercial', duracion: 30, precio: 0, requiereProfesional: true, requiereRecurso: false, employees: { connect: [{ id: employee.id }] } },
  });

  await seedVisitStates(business.id);
  const estados = await prisma.visitState.findMany({ where: { businessId: business.id }, orderBy: { orden: 'asc' } });

  console.log(`\n-- Generando 20 clientes IA (Madrid) --`);
  const customers = [];
  for (let i = 0; i < 20; i++) {
    const nombre = pick(NOMBRES, i);
    const apellido = pick(APELLIDOS, i + 7);
    const abc = i < 5 ? 'A' : i < 13 ? 'B' : 'C'; // 5 A / 8 B / 7 C — distribución realista
    const estado = estados[i % estados.length];
    const c = await prisma.customer.create({
      data: {
        businessId: business.id,
        nombre, apellido,
        telefono: `6${String(10000000 + i * 137).slice(0, 8)}`,
        email: `${nombre.toLowerCase()}.${apellido.toLowerCase()}@clientedemo.es`,
        direccion: `${pick(CALLES, i)}, ${20 + i}`,
        localidad: 'Madrid', provincia: 'Madrid', codigoPostal: '28001',
        latitud: jitter(MADRID_LAT, i, 0.08), longitud: jitter(MADRID_LNG, i, 0.08),
        geoEstado: 'OK',
        categoriaAbc: abc,
        estadoVisitaId: estado.id,
        tipoRegistro: i >= 18 ? 'PROSPECTO' : 'CLIENTE',
        proximaAccionEn: i % 3 === 0 ? new Date(Date.now() + (i - 3) * 86400000) : null,
      },
    });
    customers.push(c);
    console.log(`  ${i + 1}. ${nombre} ${apellido} — ABC ${abc} — ${estado.nombre}`);
  }

  console.log(`\n-- Generando recordatorios (vencido / hoy / próximos) --`);
  const reminderPlan = [
    { offsetDays: -3, titulo: 'Llamar para cerrar pedido pendiente' },
    { offsetDays: -1, titulo: 'Confirmar dirección de entrega' },
    { offsetDays: 0, titulo: 'Visita de seguimiento hoy' },
    { offsetDays: 1, titulo: 'Enviar catálogo actualizado' },
    { offsetDays: 3, titulo: 'Revisar renovación de contrato' },
    { offsetDays: 7, titulo: 'Visita trimestral programada' },
  ];
  for (let i = 0; i < reminderPlan.length; i++) {
    const plan = reminderPlan[i];
    const customer = customers[i];
    await prisma.reminder.create({
      data: {
        businessId: business.id, customerId: customer.id,
        titulo: `${plan.titulo} — ${customer.nombre} ${customer.apellido}`,
        fechaPrevista: new Date(Date.now() + plan.offsetDays * 86400000),
        responsableId: user.id,
        estado: 'PENDING',
      },
    });
    console.log(`  Recordatorio: ${plan.titulo} (día ${plan.offsetDays >= 0 ? '+' : ''}${plan.offsetDays})`);
  }

  console.log(`\n-- Generando citas confirmadas (próximos días, feed + push calendario) --`);
  for (let i = 0; i < 4; i++) {
    const customer = customers[i + 6];
    const start = new Date(); start.setDate(start.getDate() + i + 1); start.setHours(10 + i, 0, 0, 0);
    const end = new Date(start.getTime() + 30 * 60000);
    const booking = await prisma.booking.create({
      data: { businessId: business.id, locationId: location.id, customerId: customer.id, serviceId: service.id, employeeId: employee.id, startAt: start, endAt: end, status: 'CONFIRMED' },
    });
    console.log(`  Cita confirmada: ${customer.nombre} ${customer.apellido} — ${start.toLocaleString('es-ES')} (id ${booking.id})`);
  }

  // Token de calendario (mismo repo Prisma que expone el router /calendar).
  const tokenRepo: CalendarTokenRepo = {
    async findByUserId(uid) {
      const row = await prisma.calendarToken.findUnique({ where: { userId: uid } });
      return row ? { tokenHash: row.tokenHash, revokedAt: row.revokedAt } : null;
    },
    async upsert(uid, tokenHash, now) {
      await prisma.calendarToken.upsert({ where: { userId: uid }, create: { userId: uid, tokenHash }, update: { tokenHash, revokedAt: null, regeneratedAt: now } });
    },
    async revoke(uid, now) { await prisma.calendarToken.updateMany({ where: { userId: uid }, data: { revokedAt: now } }); },
    async findActiveOwnerByHash(hash) {
      const row = await prisma.calendarToken.findFirst({ where: { tokenHash: hash, revokedAt: null }, select: { userId: true } });
      return row ? { userId: row.userId } : null;
    },
  };
  const { token } = await generateOrRegenerateToken(tokenRepo, user.id);

  console.log(`\n========================================================`);
  console.log(`RESUMEN`);
  console.log(`========================================================`);
  console.log(`Negocio:       ${business.nombre} (${business.id})`);
  console.log(`Usuario login: ${email} / ${DEMO_PASSWORD}`);
  console.log(`Clientes:      20 (5 A, 8 B, 7 C)`);
  console.log(`Recordatorios: ${reminderPlan.length} (1 vencido, 1 ayer, 1 hoy, 3 futuros)`);
  console.log(`Citas:         4 confirmadas`);
  console.log(`Token feed:    ${token}`);
  console.log(`Ruta feed:     /calendar/feed/${token}.ics`);
  console.log(`========================================================\n`);
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
