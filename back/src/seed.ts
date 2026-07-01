import { prisma } from './prisma.js';
import { supabaseAdmin } from './lib/auth.js';
import { seedVisitStates } from './lib/comercial/visit-states.js';

// Siembra una empresa demo completa. Ejecutar: npm run seed
// Note: User.id is now the Supabase auth.users UUID. The seed creates a Supabase
// user first, then uses their UUID as the crm.User PK.
async function main() {
  const business = await prisma.business.create({
    data: { nombre: 'Estudio Lúa', vertical: 'peluqueria', marcaPrimario: '#1b431c', marcaSecundario: '#8cc63f' },
  });
  const location = await prisma.location.create({ data: { businessId: business.id, nombre: 'Sede Centro' } });

  // Horario L-V 9:00-20:00, S 9:00-14:00
  for (let wd = 1; wd <= 5; wd++) await prisma.openingHour.create({ data: { locationId: location.id, diaSemana: wd, apertura: '09:00', cierre: '20:00' } });
  await prisma.openingHour.create({ data: { locationId: location.id, diaSemana: 6, apertura: '09:00', cierre: '14:00' } });

  // Create Supabase auth.users entry and use the returned UUID as crm.User.id
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: 'owner@estudiolua.com',
    password: 'demo1234Seed!',
    email_confirm: true,
  });
  if (authError) throw new Error(`Supabase createUser failed: ${authError.message}`);

  const owner = await prisma.user.create({
    data: { id: authData.user.id, email: 'owner@estudiolua.com', firstName: 'Adrián' },
  });
  await prisma.membership.create({ data: { userId: owner.id, businessId: business.id, role: 'ADMIN' } });

  const sara = await prisma.employee.create({ data: { businessId: business.id, locationId: location.id, nombre: 'Sara', apellido: 'Molina', especialidad: 'Color', rol: 'Estilista', color: '#8cc63f' } });
  const jorge = await prisma.employee.create({ data: { businessId: business.id, locationId: location.id, nombre: 'Jorge', apellido: 'Ortega', especialidad: 'Barba', rol: 'Barbero', color: '#f25c2a' } });

  const corte = await prisma.service.create({ data: { businessId: business.id, nombre: 'Corte de pelo', duracion: 30, precio: 15, requiereProfesional: true, employees: { connect: [{ id: sara.id }, { id: jorge.id }] } } });
  const color = await prisma.service.create({ data: { businessId: business.id, nombre: 'Color completo', duracion: 90, precio: 55, requiereRecurso: true, tipoRecurso: 'CHAIR', employees: { connect: [{ id: sara.id }] } } });

  const sillon = await prisma.resource.create({ data: { businessId: business.id, locationId: location.id, nombre: 'Sillón 1', tipo: 'CHAIR', capacidad: 1, services: { connect: [{ id: corte.id }, { id: color.id }] } } });

  // Estados de visita base del negocio (comercial de campo).
  await seedVisitStates(business.id);
  const pendiente = await prisma.visitState.findFirst({ where: { businessId: business.id, orden: 0 } });

  const ana = await prisma.customer.create({ data: { businessId: business.id, nombre: 'Ana', apellido: 'Gómez', telefono: '600555666', email: 'ana@mail.com', direccion: 'Calle Mayor 1, Madrid', localidad: 'Madrid', provincia: 'Madrid', latitud: 40.4168, longitud: -3.7038, geoEstado: 'OK', categoriaAbc: 'A', estadoVisitaId: pendiente?.id ?? null } });

  await prisma.product.create({ data: { businessId: business.id, nombre: 'Cera modeladora', categoria: 'Peinado', stock: 24, minimo: 10, precio: 12.5, proveedor: 'BeautyDist' } });

  // Bono de 5 sesiones de corte para Ana
  const bono = await prisma.package.create({ data: { businessId: business.id, nombre: 'Bono 5 cortes', sesionesTotal: 5, diasValidez: 180, precio: 60, services: { connect: [{ id: corte.id }] } } });
  await prisma.customerPackage.create({ data: { businessId: business.id, customerId: ana.id, packageId: bono.id, sesionesTotal: 5, expiraEn: new Date(Date.now() + 180 * 86400000) } });

  // Una reserva de mañana 10:00
  const start = new Date(); start.setDate(start.getDate() + 1); start.setHours(10, 0, 0, 0);
  await prisma.booking.create({ data: { businessId: business.id, locationId: location.id, customerId: ana.id, serviceId: corte.id, employeeId: sara.id, startAt: start, endAt: new Date(start.getTime() + 30 * 60000), status: 'CONFIRMED', resources: { connect: [{ id: sillon.id }] } } });

  console.log('Seed OK. Login demo: owner@estudiolua.com / demo1234Seed! (via Supabase Auth)');
  void sillon;
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
