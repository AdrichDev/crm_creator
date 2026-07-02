import { prisma as defaultPrisma } from '../prisma.js';

// Destinatarios de digests/avisos administrativos: el email del User de cada
// Membership con rol ADMIN del negocio. Compartido por digestScheduler y timeoff.
// Prisma-inyectable (client) para poder testear sin DB real.
export async function adminEmails(
  businessId: string,
  client: { membership: { findMany: (args: unknown) => Promise<Array<{ user: { email: string | null } | null }>> } } = defaultPrisma as never,
): Promise<string[]> {
  const rows = await client.membership.findMany({
    where: { businessId, role: 'ADMIN' },
    select: { user: { select: { email: true } } },
  });
  return rows
    .map((r) => r.user?.email)
    .filter((e): e is string => typeof e === 'string' && e.length > 0);
}
