'use client';
// Portal del cliente: sus bonos. Vía REST (/me/packages) — fuente única.
import { useEffect, useState } from 'react';
import { getMyPackages, type MyPackageRow } from '@/lib/api/me';

const ESTADO_LABEL: Record<string, string> = { ACTIVE: 'Activo', EXPIRED: 'Vencido', CANCELLED: 'Cancelado' };

export default function MyPackagesPage() {
  const [packages, setPackages] = useState<MyPackageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMyPackages()
      .then(setPackages)
      .catch((e) => setError(e instanceof Error ? e.message : 'Error'))
      .finally(() => setLoading(false));
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
          {packages.map((p) => (
            <li key={p.id} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-white">{p.paquete || '—'}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {p.restantes} / {p.sesionesTotal} sesiones restantes
                    {p.expiraEn ? ` · Vence ${new Date(p.expiraEn).toLocaleDateString('es-ES')}` : ''}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-gray-300">
                  {ESTADO_LABEL[p.estado] ?? p.estado}
                </span>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-white/10">
                <div
                  className="h-1.5 rounded-full bg-green-500"
                  style={{ width: `${p.sesionesTotal ? Math.max(0, (p.restantes / p.sesionesTotal) * 100) : 0}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
