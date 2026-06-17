import { NextResponse } from 'next/server';
import { aaFetch } from '@/lib/server/aa';
import type { ClientLite } from '@/lib/clients/picker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function toLite(c: Record<string, unknown>): ClientLite {
  return {
    id: String(c.id),
    nombre: String(c.name ?? c.nombre ?? ''),
    email: (c.email as string) ?? null,
    telefono: (c.phone as string) ?? null,
    cif: (c.cif as string) ?? null,
    direccion: (c.direccion as string) ?? (c.address as string) ?? null,
    contacto: (c.contactPerson as string) ?? null,
  };
}

// GET /api/clients/:id → datos del cliente para auto-rellenar el paso "Datos".
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const res = await aaFetch(`/api/clients/${encodeURIComponent(id)}`, {}, req.headers.get('cookie') ?? undefined);
    if (!res.ok) return NextResponse.json({ error: `agents-agency ${res.status}` }, { status: res.status });
    return NextResponse.json(toLite(await res.json()));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
