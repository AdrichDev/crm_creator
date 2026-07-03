// Purga residuos de e2e en la BD real (Supabase consolidado, schema crm + auth).
// - Negocios `Biz %` / `TzBiz%` SIN membresía de un usuario real (solo *@test.local).
// - Usuarios de test: crm.usuario y auth.users con email `%@test.local`.
//
// Uso (desde creador_CRM/back — tsx resuelve el cliente Prisma del back):
//   node --import tsx scripts/purge-test-residue.mjs           # dry-run (default): lista, NO borra
//   node --import tsx scripts/purge-test-residue.mjs --apply   # borra y reporta conteos
//
// Reusa src/prisma.ts (adapter pg + schema crm). Las queries raw van SIEMPRE
// cualificadas (crm.*, auth.*) porque el adapter solo cualifica las generadas.
// Borrado vía SQL directo a auth.users: mismo precedente que scripts/diag-auth.mjs.
import 'dotenv/config';
import { prisma } from '../src/prisma.js';

const APPLY = process.argv.includes('--apply');

async function main() {
  // 1) Negocios basura: nombre de test y ninguna membresía de un usuario real.
  const businesses = await prisma.$queryRaw`
    SELECT n.id, n.nombre, n.creado_en
    FROM crm.negocio n
    WHERE (n.nombre LIKE 'Biz %' OR n.nombre LIKE 'TzBiz%')
      AND NOT EXISTS (
        SELECT 1
        FROM crm.membresia m
        JOIN crm.usuario u ON u.id = m.usuario_id
        WHERE m.negocio_id = n.id AND u.email NOT LIKE '%@test.local'
      )
    ORDER BY n.creado_en`;

  // 2) Usuarios de test en el schema de la app (cascada limpia membresías).
  const crmUsers = await prisma.$queryRaw`
    SELECT id, email FROM crm.usuario WHERE email LIKE '%@test.local' ORDER BY email`;

  // 3) Usuarios de test en Supabase Auth.
  const authUsers = await prisma.$queryRaw`
    SELECT id, email FROM auth.users WHERE email LIKE '%@test.local' ORDER BY email`;

  console.log(`Modo: ${APPLY ? 'APPLY (borrando)' : 'DRY-RUN (no se borra nada)'}\n`);

  console.log(`Negocios de test sin membresía real: ${businesses.length}`);
  for (const b of businesses) console.log(`  - ${b.nombre}  ${b.id}`);

  console.log(`\ncrm.usuario *@test.local: ${crmUsers.length}`);
  for (const u of crmUsers) console.log(`  - ${u.email}`);

  console.log(`\nauth.users *@test.local: ${authUsers.length}`);
  for (const u of authUsers) console.log(`  - ${u.email}`);

  if (!APPLY) {
    console.log('\nDry-run: nada borrado. Ejecuta con --apply para eliminar.');
    return;
  }

  // Orden: negocios (cascada a hijos crm) → crm.usuario (cascada a membresías) → auth.users.
  const bizIds = businesses.map((b) => b.id);
  const delBiz = bizIds.length
    ? await prisma.$executeRaw`DELETE FROM crm.negocio WHERE id = ANY(${bizIds})`
    : 0;
  const delCrmUsers = await prisma.$executeRaw`
    DELETE FROM crm.usuario WHERE email LIKE '%@test.local'`;
  const delAuthUsers = await prisma.$executeRaw`
    DELETE FROM auth.users WHERE email LIKE '%@test.local'`;

  console.log('\nEliminados:');
  console.log(`  negocios:    ${delBiz}`);
  console.log(`  crm.usuario: ${delCrmUsers}`);
  console.log(`  auth.users:  ${delAuthUsers}`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
