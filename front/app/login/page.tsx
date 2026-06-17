'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProjects, useRole } from '@/lib/tenant-config-context';
import { demoLogin, setAuthed, DEMO_PASSWORD, DEMO_EMAIL_ROLE } from '@/lib/auth/demo-auth';

// Login DEMO de los CRM generados sin landing. Email+contraseña contra usuarios
// demo locales; al entrar fija el rol y va al panel. No usa AppShell (evita el
// redirect-loop del gate).
export default function LoginPage() {
  const { config } = useProjects();
  const { setRole } = useRole();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { logoText, logoImage, primary, secondary } = config.branding;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const role = demoLogin(email, password);
    if (!role) { setError('Email o contraseña incorrectos.'); return; }
    setAuthed(email.trim().toLowerCase());
    setRole(role);
    router.replace('/panel');
  }

  return (
    <div className="grid min-h-screen place-items-center bg-ink px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-2xl text-lg font-bold text-white shadow"
            style={logoImage ? undefined : { background: `linear-gradient(135deg, ${secondary}, ${primary})` }}>
            {logoImage ? <img src={logoImage} alt="logo" className="h-full w-full object-cover" /> : (logoText || '··')}
          </div>
          <div>
            <p className="text-lg font-semibold text-gray-900">{config.business.name}</p>
            <p className="text-xs text-gray-500">Inicia sesión para entrar al panel</p>
          </div>
        </div>

        <label className="block text-xs font-medium text-gray-600">Email</label>
        <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)}
          className="mt-1 mb-3 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" placeholder="admin@negocio.com" />

        <label className="block text-xs font-medium text-gray-600">Contraseña</label>
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" placeholder="••••" />

        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

        <button type="submit"
          className="mt-5 w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:opacity-90"
          style={{ background: `linear-gradient(135deg, ${secondary}, ${primary})` }}>
          Entrar
        </button>

        <div className="mt-4 rounded-lg bg-gray-50 px-3 py-2 text-[11px] text-gray-500">
          <p className="font-medium text-gray-600">Acceso demo (contraseña: <code>{DEMO_PASSWORD}</code>)</p>
          {Object.entries(DEMO_EMAIL_ROLE).map(([mail, role]) => (
            <button key={mail} type="button" onClick={() => { setEmail(mail); setPassword(DEMO_PASSWORD); }}
              className="mt-1 block w-full text-left hover:text-gray-800">
              · {mail} <span className="opacity-60">({role})</span>
            </button>
          ))}
        </div>
      </form>
    </div>
  );
}
