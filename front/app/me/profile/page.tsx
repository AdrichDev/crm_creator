'use client';
// Client portal: own profile. Reads Customer row via direct Supabase-js (crm schema).
// RLS policy customer_read: userId = auth.uid() → only own row returned.
// This exercises the RLS path; the Node backend is NOT called for this read.
import { useEffect, useState } from 'react';
import { getCrmClient } from '@/lib/supabase/data-client';
import { getAuthClient } from '@/lib/supabase/auth-client';

interface CustomerProfile {
  id: string;
  nombre: string;
  apellido?: string | null;
  email?: string | null;
  telefono?: string | null;
  estado?: string | null;
  notas?: string | null;
  creado_en?: string | null;
}

export default function MyProfilePage() {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
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

        // RLS customer_read policy: userId = auth.uid()
        // The crm.Customer table has userId (UUID) linking to auth.users.id.
        // Supabase PostgREST passes the access_token; RLS filters to own row.
        // NO seleccionar `notes`/`status`: son campos internos de staff. RLS es row-level
        // (no oculta columnas), así que el cliente solo debe pedir columnas seguras.
        const { data, error: dbError } = await crmClient
          .from('cliente')
          .select('id, nombre, apellido, email, telefono, creado_en')
          .single();

        if (dbError) {
          if (dbError.code === 'PGRST116') {
            // No rows — customer record doesn't exist yet for this auth user
            setError('No se encontró perfil de cliente vinculado.');
          } else {
            setError(dbError.message);
          }
          return;
        }

        setProfile(data as CustomerProfile);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <p className="text-sm text-gray-400">Cargando perfil…</p>;
  if (error) return <p className="text-sm text-red-400">{error}</p>;
  if (!profile) return null;

  return (
    <div>
      <h1 className="text-xl font-semibold text-white mb-6">Mi perfil</h1>
      <dl className="space-y-4 text-sm">
        <Row label="Nombre" value={[profile.nombre, profile.apellido].filter(Boolean).join(' ')} />
        <Row label="Email" value={profile.email} />
        <Row label="Teléfono" value={profile.telefono} />
      </dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex gap-4">
      <dt className="w-28 shrink-0 text-gray-500">{label}</dt>
      <dd className="text-white">{value || '—'}</dd>
    </div>
  );
}
