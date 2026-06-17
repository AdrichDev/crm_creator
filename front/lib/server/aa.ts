import 'server-only';

/**
 * Cliente server-side hacia el backend de agents-agency.
 * El backend de AA protege /api con sesión y CORS por allowlist, por eso el CRM
 * llama desde el SERVIDOR (Next route handlers), no desde el navegador.
 *
 * Config por entorno:
 *  - AA_API_URL        (def. http://localhost:4000)
 *  - AA_SERVICE_TOKEN  (opcional) → Authorization: Bearer <token>
 * Además reenvía la cookie entrante (sesión compartida en local si aplica).
 */
export function aaBaseUrl(): string {
  return process.env.AA_API_URL || 'http://localhost:4000';
}

export async function aaFetch(path: string, init: RequestInit = {}, cookie?: string): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  const tok = process.env.AA_SERVICE_TOKEN;
  if (tok) headers.Authorization = `Bearer ${tok}`;
  if (cookie) headers.cookie = cookie;
  return fetch(`${aaBaseUrl()}${path}`, { ...init, headers, cache: 'no-store' });
}
