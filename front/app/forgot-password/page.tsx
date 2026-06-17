'use client';
import { useState } from 'react';
import Link from 'next/link';
import { forgotPassword } from '@/lib/api/account';
import { AuthShell } from '@/components/auth/auth-shell';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    // La respuesta del back es SIEMPRE neutra; aunque falle la red, mostramos el
    // mismo mensaje para no revelar si el email existe.
    try { await forgotPassword(email.trim()); } catch { /* neutro */ }
    setSent(true); setSaving(false);
  }

  if (sent) {
    return (
      <AuthShell title="Revisa tu email">
        <p className="text-sm text-[var(--panel-muted)]">
          Si el email existe, te hemos enviado instrucciones para restablecer tu contraseña.
        </p>
        <Link href="/" className="btn btn-outline mt-4 inline-block">Volver</Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Recuperar contraseña" subtitle="Te enviaremos un enlace para restablecerla.">
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="opera-label">Email</label>
          <input className="opera-control" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <button type="submit" className="btn btn-primary w-full" disabled={saving}>{saving ? 'Enviando…' : 'Enviar enlace'}</button>
        <Link href="/" className="block text-center text-sm text-[var(--panel-muted)] hover:text-white">Volver a iniciar sesión</Link>
      </form>
    </AuthShell>
  );
}
