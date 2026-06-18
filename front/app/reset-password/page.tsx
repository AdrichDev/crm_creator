'use client';
// Reset password from a Supabase password-recovery email link.
// Supabase sends a link with access_token in hash + type=recovery.
// With detectSessionInUrl:true the auth client fires PASSWORD_RECOVERY event
// automatically. We listen for it, then call updateUser({password}).
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { getAuthClient } from '@/lib/supabase/auth-client';
import { AuthShell } from '@/components/auth/auth-shell';
import { passwordPolicyError } from '@/lib/api/account';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<AuthShell title="Restablecer contraseña"><p className="text-sm text-[var(--panel-muted)]">Cargando…</p></AuthShell>}>
      <ResetPasswordInner />
    </Suspense>
  );
}

function ResetPasswordInner() {
  const [pwd, setPwd] = useState('');
  const [repeat, setRepeat] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [ready, setReady] = useState(false);

  // Supabase processes the recovery token from the URL hash automatically.
  // PASSWORD_RECOVERY event fires once the session is established from the link.
  useEffect(() => {
    const supabase = getAuthClient();
    if (!supabase) { setError('Supabase no configurado'); return; }
    // If session already exists (hash already consumed), allow immediately.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pwd !== repeat) { setError('Las contraseñas no coinciden.'); return; }
    const policy = passwordPolicyError(pwd);
    if (policy) { setError(policy); return; }
    setSaving(true);
    try {
      const supabase = getAuthClient();
      if (!supabase) throw new Error('Supabase no configurado');
      const { error: updateError } = await supabase.auth.updateUser({ password: pwd });
      if (updateError) throw new Error(updateError.message);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo restablecer la contraseña');
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <AuthShell title="Contraseña restablecida">
        <p className="text-sm text-[var(--panel-muted)]">Ya puedes iniciar sesión con tu nueva contraseña.</p>
        <Link href="/login" className="btn btn-primary mt-4 inline-block">Ir a iniciar sesión</Link>
      </AuthShell>
    );
  }

  if (!ready) {
    return (
      <AuthShell title="Restablecer contraseña">
        <p className="text-sm text-[var(--panel-muted)]">Verificando enlace de recuperación…</p>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
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
