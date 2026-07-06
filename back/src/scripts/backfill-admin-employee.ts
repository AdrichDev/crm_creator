import 'dotenv/config';
import { prisma } from '../prisma.js';
import { ensureAdminEmployee } from '../lib/comercial/admin-employee.js';

// Backfill one-off: materializa el Employee del ADMIN en negocios comerciales que aún
// no lo tengan (idempotente). Uso: npx tsx src/scripts/backfill-admin-employee.ts [businessId]
// Sin argumento, procesa TODOS los negocios con vertical `comerciales`.

async function main() {
  const arg = process.argv[2];
  const businesses = arg
    ? await prisma.business.findMany({ where: { id: arg }, select: { id: true, nombre: true, vertical: true } })
    : await prisma.business.findMany({ where: { vertical: 'comerciales' }, select: { id: true, nombre: true, vertical: true } });

  if (businesses.length === 0) {
    console.log('No hay negocios que procesar para', arg ?? 'vertical=comerciales');
    return;
  }

  for (const b of businesses) {
    const created = await ensureAdminEmployee(b.id);
    console.log(`\nNegocio ${b.nombre} (${b.id}) — vertical=${b.vertical}`);
    if (created.length === 0) {
      console.log('  Sin cambios (el admin ya tenía Employee).');
    } else {
      for (const e of created) {
        console.log(`  CREADO Employee id=${e.id} nombre="${e.nombre} ${e.apellido ?? ''}".trim() userId=${e.userId} businessId=${e.businessId}`);
      }
    }
    const total = await prisma.employee.count({ where: { businessId: b.id, eliminadoEn: null } });
    console.log(`  Empleados activos ahora en el negocio: ${total}`);
  }
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
