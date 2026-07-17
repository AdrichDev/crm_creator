import { NextResponse } from 'next/server';
import { crmOperatorFetch } from '@/lib/server/crm-back';
import { isAuthedOperator } from '@/lib/server/require-operator';

// Proxy server-side del CRM hacia `POST /service/operator/platform/oauth-config/test`
// (crm-central-oauth-admin-config). Valida el FORMATO de las 3 creds sin fugar el
// value (rate-limitado en el back). Mismo patrón de auth/token que el proxy hermano.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  if (!(await isAuthedOperator(req))) {
    return NextResponse.json({ error: { code: 'unauthorized', message: 'No autenticado' } }, { status: 401 });
  }
  const body = await req.text();
  try {
    const res = await crmOperatorFetch('/platform/oauth-config/test', { method: 'POST', body });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
    });
  } catch (e) {
    return NextResponse.json({ error: { code: 'proxy_error', message: String(e) } }, { status: 502 });
  }
}
