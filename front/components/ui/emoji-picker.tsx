'use client';
import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import data from '@emoji-mart/data';

/**
 * Botón emoji con paleta desplegable tipo WhatsApp (categorías, búsqueda, recientes).
 * El botón muestra el emoji actual; si no hay uno personalizado cae a `fallback`
 * (solo visual, no se almacena). Reusa el patrón overlay/z-index del proyecto:
 * overlay `fixed inset-0 z-20 backdrop-blur-[2px]`, popover `z-30`. Se abre arriba
 * si no hay espacio abajo (≤ 420px). El picker es client-only (dynamic ssr:false)
 * para evitar `document is not defined` en SSR de Next.js 15.
 */
const Picker = dynamic(() => import('@emoji-mart/react'), { ssr: false });

export function EmojiPickerButton({ value, fallback, onPick, label }:
  { value?: string; fallback: string; onPick: (emoji: string) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Al abrir: si no hay espacio abajo, abrir arriba (igual patrón que client-combobox).
  useEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setDropUp(window.innerHeight - rect.bottom < 420);
  }, [open]);

  function handleSelect(emoji: { native: string }) {
    onPick(emoji.native);
    setOpen(false);
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
      <span className="relative z-30 inline-block">
        <button
          ref={btnRef}
          type="button"
          aria-label={label ?? 'Elegir emoji'}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="grid h-9 w-12 place-items-center rounded-lg border border-gray-300 text-base transition hover:border-gray-400">
          {value && value.trim() ? value : fallback}
        </button>
        {open && (
          <div className={`absolute left-0 z-30 ${dropUp ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
            <Picker
              data={data}
              onEmojiSelect={handleSelect}
              locale="es"
              previewPosition="none"
            />
          </div>
        )}
      </span>
    </>
  );
}
