import 'server-only';

/**
 * Cliente server-side hacia el PROPIO backend del CRM, carril de operador.
 *
 * El router `/service/operator` vive FUERA de `/api` y exige el header
 * `x-service-token` (comparado contra `OPERATOR_SERVICE_TOKEN` en el back). Ese
 * token es un secreto de SERVIDOR y JAMÁS debe llegar al navegador: por eso los
 * route handlers de Next (`app/api/operator/**`) llaman aquí desde el servidor e
 * inyectan el token, en lugar de que el browser hable directo con el back.
 *
 * Config por entorno:
 *  - CRM_API_URL / NEXT_PUBLIC_API_URL  → base del back del CRM (sin `/api`; el
 *    router de operador cuelga de la raíz). Def. `http://localhost:4000`.
 *  - OPERATOR_SERVICE_TOKEN             → header `x-service-token` (requerido para
 *    que el back acepte; sin él el back responde 401).
 */
export function crmBackBaseUrl(): string {
  return process.env.CRM_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
}

/**
 * Reenvía una petición al carril de operador del back (`/service/operator${path}`)
 * inyectando el service token server-side. `path` debe empezar por `/`.
 */
export async function crmOperatorFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  const tok = process.env.OPERATOR_SERVICE_TOKEN;
  if (tok) headers['x-service-token'] = tok;
  return fetch(`${crmBackBaseUrl()}/service/operator${path}`, { ...init, headers, cache: 'no-store' });
}
