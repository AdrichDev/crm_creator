import { NextResponse } from 'next/server';
import { crmOperatorFetch } from '@/lib/server/crm-back';
import { isAuthedOperator } from '@/lib/server/require-operator';

// Proxy server-side del CRM hacia `PUT /service/operator/businesses/:id/lifecycle`
// del propio back (crm-tenant-lifecycle-gate WU5). El browser NUNCA lleva el
// service token: el operador se autentica con su Bearer de Supabase (validado por
// isAuthedOperator) y este handler inyecta `x-service-token` desde el entorno.
// Reenvía el body y el status tal cual (200 { id, lifecycle, graceUntil,
// suspendedAt } | 400 unknown_state/grace_until_required | 404 business_not_found).
//
// force-dynamic + runtime nodejs: usa secretos de servidor y no puede prerender.
// En export nativo (exe/apk/ipa) todo `app/api` se elimina (export-compat.ts).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAuthedOperator(req))) {
    return NextResponse.json({ error: { code: 'unauthorized', message: 'No autenticado' } }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = await req.text();
  try {
    const res = await crmOperatorFetch(`/businesses/${encodeURIComponent(id)}/lifecycle`, {
      method: 'PUT',
      body,
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
    });
  } catch (e) {
    return NextResponse.json({ error: { code: 'proxy_error', message: String(e) } }, { status: 502 });
  }
}
