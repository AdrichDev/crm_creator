'use client';
import { useMemo } from 'react';
import { prepareClientOptions, type ClientLite } from '@/lib/clients/picker';

/**
 * Selector de cliente como <select> nativo (mismo estilo que ModelEffortSelect):
 * flecha nativa del navegador, sin SVG superpuesto ni huecos. Al elegir, se fija
 * el cliente y se rellenan los Datos. Hereda el tema vía el scope .onboarding.
 */
export function ClientCombobox({ clients, selectedId, onPick, error }:
  { clients: ClientLite[]; selectedId?: string; onPick: (c: ClientLite) => void; error?: string }) {
  const opts = useMemo(() => prepareClientOptions(clients).ordenados, [clients]);
  const selectCls = 'mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm';

  return (
    <div>
      <label className="text-xs font-medium text-gray-500">Cliente</label>
      <select
        className={selectCls}
        value={selectedId ?? ''}
        aria-invalid={!!error}
        onChange={(e) => {
          const c = opts.find((o) => o.id === e.target.value);
          if (c) onPick(c);
        }}>
        <option value="" disabled>Selecciona el cliente</option>
        {opts.map((c) => (
          <option key={c.id} value={c.id}>{c.nombre}</option>
        ))}
      </select>
      {error && <p className="mt-2 text-xs text-amber-600">{error}</p>}
      <p className="mt-1 text-[11px] text-gray-400">{opts.length} cliente(s). Al elegir se fija el nombre y se rellenan los Datos.</p>
    </div>
  );
}
