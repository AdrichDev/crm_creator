import { NextResponse } from 'next/server';
import { aaFetch } from '@/lib/server/aa';
import { isAuthedOperator } from '@/lib/server/require-operator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// model-catalog (S8): relé server-side del catálogo de modelos del CRM.
//
// El selector del CRM ya no es la fuente de verdad: pide el catálogo a agents-agency
// (`GET /api/models`, contrato S7) y este route handler lo reenvía con el MISMO token de
// servicio (AA_SERVICE_TOKEN) que ya usa `/api/ai/generate`. El token de servicio NUNCA
// llega al navegador y la sesión del operador nunca se reenvía a AA.
// Si AA falla se propaga el error (no se inventa un catálogo): el front cae a su lista
// estática de respaldo (lib/config/models.ts).
export async function GET(req: Request) {
  // Solo operadores autenticados (sesión Supabase): el relé lleva el service token.
  if (!(await isAuthedOperator(req))) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  try {
    const res = await aaFetch('/api/models', { method: 'GET' });
    const text = await res.text();
    if (!res.ok) {
      return NextResponse.json({ error: `agents-agency ${res.status}` }, { status: res.status });
    }
    return new NextResponse(text, {
      status: 200,
      headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
