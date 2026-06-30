'use client';
import { useEffect, useState } from 'react';

export interface SearchInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

/**
 * Input de búsqueda con debounce de 300 ms.
 * - El valor visible se actualiza en cada keystroke (controlled interno).
 * - onChange solo se dispara 300 ms después del último keystroke.
 * - Si el padre resetea `value`, el input se sincroniza.
 */
export function SearchInput({ value, onChange, placeholder = 'Buscar...' }: SearchInputProps) {
  const [local, setLocal] = useState(value);

  // Sincroniza cuando el padre resetea el valor (p.ej. al cambiar de página).
  useEffect(() => {
    setLocal(value);
  }, [value]);

  // Debounce: lanza onChange 300 ms después del último cambio en local.
  useEffect(() => {
    const timer = setTimeout(() => {
      onChange(local);
    }, 300);
    return () => clearTimeout(timer);
    // onChange no va en deps: se usa la ref implícita del closure; el padre
    // debe memoizar onChange (useCallback) si necesita estabilidad.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local]);

  return (
    <input
      type="search"
      className="w-full max-w-xs rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm placeholder:text-[var(--panel-muted)]"
      placeholder={placeholder}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
    />
  );
}
