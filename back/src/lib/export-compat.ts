/**
 * back/src/lib/export-compat.ts
 *
 * Compatibilidad con `output: 'export'` (salida estatica de Next para exe/apk).
 *
 * `next build` con `output: 'export'` FALLA si el proyecto contiene:
 *   - Route handlers (`app/**\/route.ts`): no existen en export estatico.
 *   - Paginas dinamicas (`[id]`, `[[...path]]`) sin `generateStaticParams`.
 *
 * Auditoria Fase 3 (repo actual):
 *   - `app/api/ai/generate/route.ts`
 *   - `app/api/market-studies/[[...path]]/route.ts`
 *   - `app/(crm)/categorias/[id]/page.tsx`         (client component, useParams)
 *   - `app/(crm)/estudios-mercado/[id]/page.tsx`   (client component, useParams)
 *
 * Estrategia elegida (la menos invasiva que deja el build verde SIN tocar el
 * repo original): eliminar estas rutas SOLO en la copia temporal antes de
 * `next build --output export`. La app exportada del tenant es una SPA estatica
 * sin backend propio; sus detalles por id se alimentan de datos locales (no de
 * la API del repo), asi que estas rutas no aportan valor en el artefacto y su
 * eliminacion no altera el comportamiento del repositorio de origen.
 *
 * `app/api/` completo se elimina (todos son route handlers). Ademas se recorre
 * `app/` borrando cualquier directorio cuyo nombre sea un segmento dinamico
 * (`[...]`), de modo que la funcion es robusta ante nuevas rutas dinamicas que
 * la auditoria no cubriera.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/** Nombre de segmento dinamico de Next: `[id]`, `[slug]`, `[[...path]]`, etc. */
function isDynamicSegment(name: string): boolean {
  return /^\[.+\]$/.test(name);
}

/**
 * Aplica los ajustes de compatibilidad con `output: 'export'` sobre la copia
 * temporal (nunca sobre el repo original).
 *
 * @param frontDir - Ruta absoluta a la copia temporal de front/.
 * @returns Lista de rutas relativas eliminadas (para logging/tests).
 */
export function applyExportCompat(frontDir: string): string[] {
  const removed: string[] = [];
  const appDir = path.join(frontDir, 'app');
  if (!fs.existsSync(appDir)) return removed;

  // 1) Route handlers: todo `app/api/` fuera.
  const apiDir = path.join(appDir, 'api');
  if (fs.existsSync(apiDir)) {
    fs.rmSync(apiDir, { recursive: true, force: true });
    removed.push('app/api');
  }

  // 2) Paginas dinamicas: recorrer y borrar cualquier directorio `[...]`.
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const full = path.join(dir, entry.name);
      if (isDynamicSegment(entry.name)) {
        fs.rmSync(full, { recursive: true, force: true });
        removed.push(path.relative(frontDir, full).replace(/\\/g, '/'));
        continue;
      }
      walk(full);
    }
  };
  walk(appDir);

  // 3) Inyectar output: 'export' en next.config.mjs.
  // Next.js 14+ no admite NEXT_OUTPUT_MODE nativamente para exportar.
  const nextConfigPath = path.join(frontDir, 'next.config.mjs');
  if (fs.existsSync(nextConfigPath)) {
    let configStr = fs.readFileSync(nextConfigPath, 'utf8');
    if (!configStr.includes('output: "export"') && !configStr.includes("output: 'export'")) {
      configStr = configStr.replace('const nextConfig = {', 'const nextConfig = {\n  output: "export",');
      fs.writeFileSync(nextConfigPath, configStr, 'utf8');
      removed.push('next.config.mjs (patched output: export)');
    }
  }

  return removed;
}
