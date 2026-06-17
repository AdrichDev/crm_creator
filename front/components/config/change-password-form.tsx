'use client';
import { useState } from 'react';
import { Card, CardBody, Button } from '@/components/ui/primitives';
import { isApiEnabled } from '@/lib/api/client';
import { changePassword, passwordPolicyError } from '@/lib/api/account';

// Formulario "Cambiar contraseña" para el usuario logueado (cualquier rol).
export function ChangePasswordForm() {
  const apiOn = isApiEnabled();
  const [oldPassword, setOld] = useState('');
  const [newPassword, setNew] = useState('');
  const [repeat, setRepeat] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    setError(null); setDone(false);
    if (newPassword !== repeat) { setError('La nueva contraseña y su repetición no coinciden.'); return; }
    const policy = passwordPolicyError(newPassword);
    if (policy) { setError(policy); return; }
    if (newPassword === oldPassword) { setError('La nueva contraseña debe ser distinta de la actual.'); return; }
    setSaving(true);
    try {
      await changePassword(oldPassword, newPassword, repeat);
      setDone(true); setOld(''); setNew(''); setRepeat('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar la contraseña');
    } finally { setSaving(false); }
  }

  if (!apiOn) {
    return (
      <Card><CardBody>
        <p className="text-sm text-[var(--panel-muted)]">
          El cambio de contraseña requiere el backend conectado (<code>NEXT_PUBLIC_API_URL</code>).
        </p>
      </CardBody></Card>
    );
  }

  return (
    <Card><CardBody className="space-y-4">
      <div>
        <p className="font-medium text-white">Cambiar contraseña</p>
        <p className="mt-1 text-sm text-[var(--panel-muted)]">
          Al cambiarla se cerrarán tus otras sesiones por seguridad.
        </p>
      </div>
      <div className="max-w-sm space-y-3">
        <div>
          <label className="opera-label">Contraseña actual</label>
          <input className="opera-control" type="password" autoComplete="current-password" value={oldPassword} onChange={(e) => setOld(e.target.value)} />
        </div>
        <div>
          <label className="opera-label">Nueva contraseña</label>
          <input className="opera-control" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNew(e.target.value)} />
        </div>
        <div>
          <label className="opera-label">Repetir nueva contraseña</label>
          <input className="opera-control" type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        {done && <p className="text-sm text-green-400">Contraseña actualizada.</p>}
        <Button onClick={submit} disabled={saving}>{saving ? 'Guardando…' : 'Cambiar contraseña'}</Button>
      </div>
    </CardBody></Card>
  );
}
