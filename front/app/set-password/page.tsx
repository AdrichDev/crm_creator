'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { setPassword, passwordPolicyError } from '@/lib/api/account';
import { AuthShell } from '@/components/auth/auth-shell';

export default function SetPasswordPage() {
  return (
    <Suspense fallback={<AuthShell title="Fijar contraseña"><p className="text-sm text-[var(--panel-muted)]">Cargando…</p></AuthShell>}>
      <SetPasswordInner />
    </Suspense>
  );
}

function SetPasswordInner() {
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
    try { await setPassword(token, pwd, repeat); setDone(true); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo fijar la contraseña'); }
    finally { setSaving(false); }
  }

  if (done) {
    return (
      <AuthShell title="Contraseña creada">
        <p className="text-sm text-[var(--panel-muted)]">Ya puedes iniciar sesión con tu nueva contraseña.</p>
        <Link href="/" className="btn btn-primary mt-4 inline-block">Ir a iniciar sesión</Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Fija tu contraseña" subtitle="Crea la contraseña de tu cuenta para empezar.">
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
        <button type="submit" className="btn btn-primary w-full" disabled={saving}>{saving ? 'Guardando…' : 'Crear contraseña'}</button>
      </form>
    </AuthShell>
  );
}
