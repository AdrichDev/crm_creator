import 'server-only';
import { Pool } from 'pg';

// Pool único hacia el Postgres del docker (crm-negocios-db).
// Valores por defecto = los del docker-compose.yml. Sobrescribibles por entorno.
let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.CRM_DATABASE_URL;
    pool = connectionString
      ? new Pool({ connectionString })
      : new Pool({
          host: process.env.PGHOST ?? 'localhost',
          port: Number(process.env.PGPORT ?? 5434),
          user: process.env.PGUSER ?? 'crm_admin',
          password: process.env.PGPASSWORD ?? 'crm_password_seguro',
          database: process.env.PGDATABASE ?? 'crm_production',
        });
  }
  return pool;
}
