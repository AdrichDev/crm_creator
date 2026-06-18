'use client';
// Client portal layout. Minimal shell — no sidebar (not the CRM panel).
// Validates Supabase session before rendering; redirects to /login if unauthenticated.
import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { getAuthClient } from '@/lib/supabase/auth-client';
import Link from 'next/link';
import { logout } from '@/lib/auth/session';

export default function MeLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = getAuthClient();
    if (!supabase) { router.replace('/login'); return; }

    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { router.replace('/login'); return; }
      setReady(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) router.replace('/login');
    });

    return () => subscription.unsubscribe();
  }, [router]);

  if (!ready) {
    return <div className="grid min-h-screen place-items-center bg-ink text-gray-400">Cargando…</div>;
  }

  async function handleLogout() {
    await logout();
    router.replace('/login');
  }

  return (
    <div className="min-h-screen bg-[var(--panel-bg,#0b0f0c)]">
      <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <nav className="flex items-center gap-4 text-sm text-gray-400">
          <Link href="/me/profile" className="hover:text-white transition">Mi perfil</Link>
          <Link href="/me/bookings" className="hover:text-white transition">Mis citas</Link>
          <Link href="/me/packages" className="hover:text-white transition">Mis bonos</Link>
        </nav>
        <button onClick={handleLogout} className="text-xs text-gray-500 hover:text-red-400 transition">
          Salir
        </button>
      </header>
      <main className="mx-auto max-w-2xl px-6 py-8">
        {children}
      </main>
    </div>
  );
}
