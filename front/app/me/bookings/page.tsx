'use client';
// Client portal: own bookings. Reads Booking rows linked to the Customer whose
// userId = auth.uid(). Uses direct Supabase-js (crm schema) — RLS governs the result.
// RLS staff_business_read + customer_read ensures a CLIENT sees only their own bookings.
import { useEffect, useState } from 'react';
import { getCrmClient } from '@/lib/supabase/data-client';
import { getAuthClient } from '@/lib/supabase/auth-client';

interface BookingRow {
  id: string;
  inicia_en: string;
  termina_en: string;
  estado: string;
  servicio?: { nombre: string } | null;
  empleado?: { nombre: string; apellido?: string | null } | null;
}

function mapStatus(s: string): string {
  const m: Record<string, string> = {
    PENDING: 'Pendiente', CONFIRMED: 'Confirmada', CANCELLED: 'Cancelada',
    CANCELED: 'Cancelada', COMPLETED: 'Completada', NO_SHOW: 'No presentado',
    DRAFT: 'Borrador', CHECKED_IN: 'En sala', IN_PROGRESS: 'En curso',
  };
  return m[s] ?? s;
}

export default function MyBookingsPage() {
  const [bookings, setBookings] = useState<BookingRow[]>([]);
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

        // First resolve own Customer id via userId = auth.uid()
        const { data: customer, error: custErr } = await crmClient
          .from('cliente')
          .select('id')
          .single();

        if (custErr) {
          if (custErr.code === 'PGRST116') { setBookings([]); return; }
          setError(custErr.message);
          return;
        }

        // Now load bookings for this customer; RLS further enforces tenant boundary.
        const { data, error: bookErr } = await crmClient
          .from('reserva')
          .select('id, inicia_en, termina_en, estado, servicio:servicio_id(nombre), empleado:empleado_id(nombre, apellido)')
          .eq('cliente_id', customer.id)
          .order('inicia_en', { ascending: false });

        if (bookErr) { setError(bookErr.message); return; }
        setBookings((data ?? []) as unknown as BookingRow[]);
      } finally {
        setLoading(false);
      }
    }
    load();
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
                  <p className="text-sm font-medium text-white">{b.servicio?.nombre ?? '—'}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(b.inicia_en).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })}
                    {b.empleado ? ` · ${b.empleado.nombre} ${b.empleado.apellido ?? ''}`.trim() : ''}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-gray-300">
                  {mapStatus(b.estado)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
