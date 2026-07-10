'use client';
// Pantalla de bloqueo full-screen del tenant (crm-tenant-lifecycle-gate WU4).
//
// Se monta cuando el interceptor de red detecta un corte del kill switch:
//   - variant "suspended"  → 423 tenant_suspended  (servicio suspendido, reversible).
//   - variant "terminated" → 410 tenant_terminated (cuenta cerrada).
// Cubre toda la ventana (fixed inset-0, z alto) para que el panel de debajo NO sea
// operable. Copy en español (UI de cara al usuario del CRM). Consulta /tenant-status
// —exento del gate— para mostrar el estado real y, si aplica, el fin del periodo de
// gracia. Si la lectura falla, cae a un copy genérico según la variante.
import { useEffect, useState } from 'react';
import { fetchTenantStatus, type TenantStatus } from '@/lib/api/tenant-status';
import type { TenantBlockedVariant } from '@/lib/tenant/blocked-state';

interface Copy {
  title: string;
  body: string;
}

function copyFor(variant: TenantBlockedVariant, status: TenantStatus | null): Copy {
  if (variant === 'terminated' || status?.lifecycle === 'TERMINATED') {
    return {
      title: 'Cuenta cerrada',
      body: 'El acceso a esta cuenta se ha cerrado. Si crees que es un error, contacta con el equipo de OperaOS para reactivarla.',
    };
  }
  return {
    title: 'Servicio suspendido',
    body: 'El acceso a este espacio está suspendido temporalmente. Ponte en contacto con el equipo de OperaOS para restablecerlo.',
  };
}

function formatGrace(graceUntil?: string | null): string | null {
  if (!graceUntil) return null;
  const d = new Date(graceUntil);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function BlockedScreen({ variant }: { variant: TenantBlockedVariant }) {
  const [status, setStatus] = useState<TenantStatus | null>(null);

  useEffect(() => {
    let alive = true;
    fetchTenantStatus().then((s) => {
      if (alive) setStatus(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  const { title, body } = copyFor(variant, status);
  const grace = formatGrace(status?.graceUntil);

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="tenant-blocked-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-[var(--panel-bg,#0b0f1a)] px-6"
    >
      <div className="w-full max-w-md text-center">
        <p className="mb-6 text-sm font-semibold uppercase tracking-[0.3em] text-[var(--panel-muted,#8a93a6)]">
          OperaOS
        </p>
        <h1
          id="tenant-blocked-title"
          className="mb-4 text-2xl font-bold text-[var(--panel-fg,#f4f6fb)]"
        >
          {title}
        </h1>
        <p className="text-sm leading-relaxed text-[var(--panel-muted,#8a93a6)]">{body}</p>
        {grace && (
          <p className="mt-4 text-xs text-[var(--panel-muted,#8a93a6)]">
            Periodo de gracia hasta el {grace}.
          </p>
        )}
      </div>
    </div>
  );
}
