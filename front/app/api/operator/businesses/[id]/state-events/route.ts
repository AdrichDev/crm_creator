import { NextResponse } from 'next/server';
import { crmOperatorFetch } from '@/lib/server/crm-back';
import { isAuthedOperator } from '@/lib/server/require-operator';

// Proxy server-side del CRM hacia `GET /service/operator/businesses/:id/state-events`
// del propio back (crm-tenant-lifecycle-gate WU5). Devuelve el histórico de
// transiciones ({ events: [{ fromState, toState, reason, actor, createdAt }] } desc).
// Mismo patrón de auth/token que el proxy de lifecycle: Bearer de operador validado
// aquí, service token inyectado server-side.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAuthedOperator(req))) {
    return NextResponse.json({ error: { code: 'unauthorized', message: 'No autenticado' } }, { status: 401 });
  }
  const { id } = await ctx.params;
  try {
    const res = await crmOperatorFetch(`/businesses/${encodeURIComponent(id)}/state-events`, {
      method: 'GET',
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
