'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import { Button } from '@/components/ui/primitives';
import { nextWeekdayAt } from '@/lib/utils/calendar';
import { DOW_FULL } from '@/lib/config/constants';
import { Loader2, CalendarPlus } from 'lucide-react';

interface Opt { id: string; nombre: string }
interface ResourceOpt { id: string; nombre: string; tipo: string; capacidad: number }

// Alta de clase (fitness/gimnasio): clase + instructor + sala (aforo
// informativo) + día de semana/hora. Grupal: sin cliente ni equipo (ambos
// null, no aplica el XOR de bookings porque ninguno de los dos se envía).
export function NuevaClaseModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [services, setServices] = useState<Opt[]>([]);
  const [employees, setEmployees] = useState<Opt[]>([]);
  const [salas, setSalas] = useState<ResourceOpt[]>([]);
  const [locationId, setLocationId] = useState('');
  const [form, setForm] = useState({ serviceId: '', employeeId: '', resourceId: '', diaSemana: '0', hora: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(''); setForm({ serviceId: '', employeeId: '', resourceId: '', diaSemana: '0', hora: '' });
    Promise.all([
      apiFetch<{ items: Opt[] }>('/services').then((r) => r.items ?? []).catch(() => [] as Opt[]),
      apiFetch<{ items: Opt[] }>('/employees').then((r) => r.items ?? []).catch(() => [] as Opt[]),
      apiFetch<{ items: ResourceOpt[] }>('/resources').then((r) => (r.items ?? []).filter((x) => x.tipo === 'ROOM' || x.tipo === 'SPACE')).catch(() => [] as ResourceOpt[]),
      apiFetch<{ items: { id: string }[] }>('/locations').then((r) => r.items ?? []).catch(() => [] as { id: string }[]),
    ]).then(([s, e, r, l]) => { setServices(s); setEmployees(e); setSalas(r); setLocationId(l[0]?.id ?? ''); });
  }, [open]);

  if (!open) return null;

  const salaElegida = salas.find((s) => s.id === form.resourceId);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!form.serviceId || !form.hora) { setError('Clase y hora son obligatorios.'); return; }
    if (!locationId) { setError('El negocio no tiene sucursal configurada.'); return; }
    setSaving(true); setError('');
    try {
      const start = nextWeekdayAt(Number(form.diaSemana), form.hora);
      await apiFetch('/bookings', {
        method: 'POST',
        body: JSON.stringify({
          locationId, serviceId: form.serviceId,
          employeeId: form.employeeId || undefined,
          resourceIds: form.resourceId ? [form.resourceId] : [],
          start: start.toISOString(),
        }),
      });
      onCreated(); onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la clase.');
    } finally { setSaving(false); }
  }

  const inputCls = 'mt-1 w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm';
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4 backdrop-blur-sm" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit} className="crm-modal-panel w-full max-w-md rounded-2xl bg-[var(--panel-bg,#fff)] p-6 shadow-xl">
        <p className="mb-4 font-display text-lg font-semibold text-[var(--panel-text)]">Nueva clase</p>

        <label className="block text-xs font-medium text-[var(--panel-muted)]">Clase *</label>
        <select className={inputCls} value={form.serviceId} onChange={(e) => setForm({ ...form, serviceId: e.target.value })}>
          <option value="">Selecciona clase…</option>
          {services.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>

        <label className="mt-3 block text-xs font-medium text-[var(--panel-muted)]">Instructor</label>
        <select className={inputCls} value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
          <option value="">Sin asignar</option>
          {employees.map((e2) => <option key={e2.id} value={e2.id}>{e2.nombre}</option>)}
        </select>

        <label className="mt-3 block text-xs font-medium text-[var(--panel-muted)]">Sala</label>
        <select className={inputCls} value={form.resourceId} onChange={(e) => setForm({ ...form, resourceId: e.target.value })}>
          <option value="">Sin asignar</option>
          {salas.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        {salaElegida && (
          <p className="mt-1 text-[11px] text-[var(--panel-muted)]">Aforo: {salaElegida.capacidad} personas.</p>
        )}

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[var(--panel-muted)]">Día de la semana *</label>
            <select className={inputCls} value={form.diaSemana} onChange={(e) => setForm({ ...form, diaSemana: e.target.value })}>
              {DOW_FULL.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--panel-muted)]">Hora *</label>
            <input type="time" className={inputCls} value={form.hora} onChange={(e) => setForm({ ...form, hora: e.target.value })} />
          </div>
        </div>

        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />} Crear clase
          </Button>
        </div>
      </form>
    </div>
  );
}
