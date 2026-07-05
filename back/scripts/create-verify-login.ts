// Crea un usuario de verificación (NO toca la cuenta real del owner) para poder
// hacer login y probar visualmente el front. Idempotente. Uso:
//   VERIFY_LOGIN_PASSWORD='...' npx tsx scripts/create-verify-login.ts
// El password viene SIEMPRE de la variable de entorno — nunca en el repo: el
// script crea una cuenta ADMIN sobre un negocio real, y una credencial conocida
// commiteada sería una puerta trasera si se ejecutara contra producción.
import { prisma } from '../src/prisma.js';
import { supabaseAdmin } from '../src/lib/auth.js';

const EMAIL = 'verify-agent@estudiolua.com';
const PASSWORD = process.env.VERIFY_LOGIN_PASSWORD ?? '';
const NEGOCIO_NOMBRE = 'EDM San Blas';

if (PASSWORD.length < 12) {
  console.error('Define VERIFY_LOGIN_PASSWORD (>= 12 caracteres) en el entorno. No se acepta password hardcodeado.');
  process.exit(1);
}

async function main() {
  const negocio = await prisma.business.findFirst({ where: { nombre: NEGOCIO_NOMBRE } });
  if (!negocio) throw new Error(`Negocio "${NEGOCIO_NOMBRE}" no encontrado`);

  let userId: string;
  const { data: existing } = await supabaseAdmin.auth.admin.listUsers();
  const found = existing?.users?.find((u) => u.email === EMAIL);
  if (found) {
    userId = found.id;
    await supabaseAdmin.auth.admin.updateUserById(userId, { password: PASSWORD });
  } else {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: EMAIL, password: PASSWORD, email_confirm: true,
    });
    if (error) throw error;
    userId = data.user.id;
  }

  await prisma.user.upsert({
    where: { id: userId },
    update: { email: EMAIL },
    create: { id: userId, email: EMAIL, firstName: 'Verify' },
  });

  await prisma.membership.upsert({
    where: { userId_businessId: { userId, businessId: negocio.id } },
    update: { role: 'ADMIN' },
    create: { userId, businessId: negocio.id, role: 'ADMIN' },
  });

  console.log(`Login verificacion listo: ${EMAIL} / ${PASSWORD} en negocio "${negocio.nombre}" (${negocio.id})`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
