import { NextResponse } from 'next/server';
import { crmOperatorFetch } from '@/lib/server/crm-back';
import { isAuthedOperator } from '@/lib/server/require-operator';

// Proxy server-side del CRM hacia `/service/operator/platform/oauth-config`
// (crm-central-oauth-admin-config). Config de la app Google OAuth CENTRAL de la
// plataforma. Mismo patrón de auth/token que los proxies de operador: el operador
// se autentica con su Bearer de Supabase (validado por isAuthedOperator) y este
// handler inyecta `x-service-token` server-side — el token NUNCA llega al browser.
//
// GET  → estado (configurado sí/no, sin secret). PUT → upsert cifrado de las 3 creds.
// El POST de "probar" vive en la subruta `/test`.
//
// force-dynamic + runtime nodejs: usa secretos de servidor y no puede prerender.
// En export nativo (exe/apk/ipa) todo `app/api` se elimina (export-compat.ts).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function forward(req: Request, method: 'GET' | 'PUT'): Promise<Response> {
  if (!(await isAuthedOperator(req))) {
    return NextResponse.json({ error: { code: 'unauthorized', message: 'No autenticado' } }, { status: 401 });
  }
  const body = method === 'PUT' ? await req.text() : undefined;
  try {
    const res = await crmOperatorFetch('/platform/oauth-config', { method, body });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
    });
  } catch (e) {
    return NextResponse.json({ error: { code: 'proxy_error', message: String(e) } }, { status: 502 });
  }
}

export function GET(req: Request): Promise<Response> {
  return forward(req, 'GET');
}

export function PUT(req: Request): Promise<Response> {
  return forward(req, 'PUT');
}
