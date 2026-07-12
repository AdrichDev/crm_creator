/**
 * Resolución de la allowlist de CORS.
 *
 * Los artefactos NATIVOS exportados (apk/ipa vía Capacitor) sirven el front en un
 * WebView cuyo origin es `https://localhost` (androidScheme por defecto en Capacitor 7)
 * o `capacitor://localhost` (iOS). Sus llamadas al backend salen con ESE origin, no con
 * el dominio web. Por eso estos orígenes se permiten SIEMPRE, además del `CORS_ORIGIN`
 * configurado (los dominios web) — así cualquier apk/ipa exportado conecta sin tener
 * que tocar la config del backend. La autenticación real sigue siendo el Bearer (JWT
 * de Supabase); CORS no es la barrera de autorización.
 */
export const NATIVE_WEBVIEW_ORIGINS: readonly string[] = [
  'https://localhost',
  'capacitor://localhost',
  'http://localhost',
];

/**
 * Devuelve el valor de `origin` para el middleware `cors`:
 * - `'*'` → `true` (reflejar cualquier origin).
 * - lista separada por comas → esa lista + los orígenes de WebView nativo.
 */
export function resolveCorsOrigins(corsOrigin: string): true | string[] {
  if (corsOrigin === '*') return true;
  const configured = corsOrigin
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  // Dedup por si el operador ya listó alguno de los orígenes nativos.
  return Array.from(new Set([...configured, ...NATIVE_WEBVIEW_ORIGINS]));
}
