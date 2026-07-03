import 'server-only';

// Verifica que el CALLER de un proxy del CRM (route handler de Next) sea un OPERADOR:
// sesión Supabase válida Y `app_metadata.role === 'operator'`. Los proxies
// (/api/market-studies, /api/ai/*) reenvían a agents-agency con el AA_SERVICE_TOKEN;
// sin este guard cualquier usuario autenticado de cualquier tenant podría disparar
// generación con privilegios de servicio (= coste). El cliente envía su access_token
// Supabase como Bearer; aquí se valida contra /auth/v1/user (sin dep nueva).
//
// Por qué app_metadata y NO user_metadata: app_metadata solo puede modificarse
// server-side con la service_role key; user_metadata es editable por el propio
// usuario, por lo que aceptarla permitiría auto-asignarse el rol (suplantación).
//
// Operativa para asignar el rol a un operador real (manual, fuera de código):
//   - Supabase Dashboard → Authentication → Users → [usuario] → editar app_metadata:
//       { "role": "operator" }
//   - o Admin API (con service_role):
//       supabase.auth.admin.updateUserById(id, { app_metadata: { role: 'operator' } })

// Shape mínima de la respuesta de GoTrue /auth/v1/user que necesitamos.
type SupabaseUser = {
  app_metadata?: { role?: unknown };
};

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
    if (!r.ok) return false; // token inválido o error upstream
    const user = (await r.json()) as SupabaseUser | null;
    // Solo cuenta app_metadata; user_metadata.role se ignora a propósito.
    return user?.app_metadata?.role === 'operator';
  } catch {
    // Body no parseable o error de red → fail-closed.
    return false;
  }
}
