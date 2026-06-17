'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { verifyEmail, passwordPolicyError } from '@/lib/api/account';
import { AuthShell } from '@/components/auth/auth-shell';

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<AuthShell title="Verificar email"><p className="text-sm text-[var(--panel-muted)]">Cargando…</p></AuthShell>}>
      <VerifyEmailInner />
    </Suspense>
  );
}

function VerifyEmailInner() {
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
    try { await verifyEmail(token, pwd, repeat); setDone(true); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo verificar el email'); }
    finally { setSaving(false); }
  }

  if (done) {
    return (
      <AuthShell title="✅ Email verificado">
        <p className="text-sm text-[var(--panel-muted)]">Tu cuenta está activa. Ya puedes iniciar sesión.</p>
        <Link href="/login" className="btn btn-primary mt-4 inline-block">Ir a iniciar sesión</Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Verifica tu email" subtitle="Elige tu contraseña para activar tu cuenta.">
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="opera-label">Contraseña</label>
          <input className="opera-control" type="password" autoComplete="new-password" value={pwd} onChange={(e) => setPwd(e.target.value)} />
        </div>
        <div>
          <label className="opera-label">Repetir contraseña</label>
          <input className="opera-control" type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button type="submit" className="btn btn-primary w-full" disabled={saving}>{saving ? 'Verificando…' : 'Verificar y crear contraseña'}</button>
      </form>
    </AuthShell>
  );
}
