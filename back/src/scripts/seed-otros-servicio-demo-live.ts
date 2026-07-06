import 'dotenv/config';
import { prisma } from '../prisma.js';

// Seed EN VIVO: añade el servicio "Otros" al catálogo de "Comercial Demo IA" para la sección
// "Tareas y reuniones" del selector de cita (front/components/crm/servicio-select.tsx).
// Mismo criterio de clasificación que el resto de tareas comerciales sembradas en
// seed-citas-comercial-demo-live.ts (reservableOnline=false, precio=0) → cae en "Tareas y
// reuniones" vía groupServices() sin cambios en la lógica de agrupación. Al elegir "Otros" en
// el formulario de cita, el front muestra un input "Comentarios" adicional (ver
// nueva-cita-modal.tsx / citas/page.tsx) que se pliega en `notes`.
//
// Idempotente por (negocio, nombre). Ejecutar: cd back && npx tsx src/scripts/seed-otros-servicio-demo-live.ts

const BUSINESS_ID = 'cmr84anhw00005ofx8ba2w4sh'; // "Comercial Demo IA" (demo en vivo)

async function main() {
  const business = await prisma.business.findUnique({ where: { id: BUSINESS_ID } });
  if (!business) {
    console.error(`ESCALATE: negocio ${BUSINESS_ID} no encontrado. Revisa DATABASE_URL / tenant.`);
    process.exit(1);
  }
  console.log(`\n== Seed servicio "Otros" — ${business.nombre} (${business.id}) ==\n`);

  const existing = await prisma.service.findFirst({ where: { businessId: BUSINESS_ID, nombre: 'Otros' } });
  if (existing) {
    console.log(`  = "Otros" ya existía (id ${existing.id}). Sin cambios.`);
  } else {
    const created = await prisma.service.create({
      data: {
        businessId: BUSINESS_ID,
        nombre: 'Otros',
        duracion: 30,
        precio: 0,
        requiereProfesional: false,
        requiereRecurso: false,
        reservableOnline: false,
      },
    });
    console.log(`  + "Otros" creado (id ${created.id}, 30 min)`);
  }

  const total = await prisma.service.count({ where: { businessId: BUSINESS_ID, activo: true } });
  console.log(`\nTotal servicios activos del negocio: ${total}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
