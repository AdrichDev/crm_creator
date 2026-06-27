'use client';
// Panel "Mi Cuenta" — datos del usuario logado (nombre, apellido, teléfono).
// Email: solo lectura (cambio de email es un flujo Supabase aparte).
// Con backend: GET /auth/me + guarda via PATCH /auth/profile.
// Sin backend (consola demo): precarga el usuario demo del rol activo (mock) y
// guarda en local — así el nombre registrado (p.ej. "Lucía Fernández" para el
// rol cliente) aparece bien aunque los datos sean mock.
import { useState, useEffect } from 'react';
import { Card, CardBody, Button } from '@/components/ui/primitives';
import { isApiEnabled } from '@/lib/api/client';
import { getAuthProfile, updateProfile, type AuthUserProfile } from '@/lib/api/profile';
import { useRole } from '@/lib/tenant-config-context';
import { DEMO_USERS } from '@/lib/config/roles';

interface MyAccountFormProps {
  /** Perfil precargado externamente (evita doble fetch cuando el panel padre ya lo cargó). */
  initialProfile?: AuthUserProfile;
  /** Callback cuando el perfil se carga o actualiza. */
  onProfileChange?: (profile: AuthUserProfile) => void;
}

/** Valida teléfono: ES nacional (9 dígitos 6-9) o internacional (+prefijo). Vacío = válido (opcional). */
function validatePhone(raw: string): string | null {
  const v = raw.trim().replace(/[\s().-]/g, '');
  if (!v) return null;
  if (/^[6-9]\d{8}$/.test(v)) return null; // España: 9 dígitos
  if (/^\+\d{8,15}$/.test(v)) return null; // Internacional (incluye +34…)
  return 'Teléfono no válido. Usa 9 dígitos (España) o + seguido del prefijo internacional (ej. +44 7700 900123).';
}

/** Separa "Nombre Apellido(s)" en firstName + lastName. */
function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/);
  const firstName = parts.shift() ?? '';
  return { firstName, lastName: parts.join(' ') };
}

export function MyAccountForm({ initialProfile, onProfileChange }: MyAccountFormProps) {
  const apiOn = isApiEnabled();
  const { role } = useRole();

  /** Perfil mock del rol activo (cuando no hay backend). */
  function demoProfile(): AuthUserProfile {
    const u = DEMO_USERS[role];
    const { firstName, lastName } = splitName(u.nombre);
    return { id: `demo-${role}`, email: u.email, firstName, lastName, phone: u.telefono };
  }

  const seed = initialProfile ?? (!apiOn ? demoProfile() : null);

  const [profile, setProfile] = useState<AuthUserProfile | null>(seed);
  const [loading, setLoading] = useState(!seed);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState(seed?.firstName ?? '');
  const [lastName, setLastName] = useState(seed?.lastName ?? '');
  const [phone, setPhone] = useState(seed?.phone ?? '');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function applyProfile(p: AuthUserProfile) {
    setProfile(p);
    setFirstName(p.firstName ?? '');
    setLastName(p.lastName ?? '');
    setPhone(p.phone ?? '');
    onProfileChange?.(p);
  }

  useEffect(() => {
    if (initialProfile) { applyProfile(initialProfile); setLoading(false); return; }
    if (!apiOn) { applyProfile(demoProfile()); setLoading(false); setDone(false); return; }
    setLoading(true);
    getAuthProfile()
      .then((p) => applyProfile(p))
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Error al cargar el perfil'))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiOn, role]);

  async function submit() {
    if (!firstName.trim()) { setError('El nombre no puede estar vacío.'); return; }
    const phoneError = validatePhone(phone);
    if (phoneError) { setError(phoneError); return; }
    setError(null); setDone(false); setSaving(true);
    try {
      if (!apiOn) {
        // Demo: guardado local (sin backend).
        const p: AuthUserProfile = {
          ...(profile ?? demoProfile()),
          firstName: firstName.trim(),
          lastName: lastName.trim() || null,
          phone: phone.trim() || null,
        };
        applyProfile(p);
        setDone(true);
        return;
      }
      const updated = await updateProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      applyProfile(updated);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el perfil');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <Card><CardBody><p className="text-sm text-[var(--panel-muted)]">Cargando perfil…</p></CardBody></Card>;
  }
  if (loadError) {
    return <Card><CardBody><p className="text-sm text-red-400">{loadError}</p></CardBody></Card>;
  }

  return (
    <Card>
      <CardBody className="space-y-4">
        <div>
          <p className="font-medium text-white">Datos personales</p>
          <p className="mt-1 text-sm text-[var(--panel-muted)]">
            Actualiza tu nombre, apellido y teléfono de contacto.
            {!apiOn && ' (Datos de ejemplo — sin backend conectado.)'}
          </p>
        </div>
        <div className="max-w-sm space-y-3">
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
