'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import { Button } from '@/components/ui/primitives';
import { nextWeekdayAt } from '@/lib/utils/calendar';
import { DOW_FULL } from '@/lib/config/constants';
import { Loader2, CalendarPlus } from 'lucide-react';

interface Opt { id: string; nombre: string }
interface ResourceOpt { id: string; nombre: string; tipo: string }

const ACTIVIDAD_NOMBRE = 'Entrenamiento';

/**
 * Este modal SOLO crea entrenamientos — la "actividad" siempre es
 * "Entrenamiento", no tiene sentido pedirla en un selector (sería la única
 * opción). Se resuelve un Service llamado "Entrenamiento" en segundo plano
 * (se busca por nombre; si no existe, se crea una vez) y no se muestra en el
 * formulario. serviceId sigue siendo obligatorio en el esquema, pero es un
 * detalle interno, no una decisión del admin en este flujo.
 */
async function resolveActividadServiceId(): Promise<string> {
  const existing = await apiFetch<{ items: { id: string; nombre: string }[] }>('/services')
    .then((r) => r.items ?? [])
    .catch(() => [] as { id: string; nombre: string }[]);
  const found = existing.find((s) => s.nombre.trim().toLowerCase() === ACTIVIDAD_NOMBRE.toLowerCase());
  if (found) return found.id;
  const created = await apiFetch<{ id: string }>('/services', {
    method: 'POST',
    body: JSON.stringify({ nombre: ACTIVIDAD_NOMBRE, categoria: 'Entrenamientos', duracion: 60 }),
  });
  return created.id;
}

// Alta de entrenamiento (centro-deportivo): equipo + campo + entrenador +
// día de semana/hora, en vez de cliente individual. POST /bookings con
// teamId (XOR con customerId, que aquí nunca se envía).
export function NuevaEntrenamientoModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [teams, setTeams] = useState<Opt[]>([]);
  const [campos, setCampos] = useState<ResourceOpt[]>([]);
  const [employees, setEmployees] = useState<Opt[]>([]);
  const [locationId, setLocationId] = useState('');
  const [form, setForm] = useState({ teamId: '', resourceId: '', employeeId: '', diaSemana: '0', hora: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(''); setForm({ teamId: '', resourceId: '', employeeId: '', diaSemana: '0', hora: '' });
    Promise.all([
      apiFetch<{ items: Opt[] }>('/categories').then((r) => r.items ?? []).catch(() => [] as Opt[]),
      apiFetch<{ items: ResourceOpt[] }>('/resources').then((r) => (r.items ?? []).filter((x) => x.tipo === 'COURT')).catch(() => [] as ResourceOpt[]),
      apiFetch<{ items: Opt[] }>('/employees').then((r) => r.items ?? []).catch(() => [] as Opt[]),
      apiFetch<{ items: { id: string }[] }>('/locations').then((r) => r.items ?? []).catch(() => [] as { id: string }[]),
    ]).then(([t, c, e, l]) => { setTeams(t); setCampos(c); setEmployees(e); setLocationId(l[0]?.id ?? ''); });
  }, [open]);

  if (!open) return null;

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!form.teamId || !form.hora) { setError('Equipo y hora son obligatorios.'); return; }
    if (!locationId) { setError('El negocio no tiene sucursal configurada.'); return; }
    setSaving(true); setError('');
    try {
      const serviceId = await resolveActividadServiceId();
      const start = nextWeekdayAt(Number(form.diaSemana), form.hora);
      await apiFetch('/bookings', {
        method: 'POST',
        body: JSON.stringify({
          locationId, serviceId, teamId: form.teamId,
          employeeId: form.employeeId || undefined,
          resourceIds: form.resourceId ? [form.resourceId] : [],
          start: start.toISOString(),
        }),
      });
      onCreated(); onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el entrenamiento.');
    } finally { setSaving(false); }
  }

  const inputCls = 'mt-1 w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm';
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4 backdrop-blur-sm" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit} className="crm-modal-panel w-full max-w-md rounded-2xl bg-[var(--panel-bg,#fff)] p-6 shadow-xl">
        <p className="mb-4 font-display text-lg font-semibold text-[var(--panel-text)]">Nuevo entrenamiento</p>

        <label className="block text-xs font-medium text-[var(--panel-muted)]">Equipo *</label>
        <select className={inputCls} value={form.teamId} onChange={(e) => setForm({ ...form, teamId: e.target.value })}>
          <option value="">Selecciona equipo…</option>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
        </select>

        <label className="mt-3 block text-xs font-medium text-[var(--panel-muted)]">Campo</label>
        <select className={inputCls} value={form.resourceId} onChange={(e) => setForm({ ...form, resourceId: e.target.value })}>
          <option value="">Sin asignar</option>
          {campos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>

        <label className="mt-3 block text-xs font-medium text-[var(--panel-muted)]">Entrenador</label>
        <select className={inputCls} value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
          <option value="">Sin asignar</option>
          {employees.map((e2) => <option key={e2.id} value={e2.id}>{e2.nombre}</option>)}
        </select>

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
        <p className="mt-1 text-[11px] text-[var(--panel-muted)]">Se programa para la próxima ocurrencia de ese día.</p>

        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />} Crear entrenamiento
          </Button>
        </div>
      </form>
    </div>
  );
}
