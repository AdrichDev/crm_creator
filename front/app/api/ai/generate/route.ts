import { NextResponse } from 'next/server';
import { aaFetch } from '@/lib/server/aa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Mapea el tipo de generación del CRM al endpoint de agents-agency que ejecuta
// el modelo y aplica el metering de tokens (deductTokens + tokenUsage).
const ENDPOINT: Record<string, string> = {
  'market-study': '/api/market-studies',
  'marketing-plan': '/api/ai/marketing-plan',
  // UC-3 · sugerencia de branding desde contexto del negocio (no landing).
  // Reusa la generación genérica de agents-agency para mantener el metering.
  'branding-suggest': '/api/ai/generate',
};

export async function POST(req: Request) {
  let body: { kind?: string; clientId?: string | null; model?: string; effort?: string; prompt?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }

  const path = ENDPOINT[body.kind ?? ''];
  if (!path) return NextResponse.json({ error: 'Tipo de generación no soportado' }, { status: 400 });

  try {
    const res = await aaFetch(path, {
      method: 'POST',
      body: JSON.stringify({
        clientId: body.clientId ?? null,
        model: body.model,
        effort: body.effort,
        prompt: body.prompt,
      }),
    });

    const data = await res.json().catch(() => ({}));
    // 402 = cliente sin cupo (lo decide agents-agency). Se propaga tal cual.
    if (!res.ok) return NextResponse.json({ error: data?.error ?? `agents-agency ${res.status}` }, { status: res.status });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
