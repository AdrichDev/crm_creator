import { PrismaClient } from './lib/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL no definida. Asegúrate de cargar el .env antes de inicializar Prisma.',
    );
  }
  // P7 driver-adapter (@prisma/adapter-pg): las tablas de CRM viven en el schema
  // `crm` (Supabase consolidado aa/crm). El adapter NO interpreta `?schema=crm` del
  // connection string y el session pooler ignora `-c search_path`, así que usamos
  // la opción `schema` del adapter, que CUALIFICA las queries generadas a `crm.<tabla>`.
  const adapter = new PrismaPg(
    {
      connectionString,
      max: Number(process.env.DB_POOL_MAX ?? 10),
      idleTimeoutMillis: Number(process.env.DB_POOL_IDLE_MS ?? 10000),
    },
    { schema: process.env.DB_SCHEMA ?? 'crm' },
  );
  return new PrismaClient({ adapter });
}

// Getter lazy: el cliente se crea la primera vez que se accede, cuando dotenv ya cargó.
let _prisma: PrismaClient | undefined = globalForPrisma.prisma;

const getPrisma = (): PrismaClient => {
  if (!_prisma) {
    _prisma = createClient();
    if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = _prisma;
  }
  return _prisma;
};

// Re-exportamos `prisma` como Proxy para no romper los imports existentes.
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    return (getPrisma() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
export type { PrismaClient };
