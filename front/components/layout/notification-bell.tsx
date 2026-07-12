'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import { useModuleEnabled } from '@/lib/tenant-config-context';
import { isApiEnabled } from '@/lib/api/client';
import { fetchReminderSummary, fetchReminders, fetchCitasPendientes, patchReminder } from '@/lib/comercial/api';
import { buildFollowUpList, type FollowUpItem } from '@/lib/comercial/follow-up';

// Campana de notificaciones internas (crm-comercial-colores-seguimiento WU4). Solo se
// muestra con el módulo `comercial` activo. Badge = vencidos + hoy (fuente: /reminders/summary,
// autoridad para el número); el dropdown reutiliza buildFollowUpList sobre /reminders para
// mostrar los ítems concretos. Revalida al enfocar la ventana y tras completar un recordatorio.
export function NotificationBell() {
  const comercialActivo = useModuleEnabled('comercial');
  const apiEnabled = isApiEnabled();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [badge, setBadge] = useState(0);
  const [items, setItems] = useState<FollowUpItem[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);

  // Click fuera del desplegable → se contrae.
  useEffect(() => {
    if (!open) return;
    function onDocPointer(e: MouseEvent | TouchEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocPointer);
    document.addEventListener('touchstart', onDocPointer);
    return () => {
      document.removeEventListener('mousedown', onDocPointer);
      document.removeEventListener('touchstart', onDocPointer);
    };
  }, [open]);

  const habilitado = comercialActivo && apiEnabled;

  const reload = useCallback(async () => {
    if (!habilitado) return;
    try {
      // Sincroniza además las citas NO completadas hasta hoy (se muestran como notificaciones).
      const [summary, reminders, citas] = await Promise.all([
        fetchReminderSummary(), fetchReminders(), fetchCitasPendientes(),
      ]);
      const list = buildFollowUpList(
        reminders.map((r) => ({
          id: r.id, customerId: r.customerId, customerNombre: r.customerNombre,
          titulo: r.titulo, fechaPrevista: r.fechaPrevista, estado: r.estado,
        })),
        [],
        new Date(),
        citas,
      ).filter((i) => i.urgency === 'vencido' || i.urgency === 'hoy');
      setItems(list);
      // Badge = recordatorios (vencidos+hoy) + citas pendientes mostradas.
      const citasBadge = list.filter((i) => i.kind === 'cita-pendiente').length;
      setBadge(summary.vencidos + summary.hoy + citasBadge);
    } catch {
      // Best-effort: la campana no debe romper la navegación si el back falla.
    }
  }, [habilitado]);

  useEffect(() => { void reload(); }, [reload]);

  // Revalidación al enfocar la ventana (el usuario puede volver de completar algo en otra pestaña).
  useEffect(() => {
    if (!habilitado) return;
    function onFocus() { void reload(); }
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [habilitado, reload]);

  async function completar(reminderId: string) {
    await patchReminder(reminderId, { estado: 'DONE' });
    await reload();
  }

  function irAFicha(customerId: string) {
    setOpen(false);
    router.push(`/comercial?customerId=${customerId}`);
  }

  if (!habilitado) return null;

  return (
    <div className="relative" ref={rootRef}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label="Notificaciones"
        className="relative rounded-lg p-2 text-gray-400 transition hover:bg-[var(--hover-bg)] hover:text-[var(--hover-text)]">
        <Bell className="h-4 w-4" />
        {badge > 0 && (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {badge}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-xl border border-white/10 bg-black/90 p-2 shadow-xl backdrop-blur">
          <p className="px-2 py-1 text-xs font-medium text-[var(--panel-muted)]">Vencidos y de hoy</p>
          {items.length === 0 && <p className="px-2 py-2 text-sm text-[var(--panel-muted)]">Sin recordatorios pendientes.</p>}
          <ul className="max-h-72 space-y-1 overflow-auto">
            {items.map((item) => (
              <li key={item.id} className="rounded-lg px-2 py-1.5 text-sm hover:bg-[var(--hover-bg)]">
                <button type="button" onClick={() => irAFicha(item.customerId)} className="block w-full text-left">
                  <span className="block text-white">{item.customerNombre}</span>
                  <span className="block text-xs text-[var(--panel-muted)]">{item.titulo}</span>
                </button>
                {item.reminderId && (
                  <button type="button" onClick={() => completar(item.reminderId!)}
                    className="mt-1 text-xs text-[var(--acc)] hover:underline">
                    Completar
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
