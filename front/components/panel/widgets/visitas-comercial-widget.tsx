'use client';
import { useEffect, useState } from 'react';
import { isApiEnabled } from '@/lib/api/client';
import { fetchReminders, fetchReminderSummary } from '@/lib/comercial/api';
import { reminderUrgency, type FollowUpUrgency } from '@/lib/comercial/follow-up';
import type { ReminderDto, ReminderSummaryDto } from '@/lib/comercial/types';
import { WidgetShell } from './widget-shell';

const MAX_ITEMS = 4;

const URGENCY_COLOR: Record<FollowUpUrgency, string> = {
  vencido: '#f87171', hoy: '#fbbf24', proximo: 'var(--acc)', pendiente: 'var(--panel-muted)',
};

/**
 * Seguimiento del módulo Comercial de campo: contadores de recordatorios
 * (vencidos / hoy / próximos 7 días) + próximas visitas pendientes. Módulo
 * solo-API (igual que Categorías): en modo generador muestra el aviso estándar.
 */
export function VisitasComercialWidget() {
  const apiEnabled = isApiEnabled();
  const [summary, setSummary] = useState<ReminderSummaryDto | null>(null);
  const [reminders, setReminders] = useState<ReminderDto[]>([]);

  useEffect(() => {
    if (!apiEnabled) return;
    let alive = true;
    void Promise.all([fetchReminderSummary(), fetchReminders()])
      .then(([s, r]) => { if (alive) { setSummary(s); setReminders(r); } })
      .catch(() => { /* Sin datos: el widget muestra el estado vacío. */ });
    return () => { alive = false; };
  }, [apiEnabled]);

  const ahora = new Date();
  const proximas = reminders
    .filter((r) => r.estado === 'PENDING')
    .sort((a, b) => {
      const fa = a.fechaPrevista ? new Date(a.fechaPrevista).getTime() : Infinity;
      const fb = b.fechaPrevista ? new Date(b.fechaPrevista).getTime() : Infinity;
      return fa - fb;
    })
    .slice(0, MAX_ITEMS);

  return (
    <WidgetShell icon="MapPinned" label="Seguimiento comercial">
      {!apiEnabled ? (
        <p className="text-xs text-[var(--panel-muted)]">Módulo disponible solo en modo CRM.</p>
      ) : (
        <div className="flex h-full flex-col gap-2">
          <div className="grid grid-cols-3 gap-2">
            {([
              ['Vencidos', summary?.vencidos ?? 0],
              ['Hoy', summary?.hoy ?? 0],
              ['Próx. 7d', summary?.proximos7d ?? 0],
            ] as const).map(([label, value]) => (
              <div key={label} className="rounded-lg bg-white/5 px-2 py-1.5 text-center">
                <p className="text-sm font-bold text-white">{value}</p>
                <p className="text-[10px] uppercase tracking-wide text-[var(--panel-muted)]">{label}</p>
              </div>
            ))}
          </div>
          {proximas.length === 0 ? (
            <p className="text-xs text-[var(--panel-muted)]">Sin visitas pendientes en la cartera.</p>
          ) : (
            <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
              {proximas.map((r) => {
                const urgencia = reminderUrgency(r.fechaPrevista, ahora);
                return (
                  <li key={r.id} className="flex items-center gap-2 text-xs">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: URGENCY_COLOR[urgencia] }} />
                    <span className="truncate font-medium text-white">{r.customerNombre}</span>
                    <span className="min-w-0 flex-1 truncate text-[var(--panel-muted)]">{r.titulo}</span>
                    {r.fechaPrevista && (
                      <span className="shrink-0 text-[var(--panel-muted)]">
                        {new Date(r.fechaPrevista).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </WidgetShell>
  );
}
