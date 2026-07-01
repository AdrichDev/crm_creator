'use client';
import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/primitives';
import { Upload } from 'lucide-react';
import { parseCsvToRows, type ImportRowInput } from '@/lib/comercial/csv';
import { importCustomers, type ImportResult } from '@/lib/comercial/api';

// Importación de clientes desde CSV con detección de duplicados (RF-03). Previsualiza filas,
// avisa de duplicados y permite forzar la creación. (XLSX se puede añadir con un parser aparte.)
export function ImportClientesModal({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: () => void }) {
  const [rows, setRows] = useState<ImportRowInput[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function reset() { setRows([]); setResult(null); setError(''); }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    reset();
    const text = await file.text();
    const parsed = parseCsvToRows(text);
    if (parsed.length === 0) { setError('No se detectaron filas válidas (¿falta la columna "nombre"?).'); return; }
    setRows(parsed);
  }

  async function doImport(force: boolean) {
    setBusy(true); setError('');
    try {
      const res = await importCustomers(rows as unknown as Record<string, unknown>[], force);
      setResult(res);
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al importar');
    } finally { setBusy(false); }
  }

  function close() { reset(); onClose(); }

  return (
    <Modal open={open} title="Importar clientes (CSV)" onClose={close}
      footer={<Button variant="outline" onClick={close}>Cerrar</Button>}>
      <div className="space-y-4 text-sm">
        <p className="text-[var(--panel-muted)]">
          Sube un CSV con cabeceras: <code>nombre</code>, <code>telefono</code>, <code>email</code>,
          <code>direccion</code>, <code>localidad</code>, <code>provincia</code>, <code>cp</code>.
        </p>
        <input type="file" accept=".csv,text/csv" onChange={onFile} className="block text-sm text-white" />
        {error && <p className="text-red-400">{error}</p>}

        {rows.length > 0 && !result && (
          <div className="space-y-2">
            <p className="text-white">{rows.length} fila(s) detectada(s).</p>
            <div className="max-h-48 overflow-auto rounded-lg border border-white/10">
              <table className="w-full text-xs">
                <thead className="text-[var(--panel-muted)]"><tr><th className="p-2 text-left">Nombre</th><th className="p-2 text-left">Teléfono</th><th className="p-2 text-left">Localidad</th></tr></thead>
                <tbody>
                  {rows.slice(0, 50).map((r, i) => (
                    <tr key={i} className="border-t border-white/5"><td className="p-2 text-white">{r.nombre}</td><td className="p-2">{r.telefono ?? ''}</td><td className="p-2">{r.localidad ?? ''}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button onClick={() => doImport(false)} disabled={busy}><Upload className="h-4 w-4" /> Importar (omitir duplicados)</Button>
          </div>
        )}

        {result && (
          <div className="space-y-2">
            <p className="text-emerald-400">{result.creados} cliente(s) creado(s) de {result.totalFilas} fila(s).</p>
            {result.duplicados.length > 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                <p className="text-amber-400">{result.duplicados.length} posible(s) duplicado(s) (por {result.duplicados.map((d) => d.motivo).filter((v, i, a) => a.indexOf(v) === i).join(', ')}).</p>
                <Button variant="outline" className="mt-2" onClick={() => doImport(true)} disabled={busy}>Crear también los duplicados</Button>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
