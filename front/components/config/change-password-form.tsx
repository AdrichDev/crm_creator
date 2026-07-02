'use client';
import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { Card, CardBody, Button } from '@/components/ui/primitives';
import { isApiEnabled } from '@/lib/api/client';
import { changePassword, forgotPassword, passwordPolicyError, passwordChecks, type PasswordChecks } from '@/lib/api/account';

interface ChangePasswordFormProps {
  /** Email del usuario logado. Necesario para el flujo "olvidé mi contraseña". */
  userEmail?: string;
}

// Requisitos de complejidad mostrados como leyenda viva (✗ rojo → ✓ verde).
const REQS: { key: keyof PasswordChecks; label: string }[] = [
  { key: 'upper', label: 'Una mayúscula' },
  { key: 'lower', label: 'Una minúscula' },
  { key: 'digit', label: 'Un número' },
  { key: 'special', label: 'Un símbolo especial' },
];

// Formulario "Cambiar contraseña" para el usuario logueado (cualquier rol).
// La verificación de la contraseña antigua es server-side (POST /auth/change-password).
// No usa supabaseClient.auth.signInWithPassword — evita side-effects en la sesión activa.
// El usuario debe introducir PRIMERO su contraseña actual; hasta entonces los campos
// de nueva contraseña quedan deshabilitados.
export function ChangePasswordForm({ userEmail }: ChangePasswordFormProps) {
  const apiOn = isApiEnabled();
  const [oldPassword, setOld] = useState('');
  const [newPassword, setNew] = useState('');
  const [repeat, setRepeat] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const [resetSending, setResetSending] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  const oldEntered = oldPassword.trim().length > 0;
  const checks = passwordChecks(newPassword);

  async function submit() {
    setError(null); setDone(false);
    if (!oldEntered) { setError('Introduce primero tu contraseña actual.'); return; }
    if (newPassword !== repeat) { setError('La nueva contraseña y su repetición no coinciden.'); return; }
    const policy = passwordPolicyError(newPassword);
    if (policy) { setError(policy); return; }
    if (newPassword === oldPassword) { setError('La nueva contraseña debe ser distinta de la actual.'); return; }
    setSaving(true);
    try {
      if (!apiOn) {
        // Demo (sin backend): no se puede verificar la actual; se simula el cambio.
        setDone(true); setOld(''); setNew(''); setRepeat('');
        return;
      }
      await changePassword(oldPassword, newPassword, repeat);
      setDone(true); setOld(''); setNew(''); setRepeat('');
    } catch (e) {
      // El back devuelve "La contraseña actual es incorrecta" en caso de wrong_password (401).
      setError(e instanceof Error ? e.message : 'No se pudo cambiar la contraseña');
    } finally { setSaving(false); }
  }

  async function handleForgotPassword() {
    setResetError(null); setResetMsg(null);
    if (!apiOn) {
      setResetMsg('Si existe una cuenta con ese email, recibirás instrucciones para restablecer tu contraseña.');
      return;
    }
    if (!userEmail) { setResetError('No se pudo obtener tu email. Recarga la página.'); return; }
    setResetSending(true);
    try {
      await forgotPassword(userEmail);
      setResetMsg('Si existe una cuenta con ese email, recibirás instrucciones para restablecer tu contraseña.');
    } catch {
      setResetError('No se pudo enviar el email de restablecimiento. Inténtalo de nuevo.');
    } finally {
      setResetSending(false);
    }
  }

  return (
    <Card><CardBody className="space-y-4">
      <div>
        <p className="font-medium text-white">Cambiar contraseña</p>
        <p className="mt-1 text-sm text-[var(--panel-muted)]">
          Introduce tu contraseña actual y luego la nueva. Al cambiarla se cerrarán tus otras sesiones por seguridad.
        </p>
      </div>
      <div className="max-w-sm space-y-3">
        <div>
          <label className="opera-label">Contraseña actual</label>
          <input className="opera-control" type="password" autoComplete="new-password" value={oldPassword} onChange={(e) => setOld(e.target.value)} />
        </div>
        <div>
          <label className="opera-label">Nueva contraseña</label>
          <input className="opera-control" type="password" autoComplete="new-password" value={newPassword} disabled={!oldEntered} onChange={(e) => setNew(e.target.value)} />
        </div>
        <div>
          <label className="opera-label">Repetir nueva contraseña</label>
          <input className="opera-control" type="password" autoComplete="new-password" value={repeat} disabled={!oldEntered} onChange={(e) => setRepeat(e.target.value)} />
        </div>

        {/* Leyenda viva de requisitos: ✗ rojo hasta cumplirse, ✓ verde al cumplirse */}
        <ul className="space-y-1 text-sm" aria-label="Requisitos de la contraseña">
          {REQS.map((r) => {
            const ok = checks[r.key];
            return (
              <li key={r.key} className={`flex items-center gap-2 ${ok ? 'text-green-400' : 'text-red-400'}`}>
                {ok ? <Check className="h-4 w-4 shrink-0" /> : <X className="h-4 w-4 shrink-0" />}
                <span>{r.label}</span>
              </li>
            );
          })}
        </ul>

        {error && <p className="text-sm text-red-400">{error}</p>}
        {done && <p className="text-sm text-green-400">Contraseña actualizada.</p>}
        <Button onClick={submit} disabled={saving || !oldEntered}>{saving ? 'Guardando…' : 'Cambiar contraseña'}</Button>
      </div>

      {/* Enlace a recuperación por email */}
      <div className="border-t border-white/10 pt-3">
        <button
          type="button"
          onClick={handleForgotPassword}
          disabled={resetSending}
          className="text-sm text-[var(--panel-muted)] hover:text-[var(--hover-text)] transition disabled:opacity-50"
        >
          {resetSending ? 'Enviando…' : '¿No recuerdas tu contraseña?'}
        </button>
        {resetMsg && <p className="mt-2 text-sm text-green-400">{resetMsg}</p>}
        {resetError && <p className="mt-2 text-sm text-red-400">{resetError}</p>}
      </div>
    </CardBody></Card>
  );
}
