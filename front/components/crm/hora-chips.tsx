'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import { cn } from '@/lib/utils';

interface Slot { hora: string; disponible: boolean }

// Chips de hora para nueva cita (crm-citas-ux-agenda WU3): sustituye al
// <input type="time"> por huecos reales del día (GET /bookings/slots), con los
// ocupados deshabilitados. Si el fetch falla, `onFallback` avisa al padre para
// que degrade al input de hora — el modal nunca debe quedar inusable.
export function HoraChips({ fecha, serviceId, employeeId, locationId, value, onChange, onFallback }: {
  fecha: string;
  serviceId: string;
  employeeId?: string;
  locationId?: string;
  value: string;
  onChange: (hora: string) => void;
  onFallback: () => void;
}) {
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!fecha || !serviceId) { setSlots(null); return; }
    let cancelled = false;
    setLoading(true);
    const qs = new URLSearchParams({ date: fecha, serviceId });
    if (employeeId) qs.set('employeeId', employeeId);
    if (locationId) qs.set('locationId', locationId);
    apiFetch<{ slots: Slot[] }>(`/bookings/slots?${qs.toString()}`)
      .then((r) => { if (!cancelled) setSlots(r.slots ?? []); })
      .catch(() => { if (!cancelled) { setSlots(null); onFallback(); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fecha, serviceId, employeeId, locationId]);

  if (!fecha || !serviceId) {
    return <p className="mt-1 text-xs text-[var(--panel-muted)]">Elige fecha y servicio primero.</p>;
  }
  if (loading) return <p className="mt-1 text-xs text-[var(--panel-muted)]">Cargando horas…</p>;
  if (!slots || slots.length === 0) {
    return <p className="mt-1 text-xs text-[var(--panel-muted)]">Sin horas disponibles ese día.</p>;
  }

  return (
    <div className="mt-1 grid grid-cols-4 gap-1.5">
      {slots.map((s) => (
        <button key={s.hora} type="button" disabled={!s.disponible} onClick={() => onChange(s.hora)}
          className={cn(
            'rounded-lg border px-2 py-1.5 text-xs font-medium transition',
            !s.disponible && 'cursor-not-allowed border-[var(--line)] text-[var(--panel-muted)] opacity-40',
            s.disponible && value === s.hora && 'border-[var(--acc)] bg-[var(--acc)] text-black',
            s.disponible && value !== s.hora && 'border-[var(--line)] text-[var(--panel-text)] hover:border-[var(--acc)]',
          )}>
          {s.hora}
        </button>
      ))}
    </div>
  );
}
