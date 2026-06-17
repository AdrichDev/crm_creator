'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { resetPassword, passwordPolicyError } from '@/lib/api/account';
import { AuthShell } from '@/components/auth/auth-shell';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<AuthShell title="Restablecer contraseña"><p className="text-sm text-[var(--panel-muted)]">Cargando…</p></AuthShell>}>
      <ResetPasswordInner />
    </Suspense>
  );
}

function ResetPasswordInner() {
  const token = useSearchParams().get('token') ?? '';
  const [pwd, setPwd] = useState('');
  const [repeat, setRepeat] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!token) { setError('Enlace inválido: falta el token.'); return; }
    if (pwd !== repeat) { setError('Las contraseñas no coinciden.'); return; }
    const policy = passwordPolicyError(pwd);
    if (policy) { setError(policy); return; }
    setSaving(true);
    try { await resetPassword(token, pwd, repeat); setDone(true); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo restablecer la contraseña'); }
    finally { setSaving(false); }
  }

  if (done) {
    return (
      <AuthShell title="Contraseña restablecida">
        <p className="text-sm text-[var(--panel-muted)]">Ya puedes iniciar sesión con tu nueva contraseña.</p>
        <Link href="/" className="btn btn-primary mt-4 inline-block">Ir a iniciar sesión</Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Restablecer contraseña" subtitle="Elige una nueva contraseña para tu cuenta.">
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="opera-label">Nueva contraseña</label>
          <input className="opera-control" type="password" autoComplete="new-password" value={pwd} onChange={(e) => setPwd(e.target.value)} />
        </div>
        <div>
          <label className="opera-label">Repetir contraseña</label>
          <input className="opera-control" type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button type="submit" className="btn btn-primary w-full" disabled={saving}>{saving ? 'Guardando…' : 'Restablecer'}</button>
      </form>
    </AuthShell>
  );
}
