/**
 * shared/generate/build-manifest.ts
 *
 * Pure manifest.json generation for CRM projects.
 * Zero browser / React / Next.js dependencies.
 */

import type { TenantConfig } from './tenant-types';
import { MODULES } from './tenant-types';
import { activeDataModules, slug } from './build-sql';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildManifest(cfg: TenantConfig): object {
  const enabled = MODULES.filter((m) => cfg.modules[m.id]).map((m) => m.id);
  return {
    name: cfg.business.name,
    slug: slug(cfg.business.name),
    vertical: cfg.business.vertical,
    business: cfg.business,
    branding: cfg.branding,
    terminology: cfg.terminology,
    modules: cfg.modules,
    activeModules: enabled,
    dataModules: activeDataModules(cfg),
    generatedAt: new Date().toISOString(),
    schemaFiles: ['schema.sql', 'schema.prisma'],
  };
}
