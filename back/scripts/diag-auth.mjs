// READ-ONLY: ¿existe achozas9@gmail.com en Supabase Auth (auth.users)?
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const EMAIL = 'achozas9@gmail.com';
async function main() {
  const rows = await prisma.$queryRaw`SELECT id, email, created_at, last_sign_in_at FROM auth.users WHERE email = ${EMAIL} LIMIT 1`;
  console.log(rows.length ? rows[0] : `NO existe en auth.users: ${EMAIL}`);
  const all = await prisma.$queryRaw`SELECT id, email FROM auth.users ORDER BY created_at`;
  console.log('\n=== auth.users ===');
  for (const u of all) console.log(`- ${u.email}  ${u.id}`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
