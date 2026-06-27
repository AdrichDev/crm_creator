import 'server-only';

// Verifica que el CALLER de un proxy del CRM (route handler de Next) sea un operador
// con sesión Supabase válida. Los proxies (/api/market-studies, /api/ai/*) reenvían a
// agents-agency con el AA_SERVICE_TOKEN; sin este guard serían un RELAY ABIERTO (cualquiera
// con acceso de red al server podría disparar generación = coste). El cliente envía su
// access_token Supabase como Bearer; aquí se valida contra /auth/v1/user (sin dep nueva).
export async function isAuthedOperator(req: Request): Promise<boolean> {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return false;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return false;
  try {
    const r = await fetch(`${url.replace(/\/+$/, '')}/auth/v1/user`, {
      headers: { apikey: anon, Authorization: auth },
      cache: 'no-store',
    });
    return r.ok; // 200 = token de sesión válido
  } catch {
    return false;
  }
}
