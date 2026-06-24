import 'server-only';

/**
 * Cliente server-side hacia el backend de agents-agency.
 * AA autentica /api por Bearer (JWT Supabase) — NO por cookie. El CRM llama desde
 * el SERVIDOR (Next route handlers) con un token de servicio.
 *
 * Config por entorno:
 *  - AA_API_URL        (def. http://localhost:4000)
 *  - AA_SERVICE_TOKEN  → Authorization: Bearer <token> (requerido para que AA acepte)
 */
export function aaBaseUrl(): string {
  return process.env.AA_API_URL || 'http://localhost:4000';
}

export async function aaFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  const tok = process.env.AA_SERVICE_TOKEN;
  if (tok) headers.Authorization = `Bearer ${tok}`;
  return fetch(`${aaBaseUrl()}${path}`, { ...init, headers, cache: 'no-store' });
}
