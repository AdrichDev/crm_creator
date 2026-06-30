/**
 * shared/generate/build-prisma.ts
 *
 * Pure Prisma schema generation for CRM multi-tenant schema.
 * Zero browser / React / Next.js dependencies.
 */

import type { TenantConfig, GenTable } from './tenant-types';
import { MODULE_TABLES } from './tenant-types';
import { activeDataModules } from './build-sql';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PRISMA_HEADER = `// Fragmento Prisma generado — pégalo/mézclalo en agents-agency/back/prisma/schema.prisma
// Requiere el generator y datasource ya existentes en ese schema (provider postgresql).
// Todos los modelos llevan tenantId para multi-tenant.`;

function prismaModel(t: GenTable): string {
  const fields = t.cols.map((c) => `  ${c.prisma}`).join('\n');
  return `model ${t.model} {
  id        String   @id @default(cuid())
  tenantId  String   @map("tenant_id")
${fields}
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("${t.table}")
  @@index([tenantId])
}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildPrisma(cfg: TenantConfig): string {
  const mods = activeDataModules(cfg);
  const parts: string[] = [PRISMA_HEADER];
  for (const m of mods) {
    for (const t of MODULE_TABLES[m] ?? []) parts.push(prismaModel(t));
  }
  return parts.join('\n\n') + '\n';
}
