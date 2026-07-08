'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { useProjects, useRole } from '@/lib/tenant-config-context';
import { login } from '@/lib/auth/session';

// Login real (JWT + Prisma) del CRM generado. Email+contraseña contra el backend;
// al entrar fija el rol de vista según la membership y va al panel.
export default function LoginPage() {
  const { config } = useProjects();
  const { setRole } = useRole();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { logoText, logoImage, primary, secondary } = config.branding;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const role = await login(email, password);
      setRole(role);
      // Aterriza en el dashboard (consola de proyectos); ahí se abre/crea cada CRM.
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión');
    } finally {
      setLoading(false);
    }
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
          className="mt-1 mb-3 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" placeholder="tu@email.com" />

        <label className="block text-xs font-medium text-gray-600">Contraseña</label>
        <div className="relative mt-1 w-full">
          <input 
            type={showPassword ? 'text' : 'password'} 
            autoComplete="current-password" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-gray-300 px-3 py-2 pr-10 text-sm" 
            placeholder="••••••••" 
          />
          <button 
            type="button" 
            onClick={() => setShowPassword(!showPassword)}
            className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600"
            tabIndex={-1}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

        <button type="submit" disabled={loading}
          className="mt-5 w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:opacity-90 disabled:opacity-60"
          style={{ background: `linear-gradient(135deg, ${secondary}, ${primary})` }}>
          {loading ? 'Entrando…' : 'Entrar'}
        </button>

        <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
          <Link href="/registro" className="hover:text-gray-800">¿No tienes cuenta? <span className="font-medium text-gray-700">Regístrate</span></Link>
          <Link href="/forgot-password" className="hover:text-gray-800">¿Olvidaste tu contraseña?</Link>
        </div>
      </form>
    </div>
  );
}
