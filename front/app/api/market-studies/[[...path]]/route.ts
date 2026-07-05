import { NextResponse } from 'next/server';
import { aaFetch } from '@/lib/server/aa';
import { isAuthedOperator } from '@/lib/server/require-operator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Proxy del CRM hacia los endpoints REALES de market-studies de agents-agency.
// AA autentica /api por Bearer (service token) — el CRM llama desde el SERVIDOR
// con aaFetch. Se reenvían GET/POST/PATCH tal cual (status + JSON, incl. 402).
// DELETE NO se reenvía: el borrado de estudios está deshabilitado en el CRM.

function targetPath(path: string[] | undefined, search: string): string {
  const sub = (path ?? []).map(encodeURIComponent).join('/');
  const base = sub ? `/api/market-studies/${sub}` : '/api/market-studies';
  return `${base}${search}`;
}

async function forward(req: Request, path: string[] | undefined, method: string) {
  // Solo operadores autenticados (sesión Supabase): el proxy lleva el service token.
  if (!(await isAuthedOperator(req))) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }
  const { search } = new URL(req.url);
  const hasBody = method === 'POST' || method === 'PATCH';
  const body = hasBody ? await req.text() : undefined;

  try {
    const res = await aaFetch(targetPath(path, search), {
      method,
      ...(body !== undefined ? { body } : {}),
    });
    // Propaga el body y el status tal cual (incluido 402 = sin cupo).
    const text = await res.text();
    const contentType = res.headers.get('content-type') ?? 'application/json';
    return new NextResponse(text, {
      status: res.status,
      headers: { 'content-type': contentType },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}

export async function GET(req: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  const { path } = await ctx.params;
  return forward(req, path, 'GET');
}

export async function POST(req: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  const { path } = await ctx.params;
  return forward(req, path, 'POST');
}

export async function PATCH(req: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  const { path } = await ctx.params;
  return forward(req, path, 'PATCH');
}

// Borrado deshabilitado en el CRM: no se reenvía a AA.
export async function DELETE() {
  return NextResponse.json({ error: 'Borrado de estudios no permitido' }, { status: 405 });
}
