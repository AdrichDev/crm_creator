'use client';
// Portal del cliente: su ficha. Vía REST (/me/profile) — fuente única. El back
// devuelve solo campos seguros del Customer (no datos internos de staff).
import { useEffect, useState } from 'react';
import { getMyProfile, type MyProfile } from '@/lib/api/me';

export default function MyProfilePage() {
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMyProfile()
      .then((p) => {
        if (!p) setError('No se encontró perfil de cliente vinculado.');
        else setProfile(p);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Error'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-gray-400">Cargando perfil…</p>;
  if (error) return <p className="text-sm text-red-400">{error}</p>;
  if (!profile) return null;

  return (
    <div>
      <h1 className="text-xl font-semibold text-white mb-6">Mi perfil</h1>
      <dl className="space-y-4 text-sm">
        <Row label="Nombre" value={profile.nombre} />
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
