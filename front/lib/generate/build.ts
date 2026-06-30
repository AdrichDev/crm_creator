'use client';
import JSZip from 'jszip';
import type { TenantConfig } from '@/lib/config/tenant-config';

// Pure generation functions live in shared/ (zero browser deps).
import { buildSql, activeDataModules, slug } from '../../../shared/generate/build-sql';
import { buildPrisma } from '../../../shared/generate/build-prisma';
import { buildManifest } from '../../../shared/generate/build-manifest';

// Re-export so existing callers can keep their current import paths.
export { buildSql, buildPrisma, buildManifest, activeDataModules, slug };

// ---------------------------------------------------------------------------
// Browser-only glue (JSZip + DOM) — stays in the client bundle
// ---------------------------------------------------------------------------

function readme(cfg: TenantConfig): string {
  return `# Paquete de producto — ${cfg.business.name}

Generado por la consola SaaS para integrarse en **agents-agency**.

- \`manifest.json\` — vertical, módulos activos, terminología y branding.
- \`schema.sql\` — esquema Postgres (núcleo + módulos elegidos), aplicable a Supabase/Postgres.
- \`schema.prisma\` — modelos Prisma equivalentes para mezclar en agents-agency.

Esto es la **especificación** del proyecto, no el CRM completo. Para generar el
CRM completo (back + front + .env), ejecuta en la raíz de SaaS_Negocios:

    node generar.mjs --from manifest.json

Módulos activos: ${activeDataModules(cfg).join(', ') || '(solo núcleo)'}
`;
}

export async function buildPackageBlob(cfg: TenantConfig): Promise<Blob> {
  const zip = new JSZip();
  const root = zip.folder(slug(cfg.business.name))!;
  root.file('manifest.json', JSON.stringify(buildManifest(cfg), null, 2));
  root.file('schema.sql', buildSql(cfg));
  root.file('schema.prisma', buildPrisma(cfg));
  root.file('README.md', readme(cfg));
  return zip.generateAsync({ type: 'blob' });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function generateAndDownload(cfg: TenantConfig): Promise<void> {
  const blob = await buildPackageBlob(cfg);
  downloadBlob(blob, `${slug(cfg.business.name)}.zip`);
}
