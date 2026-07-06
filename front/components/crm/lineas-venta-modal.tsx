'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/primitives';
import { Plus, Trash2, Loader2 } from 'lucide-react';

interface Linea { id: string; concepto: string; cantidad: number; precioUnitario: number; subtotal: number; }

// Detalle de líneas de una venta (modo API): lista, añade y borra líneas contra
// /sales/:id/lineas. El back recalcula Sale.total en cada mutación; `onChanged`
// permite al padre refrescar la fila con el total actualizado.
export function LineasVentaModal({ open, saleId, onClose, onChanged }: {
  open: boolean; saleId: string; onClose: () => void; onChanged?: () => void;
}) {
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ concepto: '', cantidad: '1', precioUnitario: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !saleId) return;
    setForm({ concepto: '', cantidad: '1', precioUnitario: '' });
    setError(''); setLoading(true);
    apiFetch<{ lineas: Linea[] }>(`/sales/${saleId}/lineas`)
      .then((r) => setLineas(r.lineas ?? []))
      .catch(() => setError('No se pudieron cargar las líneas.'))
      .finally(() => setLoading(false));
  }, [open, saleId]);

  if (!open) return null;

  async function reload() {
    try {
      const r = await apiFetch<{ lineas: Linea[] }>(`/sales/${saleId}/lineas`);
      setLineas(r.lineas ?? []);
    } catch { /* mantiene la vista anterior */ }
  }

  const total = lineas.reduce((a, l) => a + Number(l.subtotal), 0);

  async function add(ev: React.FormEvent) {
    ev.preventDefault();
    const cantidad = Number(form.cantidad);
    const precioUnitario = Number(form.precioUnitario);
    if (!form.concepto.trim() || !Number.isInteger(cantidad) || cantidad < 1 || !(precioUnitario >= 0)) {
      setError('Concepto, cantidad (≥1) y precio (≥0) son obligatorios.'); return;
    }
    setSaving(true); setError('');
    try {
      await apiFetch(`/sales/${saleId}/lineas`, {
        method: 'POST',
        body: JSON.stringify({ concepto: form.concepto.trim(), cantidad, precioUnitario }),
      });
      setForm({ concepto: '', cantidad: '1', precioUnitario: '' });
      await reload();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo añadir la línea.');
    } finally { setSaving(false); }
  }

  async function remove(id: string) {
    setError('');
    try {
      await apiFetch(`/sales/${saleId}/lineas/${id}`, { method: 'DELETE' });
      await reload();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo borrar la línea.');
    }
  }

  const inputCls = 'rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-sm text-white';
  return (
    <Modal open={open} title="Líneas de la venta" onClose={onClose}
      footer={<Button variant="outline" onClick={onClose}>Cerrar</Button>}>
      {loading ? (
        <p className="empty-state">Cargando líneas…</p>
      ) : (
        <div className="space-y-4">
          {lineas.length === 0 ? (
            <p className="empty-state">Esta venta no tiene líneas.</p>
          ) : (
            <ul className="space-y-1.5">
              {lineas.map((l) => (
                <li key={l.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-white">{l.concepto}</p>
                    <p className="text-[11px] text-[var(--panel-muted)]">{l.cantidad} × {Number(l.precioUnitario).toFixed(2)} €</p>
                  </div>
                  <span className="text-sm font-medium text-white">{Number(l.subtotal).toFixed(2)} €</span>
                  <button className="row-action danger" onClick={() => remove(l.id)} title="Quitar línea" aria-label="Quitar línea">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center justify-between border-t border-white/10 pt-2 text-sm font-semibold text-white">
            <span>TOTAL</span><span>{total.toFixed(2)} €</span>
          </div>

          <form onSubmit={add} className="flex flex-wrap items-end gap-2 border-t border-white/10 pt-3">
            <input className={`${inputCls} flex-1`} placeholder="Concepto" value={form.concepto} aria-label="Concepto"
              onChange={(e) => setForm({ ...form, concepto: e.target.value })} />
            <input type="number" min={1} step={1} className={`${inputCls} w-16`} value={form.cantidad} aria-label="Cantidad"
              onChange={(e) => setForm({ ...form, cantidad: e.target.value })} />
            <input type="number" min={0} step="0.01" className={`${inputCls} w-24`} placeholder="Precio" value={form.precioUnitario} aria-label="Precio unitario"
              onChange={(e) => setForm({ ...form, precioUnitario: e.target.value })} />
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Añadir
            </Button>
          </form>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
