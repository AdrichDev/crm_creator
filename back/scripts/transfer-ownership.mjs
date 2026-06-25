// Transfiere ownership de los Business activos a achozas9@gmail.com.
// - Crea User crm para el UUID de Supabase Auth si falta.
// - Membership OWNER de achozas9 en cada Business (upsert).
// - Baja al owner anterior (owner@estudiolua.com) a ADMIN (reversible, conserva acceso).
// Idempotente. Uso: node scripts/transfer-ownership.mjs
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const NEW = { id: '10e1e323-73f8-4ae8-b445-a0a13d45a2e5', email: 'achozas9@gmail.com', firstName: 'Adrián' };
const OLD_EMAIL = 'owner@estudiolua.com';

async function main() {
  const result = await prisma.$transaction(async (tx) => {
    // 1) User crm para achozas9 (id = auth.users.id).
    await tx.user.upsert({
      where: { id: NEW.id },
      update: { email: NEW.email },
      create: { id: NEW.id, email: NEW.email, firstName: NEW.firstName },
    });

    const oldUser = await tx.user.findUnique({ where: { email: OLD_EMAIL } });
    const businesses = await tx.business.findMany({ where: { eliminadoEn: null }, select: { id: true, nombre: true } });

    const log = [];
    for (const b of businesses) {
      // 2) achozas9 → OWNER (upsert por @@unique(userId,businessId)).
      await tx.membership.upsert({
        where: { userId_businessId: { userId: NEW.id, businessId: b.id } },
        update: { role: 'OWNER' },
        create: { userId: NEW.id, businessId: b.id, role: 'OWNER' },
      });
      // 3) owner anterior → ADMIN (si tenía membership en este Business).
      if (oldUser) {
        const om = await tx.membership.findUnique({
          where: { userId_businessId: { userId: oldUser.id, businessId: b.id } },
        });
        if (om && om.role === 'OWNER') {
          await tx.membership.update({ where: { id: om.id }, data: { role: 'ADMIN' } });
        }
      }
      log.push(b.nombre);
    }
    return log;
  });
  console.log('Transferidos a achozas9@gmail.com (OWNER):', result.join(', '));
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
