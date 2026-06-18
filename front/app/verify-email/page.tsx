'use client';
// Email verification for client self-registration.
// Supabase sends a confirmation link. After clicking, the auth client
// processes the token (SIGNED_IN / EMAIL_CONFIRMED event).
// No password required here — email confirmation only.
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { getAuthClient } from '@/lib/supabase/auth-client';
import { AuthShell } from '@/components/auth/auth-shell';

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<AuthShell title="Verificar email"><p className="text-sm text-[var(--panel-muted)]">Cargando…</p></AuthShell>}>
      <VerifyEmailInner />
    </Suspense>
  );
}

function VerifyEmailInner() {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);

  // Supabase processes the email-confirmation token from the URL hash automatically.
  // SIGNED_IN event fires once the email is confirmed.
  useEffect(() => {
    const supabase = getAuthClient();
    if (!supabase) { setError('Supabase no configurado'); setLoading(false); return; }

    // If already signed in (hash already consumed)
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) { setDone(true); setLoading(false); }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        setDone(true);
        setLoading(false);
      } else if (event === 'SIGNED_OUT') {
        setLoading(false);
        setError('El enlace de verificación es inválido o ha expirado.');
      }
    });

    // Timeout fallback: if no event fires, the link may be invalid
    const timeout = setTimeout(() => {
      setLoading(false);
      setError('El enlace de verificación es inválido o ha expirado.');
    }, 8000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  if (loading) {
    return (
      <AuthShell title="Verificar email">
        <p className="text-sm text-[var(--panel-muted)]">Verificando tu email…</p>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell title="Email verificado">
        <p className="text-sm text-[var(--panel-muted)]">Tu cuenta está activa. Ya puedes iniciar sesión.</p>
        <Link href="/login" className="btn btn-primary mt-4 inline-block">Ir a iniciar sesión</Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Error de verificación">
      <p className="text-sm text-red-400">{error ?? 'No se pudo verificar el email.'}</p>
      <Link href="/login" className="btn btn-outline mt-4 inline-block">Volver a inicio</Link>
    </AuthShell>
  );
}
