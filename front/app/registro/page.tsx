'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useProjects } from '@/lib/tenant-config-context';
import { registerClient } from '@/lib/api/account';

// Auto-registro de cliente del CRM generado. Pide nombre/correo/user/teléfono;
// el backend crea la cuenta pendiente y envía un email de verificación. El
// cliente fija su contraseña al verificar (nunca se envía contraseña en claro).
export default function RegistroPage() {
  const { config } = useProjects();
  const { logoText, logoImage, primary, secondary } = config.branding;

  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^[a-z0-9_]{3,30}$/.test(username.trim().toLowerCase())) {
      setError('El usuario debe tener 3–30 caracteres (letras minúsculas, números o _).');
      return;
    }
    setLoading(true);
    try {
      await registerClient({ firstName: firstName.trim(), email: email.trim(), username: username.trim().toLowerCase(), phone: phone.trim() });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar el registro');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-ink px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-2xl text-lg font-bold text-white shadow"
            style={logoImage ? undefined : { background: `linear-gradient(135deg, ${secondary}, ${primary})` }}>
            {logoImage ? <img src={logoImage} alt="logo" className="h-full w-full object-cover" /> : (logoText || '··')}
          </div>
          <div>
            <p className="text-lg font-semibold text-gray-900">{config.business.name}</p>
            <p className="text-xs text-gray-500">Crea tu cuenta de cliente</p>
          </div>
        </div>

        {done ? (
          <div className="text-center">
            <p className="text-sm text-gray-700">📩 Si el email es válido, te hemos enviado un enlace de verificación.</p>
            <p className="mt-2 text-xs text-gray-500">Ábrelo para verificar tu correo y elegir tu contraseña.</p>
            <Link href="/login" className="mt-5 inline-block rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow"
              style={{ background: `linear-gradient(135deg, ${secondary}, ${primary})` }}>Volver a iniciar sesión</Link>
          </div>
        ) : (
          <form onSubmit={onSubmit}>
            <label className="block text-xs font-medium text-gray-600">Nombre</label>
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} required
              className="mt-1 mb-3 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" placeholder="Tu nombre" />

            <label className="block text-xs font-medium text-gray-600">Correo</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              className="mt-1 mb-3 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" placeholder="tu@email.com" />

            <label className="block text-xs font-medium text-gray-600">Usuario</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} required
              className="mt-1 mb-3 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" placeholder="usuario_123" />

            <label className="block text-xs font-medium text-gray-600">Teléfono</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required
              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" placeholder="600 000 000" />

            {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

            <button type="submit" disabled={loading}
              className="mt-5 w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:opacity-90 disabled:opacity-60"
              style={{ background: `linear-gradient(135deg, ${secondary}, ${primary})` }}>
              {loading ? 'Enviando…' : 'Crear cuenta'}
            </button>

            <p className="mt-4 text-center text-xs text-gray-500">
              ¿Ya tienes cuenta? <Link href="/login" className="font-medium text-gray-700 hover:text-gray-900">Inicia sesión</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
