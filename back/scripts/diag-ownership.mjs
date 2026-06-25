// READ-ONLY: diagnostica ownership de proyectos (Business) vs usuarios.
// Uso: node scripts/diag-ownership.mjs
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TARGET_EMAIL = 'achozas9@gmail.com';

async function main() {
  const target = await prisma.user.findUnique({ where: { email: TARGET_EMAIL } });
  console.log('=== Usuario objetivo ===');
  console.log(target ? { id: target.id, email: target.email, name: target.firstName } : `NO existe User crm para ${TARGET_EMAIL}`);

  const businesses = await prisma.business.findMany({
    where: { eliminadoEn: null },
    select: { id: true, nombre: true, tenantId: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  console.log(`\n=== Business activos (${businesses.length}) ===`);
  for (const b of businesses) {
    const members = await prisma.membership.findMany({
      where: { businessId: b.id },
      include: { user: { select: { email: true, firstName: true } } },
    });
    console.log(`- ${b.nombre} [${b.id}] tenant=${b.tenantId}`);
    for (const m of members) {
      console.log(`    · ${m.role}  user=${m.user?.email ?? m.userId}  (mid=${m.id})`);
    }
  }

  const allUsers = await prisma.user.findMany({ select: { id: true, email: true } });
  console.log(`\n=== Usuarios crm (${allUsers.length}) ===`);
  for (const u of allUsers) console.log(`- ${u.email}  ${u.id}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
