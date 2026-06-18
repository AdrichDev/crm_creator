'use client';
// Set password for invited users. Supabase sends an invite link with
// access_token in the URL hash. With detectSessionInUrl:true the auth client
// automatically signs the user in on page load; we just call updateUser({password}).
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { getAuthClient } from '@/lib/supabase/auth-client';
import { AuthShell } from '@/components/auth/auth-shell';
import { passwordPolicyError } from '@/lib/api/account';

export default function SetPasswordPage() {
  return (
    <Suspense fallback={<AuthShell title="Fijar contraseña"><p className="text-sm text-[var(--panel-muted)]">Cargando…</p></AuthShell>}>
      <SetPasswordInner />
    </Suspense>
  );
}

function SetPasswordInner() {
  const [pwd, setPwd] = useState('');
  const [repeat, setRepeat] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [ready, setReady] = useState(false);

  // Supabase processes the invite token from the URL hash automatically when
  // detectSessionInUrl:true. We wait for the SIGNED_IN event to confirm it worked.
  useEffect(() => {
    const supabase = getAuthClient();
    if (!supabase) { setError('Supabase no configurado'); return; }
    // Check if already signed in (hash already processed)
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) { setReady(true); return; }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') setReady(true);
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
      setError(err instanceof Error ? err.message : 'No se pudo fijar la contraseña');
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <AuthShell title="Contraseña creada">
        <p className="text-sm text-[var(--panel-muted)]">Ya puedes iniciar sesión con tu nueva contraseña.</p>
        <Link href="/login" className="btn btn-primary mt-4 inline-block">Ir a iniciar sesión</Link>
      </AuthShell>
    );
  }

  if (!ready) {
    return (
      <AuthShell title="Fijar contraseña">
        <p className="text-sm text-[var(--panel-muted)]">Verificando enlace de invitación…</p>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
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
