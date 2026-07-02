'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/primitives';
import { Plus, Trash2, Loader2 } from 'lucide-react';

interface Tramo { diaSemana: number; inicio: string; fin: string; }

// diaSemana 0-6 según el back (0 = domingo, como Date.getDay()).
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

// Editor de horario semanal del empleado (modo API). Carga con GET
// /employees/:id/horario y guarda con PUT (reemplazo completo y atómico).
export function HorarioEmpleadoModal({ open, employeeId, employeeName, onClose }: {
  open: boolean; employeeId: string; employeeName?: string; onClose: () => void;
}) {
  const [tramos, setTramos] = useState<Tramo[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !employeeId) return;
    setError(''); setLoading(true);
    apiFetch<{ tramos: Tramo[] }>(`/employees/${employeeId}/horario`)
      .then((r) => setTramos((r.tramos ?? []).map((t) => ({ diaSemana: t.diaSemana, inicio: t.inicio, fin: t.fin }))))
      .catch(() => setError('No se pudo cargar el horario.'))
      .finally(() => setLoading(false));
  }, [open, employeeId]);

  if (!open) return null;

  function addTramo() { setTramos((prev) => [...prev, { diaSemana: 1, inicio: '09:00', fin: '17:00' }]); }
  function removeTramo(i: number) { setTramos((prev) => prev.filter((_, idx) => idx !== i)); }
  function patch(i: number, p: Partial<Tramo>) {
    setTramos((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...p } : t)));
  }

  async function guardar() {
    setSaving(true); setError('');
    try {
      const r = await apiFetch<{ tramos: Tramo[] }>(`/employees/${employeeId}/horario`, {
        method: 'PUT',
        body: JSON.stringify({ tramos: tramos.map((t) => ({ diaSemana: t.diaSemana, inicio: t.inicio, fin: t.fin })) }),
      });
      setTramos((r.tramos ?? []).map((t) => ({ diaSemana: t.diaSemana, inicio: t.inicio, fin: t.fin })));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el horario.');
    } finally { setSaving(false); }
  }

  const inputCls = 'rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-sm text-white';
  return (
    <Modal open={open} title={`Horario semanal${employeeName ? ' · ' + employeeName : ''}`} onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={saving || loading}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Guardar
          </Button>
        </div>
      }>
      {loading ? (
        <p className="empty-state">Cargando horario…</p>
      ) : (
        <div className="space-y-3">
          {tramos.length === 0 && <p className="empty-state">Sin tramos. Añade el primero.</p>}
          <ul className="space-y-2">
            {tramos.map((t, i) => (
              <li key={i} className="flex items-center gap-2">
                <select className={inputCls} value={t.diaSemana} aria-label="Día"
                  onChange={(e) => patch(i, { diaSemana: Number(e.target.value) })}>
                  {DIAS.map((d, idx) => <option key={idx} value={idx}>{d}</option>)}
                </select>
                <input type="time" className={inputCls} value={t.inicio} aria-label="Inicio"
                  onChange={(e) => patch(i, { inicio: e.target.value })} />
                <span className="text-[var(--panel-muted)]">–</span>
                <input type="time" className={inputCls} value={t.fin} aria-label="Fin"
                  onChange={(e) => patch(i, { fin: e.target.value })} />
                <button className="row-action danger" onClick={() => removeTramo(i)} title="Quitar tramo" aria-label="Quitar tramo">
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
          <button className="btn btn-outline btn-sm" onClick={addTramo}>
            <Plus className="h-4 w-4" /> Añadir tramo
          </button>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
