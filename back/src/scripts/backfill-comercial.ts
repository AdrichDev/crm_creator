import 'dotenv/config';
import { prisma } from '../prisma.js';
import { seedVisitStates } from '../lib/comercial/visit-states.js';

// Backfill: siembra los estados de visita base en todos los negocios existentes que aún
// no los tengan. Idempotente. Ejecutar tras aplicar la migración comercial_campo:
//   node --import tsx src/scripts/backfill-comercial.ts
async function main(): Promise<void> {
  const businesses = await prisma.business.findMany({ where: { eliminadoEn: null }, select: { id: true, nombre: true } });
  let seeded = 0;
  for (const b of businesses) {
    const n = await seedVisitStates(b.id);
    if (n > 0) {
      seeded += 1;
      console.log(`  · ${b.nombre} (${b.id}): ${n} estados sembrados`);
    }
  }
  console.log(`Backfill comercial OK. Negocios con estados nuevos: ${seeded}/${businesses.length}.`);
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
