/**
 * front/lib/next-output-mode.ts
 *
 * Resuelve el modo `output` de Next.js a partir de la variable de entorno
 * NEXT_OUTPUT_MODE. Los builders del back inyectan esta variable en el `env`
 * del spawn de `next build` (NUNCA en .env.local, para no contaminar la copia
 * fuente que se incluye en el ZIP).
 *
 * - 'standalone' → Web ZIP (app Node autocontenida, `node server.js`).
 * - 'export'     → salida estatica para empaquetar en exe/apk.
 * - undefined    → desarrollo normal (`next dev`/`next build` sin cambios).
 */

export type NextOutputMode = 'standalone' | 'export';

export function resolveOutputMode(
  raw: string | undefined,
): NextOutputMode | undefined {
  if (raw === 'standalone' || raw === 'export') return raw;
  return undefined;
}
