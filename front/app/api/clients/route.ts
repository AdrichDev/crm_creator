import { NextResponse } from 'next/server';
import { aaFetch } from '@/lib/server/aa';
import type { ClientLite } from '@/lib/clients/picker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Normaliza el cliente de agents-agency al shape ligero del selector.
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

// GET /api/clients → lista de clientes (proxy a agents-agency).
export async function GET(req: Request) {
  try {
    const res = await aaFetch('/api/clients', {}, req.headers.get('cookie') ?? undefined);
    if (!res.ok) return NextResponse.json({ error: `agents-agency ${res.status}` }, { status: res.status });
    const data = await res.json();
    const arr = Array.isArray(data) ? data : (data?.items ?? []);
    return NextResponse.json((arr as Record<string, unknown>[]).map(toLite));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
