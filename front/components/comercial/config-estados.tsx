'use client';
import { useState } from 'react';
import { Button, IconButton } from '@/components/ui/primitives';
import { Plus, Trash2 } from 'lucide-react';
import type { VisitStateDto } from '@/lib/comercial/types';
import { createVisitState, patchVisitState, deleteVisitState } from '@/lib/comercial/api';
import { useDialog } from '@/components/ui/dialog-provider';

// CRUD de estados de visita (RF-19). Los estados de sistema no se pueden borrar (el back
// devuelve 409); sí editar color/nombre/pendiente. La leyenda del mapa refleja esto.
export function ConfigEstados({ estados, onChanged }: { estados: VisitStateDto[]; onChanged: () => void }) {
  const dialog = useDialog();
  const [nuevo, setNuevo] = useState({ nombre: '', color: '#3b82f6', esPendiente: true });
  const [busy, setBusy] = useState(false);

  async function crear() {
    if (!nuevo.nombre.trim()) return;
    setBusy(true);
    try {
      await createVisitState({ nombre: nuevo.nombre.trim(), color: nuevo.color, esPendiente: nuevo.esPendiente, orden: estados.length });
      setNuevo({ nombre: '', color: '#3b82f6', esPendiente: true });
      onChanged();
    } finally { setBusy(false); }
  }
  async function editar(s: VisitStateDto, patch: Partial<VisitStateDto>) {
    await patchVisitState(s.id, patch); onChanged();
  }
  async function borrar(s: VisitStateDto) {
    if (s.esSistema) { void dialog.alert('Los estados de sistema no se pueden eliminar.'); return; }
    const ok = await dialog.confirm({ message: `¿Eliminar el estado "${s.nombre}"?`, danger: true });
    if (ok) { await deleteVisitState(s.id); onChanged(); }
  }

  const inputCls = 'rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white';

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--panel-muted)]">
        Define los estados de visita: color e icono se usan en el mapa y en la leyenda. Marca
        &quot;pendiente&quot; los estados que deben aparecer en la vista de pendientes.
      </p>
      <ul className="space-y-2">
        {estados.map((s) => (
          <li key={s.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/20 p-2">
            <input type="color" value={s.color} onChange={(e) => editar(s, { color: e.target.value })} className="h-8 w-8 rounded cursor-pointer bg-transparent" />
            <input defaultValue={s.nombre} onBlur={(e) => e.target.value !== s.nombre && editar(s, { nombre: e.target.value })} className={`${inputCls} flex-1`} />
            <label className="flex items-center gap-1 text-xs text-[var(--panel-muted)]">
              <input type="checkbox" checked={s.esPendiente} onChange={(e) => editar(s, { esPendiente: e.target.checked })} /> Pendiente
            </label>
            {s.esSistema && <span className="text-xs text-[var(--panel-muted)]">sistema</span>}
            <IconButton danger title="Eliminar" onClick={() => borrar(s)}><Trash2 className="h-4 w-4" /></IconButton>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2 border-t border-white/10 pt-3">
        <input type="color" value={nuevo.color} onChange={(e) => setNuevo({ ...nuevo, color: e.target.value })} className="h-8 w-8 rounded cursor-pointer bg-transparent" />
        <input className={`${inputCls} flex-1`} placeholder="Nuevo estado..." value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} />
        <label className="flex items-center gap-1 text-xs text-[var(--panel-muted)]">
          <input type="checkbox" checked={nuevo.esPendiente} onChange={(e) => setNuevo({ ...nuevo, esPendiente: e.target.checked })} /> Pendiente
        </label>
        <Button onClick={crear} disabled={busy}><Plus className="h-4 w-4" /> Añadir</Button>
      </div>
    </div>
  );
}
