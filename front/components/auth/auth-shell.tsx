'use client';
import type { ReactNode } from 'react';

// Contenedor centrado para páginas públicas de credenciales (set/forgot/reset).
// Sin sidebar; usa los tokens del panel para coherencia visual.
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-[var(--panel-bg,#0b0f0c)] p-4">
      <div className="w-full max-w-md rounded-[12px] border border-white/10 bg-[var(--panel-card,#11161300)] p-6 shadow-xl"
        style={{ background: 'var(--panel-card, rgba(255,255,255,0.03))' }}>
        <h1 className="text-lg font-semibold text-white">{title}</h1>
        {subtitle && <p className="mt-1 mb-4 text-sm text-[var(--panel-muted)]">{subtitle}</p>}
        {!subtitle && <div className="mb-4" />}
        {children}
      </div>
    </div>
  );
}
