'use client';
// Client portal: own packages (bonos). Reads CustomerPackage rows linked to the
// Customer whose userId = auth.uid(). Direct Supabase-js (crm schema), RLS governed.
import { useEffect, useState } from 'react';
import { getCrmClient } from '@/lib/supabase/data-client';
import { getAuthClient } from '@/lib/supabase/auth-client';

interface PackageRow {
  id: string;
  sesiones_total: number;
  sesiones_usadas: number;
  estado: string;
  comprado_en: string;
  expira_en?: string | null;
  paquete?: { nombre: string; validez_dias: number } | null;
}

function mapStatus(s: string): string {
  const m: Record<string, string> = { ACTIVE: 'Activo', EXPIRED: 'Vencido', CANCELLED: 'Cancelado' };
  return m[s] ?? s;
}

export default function MyPackagesPage() {
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const authClient = getAuthClient();
        if (!authClient) { setError('Supabase no configurado'); return; }

        const { data: sessionData } = await authClient.auth.getSession();
        if (!sessionData.session) { setError('No autenticado'); return; }

        const crmClient = getCrmClient();
        if (!crmClient) { setError('Supabase no configurado'); return; }

        // Resolve own Customer id
        const { data: customer, error: custErr } = await crmClient
          .from('cliente')
          .select('id')
          .single();

        if (custErr) {
          if (custErr.code === 'PGRST116') { setPackages([]); return; }
          setError(custErr.message);
          return;
        }

        const { data, error: pkgErr } = await crmClient
          .from('paquete_cliente')
          .select('id, sesiones_total, sesiones_usadas, estado, comprado_en, expira_en, paquete:paquete_id(nombre, validez_dias)')
          .eq('cliente_id', customer.id)
          .order('comprado_en', { ascending: false });

        if (pkgErr) { setError(pkgErr.message); return; }
        setPackages((data ?? []) as unknown as PackageRow[]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <p className="text-sm text-gray-400">Cargando bonos…</p>;
  if (error) return <p className="text-sm text-red-400">{error}</p>;

  return (
    <div>
      <h1 className="text-xl font-semibold text-white mb-6">Mis bonos</h1>
      {packages.length === 0 ? (
        <p className="text-sm text-gray-500">No tienes bonos activos.</p>
      ) : (
        <ul className="space-y-3">
          {packages.map((p) => {
            const remaining = p.sesiones_total - p.sesiones_usadas;
            return (
              <li key={p.id} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-white">{p.paquete?.nombre ?? '—'}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {remaining} / {p.sesiones_total} sesiones restantes
                      {p.expira_en ? ` · Vence ${new Date(p.expira_en).toLocaleDateString('es-ES')}` : ''}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-gray-300">
                    {mapStatus(p.estado)}
                  </span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-white/10">
                  <div
                    className="h-1.5 rounded-full bg-green-500"
                    style={{ width: `${Math.max(0, (remaining / p.sesiones_total) * 100)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
