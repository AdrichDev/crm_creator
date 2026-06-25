'use client';
// Panel "Mi Cuenta" — datos del usuario logado (nombre, apellido, teléfono).
// Email: solo lectura (cambio de email es un flujo Supabase aparte).
// Guarda via PATCH /auth/profile.
import { useState, useEffect } from 'react';
import { Card, CardBody, Button } from '@/components/ui/primitives';
import { isApiEnabled } from '@/lib/api/client';
import { getAuthProfile, updateProfile, type AuthUserProfile } from '@/lib/api/profile';

interface MyAccountFormProps {
  /** Perfil precargado externamente (evita doble fetch cuando el panel padre ya lo cargó). */
  initialProfile?: AuthUserProfile;
  /** Callback cuando el perfil se carga o actualiza. */
  onProfileChange?: (profile: AuthUserProfile) => void;
}

export function MyAccountForm({ initialProfile, onProfileChange }: MyAccountFormProps) {
  const apiOn = isApiEnabled();

  const [profile, setProfile] = useState<AuthUserProfile | null>(initialProfile ?? null);
  const [loading, setLoading] = useState(!initialProfile);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState(initialProfile?.firstName ?? '');
  const [lastName, setLastName] = useState(initialProfile?.lastName ?? '');
  const [phone, setPhone] = useState(initialProfile?.phone ?? '');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (initialProfile) {
      setProfile(initialProfile);
      setFirstName(initialProfile.firstName ?? '');
      setLastName(initialProfile.lastName ?? '');
      setPhone(initialProfile.phone ?? '');
      return;
    }
    if (!apiOn) { setLoading(false); return; }
    getAuthProfile()
      .then((p) => {
        setProfile(p);
        setFirstName(p.firstName ?? '');
        setLastName(p.lastName ?? '');
        setPhone(p.phone ?? '');
        onProfileChange?.(p);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Error al cargar el perfil'))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit() {
    if (!firstName.trim()) { setError('El nombre no puede estar vacío.'); return; }
    setError(null); setDone(false); setSaving(true);
    try {
      const updated = await updateProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      setProfile(updated);
      setFirstName(updated.firstName ?? '');
      setLastName(updated.lastName ?? '');
      setPhone(updated.phone ?? '');
      onProfileChange?.(updated);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el perfil');
    } finally {
      setSaving(false);
    }
  }

  if (!apiOn) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-[var(--panel-muted)]">
            La edición de perfil requiere el backend conectado (<code>NEXT_PUBLIC_API_URL</code>).
          </p>
        </CardBody>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-[var(--panel-muted)]">Cargando perfil…</p>
        </CardBody>
      </Card>
    );
  }

  if (loadError) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-red-400">{loadError}</p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody className="space-y-4">
        <div>
          <p className="font-medium text-white">Datos personales</p>
          <p className="mt-1 text-sm text-[var(--panel-muted)]">
            Actualiza tu nombre, apellido y teléfono de contacto.
          </p>
        </div>
        <div className="max-w-sm space-y-3">
          <div>
            <label className="opera-label">Email</label>
            <input
              className="opera-control opacity-60 cursor-not-allowed"
              type="email"
              value={profile?.email ?? ''}
              readOnly
              disabled
              aria-readonly="true"
            />
          </div>
          <div>
            <label className="opera-label">Nombre *</label>
            <input
              className="opera-control"
              type="text"
              autoComplete="given-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
          <div>
            <label className="opera-label">Apellido</label>
            <input
              className="opera-control"
              type="text"
              autoComplete="family-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
          <div>
            <label className="opera-label">Teléfono</label>
            <input
              className="opera-control"
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          {done && <p className="text-sm text-green-400">Perfil actualizado correctamente.</p>}
          <Button onClick={submit} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
