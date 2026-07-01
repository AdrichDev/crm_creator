'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import { useTerm } from '@/lib/tenant-config-context';
import { Button } from '@/components/ui/primitives';
import { Loader2, CalendarPlus } from 'lucide-react';

interface Opt { id: string; nombre: string }

const CANALES = ['Presencial', 'Videollamada'];

// Alta REAL de cita (modo CRM/Supabase): selecciona cliente/servicio/profesional
// por id + fecha/hora → POST /api/bookings (valida disponibilidad en el back).
// `canal`: solo visible en el vertical `comerciales` (reunión presencial/video);
// se guarda en `notes` con un prefijo — ver Open Question en design.md de
// crm-citas-por-sector sobre si merece columna propia en el futuro.
export function NuevaCitaModal({ open, onClose, onCreated, mostrarCanal = false }: { open: boolean; onClose: () => void; onCreated: () => void; mostrarCanal?: boolean }) {
  const [customers, setCustomers] = useState<Opt[]>([]);
  const [services, setServices] = useState<Opt[]>([]);
  const [employees, setEmployees] = useState<Opt[]>([]);
  const [locationId, setLocationId] = useState('');
  const [form, setForm] = useState({ customerId: '', serviceId: '', employeeId: '', fecha: '', hora: '', canal: CANALES[0] });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const termCliente = useTerm('clientes', 'Cliente');
  const termEmpleado = useTerm('empleados', 'Profesional');

  useEffect(() => {
    if (!open) return;
    setError(''); setForm({ customerId: '', serviceId: '', employeeId: '', fecha: '', hora: '', canal: CANALES[0] });
    // Los endpoints devuelven { items, total, page, limit } tras añadir paginación server-side.
    Promise.all([
      apiFetch<{ items: Opt[] }>('/customers').then(r => r.items ?? []).catch(() => [] as Opt[]),
      apiFetch<{ items: Opt[] }>('/services').then(r => r.items ?? []).catch(() => [] as Opt[]),
      apiFetch<{ items: Opt[] }>('/employees').then(r => r.items ?? []).catch(() => [] as Opt[]),
      apiFetch<{ items: { id: string }[] }>('/locations').then(r => r.items ?? []).catch(() => [] as { id: string }[]),
    ]).then(([c, s, e, l]) => { setCustomers(c); setServices(s); setEmployees(e); setLocationId(l[0]?.id ?? ''); });
  }, [open]);

  if (!open) return null;

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!form.customerId || !form.serviceId || !form.fecha || !form.hora) { setError('Cliente, servicio, fecha y hora son obligatorios.'); return; }
    if (!locationId) { setError('El negocio no tiene sucursal configurada.'); return; }
    setSaving(true); setError('');
    try {
      await apiFetch('/bookings', {
        method: 'POST',
        body: JSON.stringify({
          locationId, serviceId: form.serviceId, customerId: form.customerId,
          employeeId: form.employeeId || undefined, start: `${form.fecha}T${form.hora}:00`,
          notes: mostrarCanal ? `Canal: ${form.canal}` : undefined,
        }),
      });
      onCreated(); onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la cita.');
    } finally { setSaving(false); }
  }

  const inputCls = 'mt-1 w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm';
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit} className="w-full max-w-md rounded-2xl bg-[var(--panel-bg,#fff)] p-6 shadow-xl">
        <p className="mb-4 font-display text-lg font-semibold text-[var(--panel-text)]">Nueva cita</p>

        <label className="block text-xs font-medium text-[var(--panel-muted)]">{termCliente} *</label>
        <select className={inputCls} value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
          <option value="">Selecciona {termCliente.toLowerCase()}…</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>

        <label className="mt-3 block text-xs font-medium text-[var(--panel-muted)]">Servicio *</label>
        <select className={inputCls} value={form.serviceId} onChange={(e) => setForm({ ...form, serviceId: e.target.value })}>
          <option value="">Selecciona servicio…</option>
          {services.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>

        <label className="mt-3 block text-xs font-medium text-[var(--panel-muted)]">{termEmpleado}</label>
        <select className={inputCls} value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
          <option value="">Cualquiera</option>
          {employees.map((e2) => <option key={e2.id} value={e2.id}>{e2.nombre}</option>)}
        </select>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[var(--panel-muted)]">Fecha *</label>
            <input type="date" className={inputCls} value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--panel-muted)]">Hora *</label>
            <input type="time" className={inputCls} value={form.hora} onChange={(e) => setForm({ ...form, hora: e.target.value })} />
          </div>
        </div>

        {mostrarCanal && (
          <>
            <label className="mt-3 block text-xs font-medium text-[var(--panel-muted)]">Canal</label>
            <select className={inputCls} value={form.canal} onChange={(e) => setForm({ ...form, canal: e.target.value })}>
              {CANALES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </>
        )}

        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />} Crear cita
          </Button>
        </div>
      </form>
    </div>
  );
}
