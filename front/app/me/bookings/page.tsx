'use client';
// Portal del cliente: sus citas. Vía REST (/me/bookings) — fuente única. El back
// resuelve la pertenencia por userId y devuelve el shape ya listo.
import { useEffect, useState } from 'react';
import { getMyBookings, type MyBookingRow } from '@/lib/api/me';

export default function MyBookingsPage() {
  const [bookings, setBookings] = useState<MyBookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMyBookings()
      .then(setBookings)
      .catch((e) => setError(e instanceof Error ? e.message : 'Error'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-gray-400">Cargando citas…</p>;
  if (error) return <p className="text-sm text-red-400">{error}</p>;

  return (
    <div>
      <h1 className="text-xl font-semibold text-white mb-6">Mis citas</h1>
      {bookings.length === 0 ? (
        <p className="text-sm text-gray-500">No tienes citas registradas.</p>
      ) : (
        <ul className="space-y-3">
          {bookings.map((b) => (
            <li key={b.id} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-white">{b.servicio || '—'}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {b.fecha} · {b.hora}
                    {b.empleado ? ` · ${b.empleado}` : ''}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-gray-300">
                  {b.estado}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
