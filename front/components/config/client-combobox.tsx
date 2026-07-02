'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { prepareClientOptions, type ClientLite } from '@/lib/clients/picker';

/**
 * Selector de cliente tipo combobox: el desplegable sale del propio input y solo
 * se abre al enfocar/pulsar. Navegable con flechas, Intro o clic; el cliente
 * vinculado se marca con un check dentro del propio select. El input filtra la
 * lista real (agents-agency). La flecha es un botón integrado a la derecha
 * (cursor pointer, sin caja ni hueco). Hereda el tema vía el scope .onboarding.
 * El dropdown se abre ARRIBA si no hay espacio suficiente abajo (evita scroll de página).
 */
export function ClientCombobox({ clients, selectedId, onPick, error }:
  { clients: ClientLite[]; selectedId?: string; onPick: (c: ClientLite) => void; error?: string }) {
  const selected = clients.find((c) => c.id === selectedId) ?? null;
  const [query, setQuery] = useState(selected?.nombre ?? '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [dropUp, setDropUp] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Si el cliente cambia desde fuera (modo edición), refleja su nombre en el input.
  useEffect(() => { setQuery(selected?.nombre ?? ''); }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const opts = useMemo(() => prepareClientOptions(clients, query).ordenados, [clients, query]);

  // Al abrir: calcular si hay espacio abajo; si no, abrir arriba.
  useEffect(() => {
    if (!open || !inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    setDropUp(window.innerHeight - rect.bottom < 280);
  }, [open]);

  // Cerrar al pulsar fuera del combobox.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // Mantener visible la opción resaltada al navegar con flechas.
  useEffect(() => {
    if (!open || !listRef.current) return;
    (listRef.current.children[active] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  function pick(c: ClientLite) {
    onPick(c);
    setQuery(c.nombre);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      setActive((i) => Math.min(opts.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      if (open && opts[active]) { e.preventDefault(); pick(opts[active]); }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-20 backdrop-blur-[2px]"
          aria-hidden="true"
          onMouseDown={() => setOpen(false)}
        />
      )}
    <div ref={rootRef} className="relative z-30">
      <label className="text-xs font-medium text-gray-500">Cliente</label>
      <div className="relative mt-1">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); }}
          onFocus={(e) => { setOpen(true); e.currentTarget.select(); }}
          onKeyDown={onKeyDown}
          placeholder="Escribe el nombre del cliente"
          role="combobox" aria-expanded={open} aria-controls="client-listbox"
          className="w-full rounded-xl border border-gray-300 px-3 py-2 pr-9 text-sm" />
        {/* Vinculado → check (decorativo). Si no, botón flecha integrado: cursor pointer, sin caja ni hueco. */}
        {selected && !open ? (
          <Check className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--acc)]" />
        ) : (
          <button
            type="button"
            tabIndex={-1}
            aria-label={open ? 'Cerrar lista de clientes' : 'Abrir lista de clientes'}
            onMouseDown={(e) => {
              e.preventDefault();
              setOpen((o) => !o);
              inputRef.current?.focus();
            }}
            className="absolute inset-y-0 right-0 flex w-9 cursor-pointer items-center justify-center text-gray-400 transition hover:text-gray-600">
            <ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} />
          </button>
        )}

        {open && (
          <ul id="client-listbox" ref={listRef} role="listbox"
            className={`theme-scroll absolute left-0 right-0 z-30 max-h-64 overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg ${dropUp ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
            {opts.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-400">Sin clientes.</li>
            ) : opts.map((c, i) => {
              const isSel = c.id === selectedId;
              const isActive = i === active;
              return (
                <li key={c.id} role="option" aria-selected={isSel}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => { e.preventDefault(); pick(c); }}
                  className={`flex cursor-pointer items-center justify-between px-3 py-2 text-sm transition ${isActive ? 'bg-[color-mix(in_srgb,var(--acc)_14%,var(--panel-card))]' : ''} ${isSel ? 'font-medium text-gray-900' : 'text-gray-700'}`}>
                  <span>{c.nombre}</span>
                  {isSel && <span className="shrink-0 text-[10px] font-medium text-[var(--acc)]">vinculado ✓</span>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-amber-600">{error}</p>}
    </div>
    </>
  );
}
