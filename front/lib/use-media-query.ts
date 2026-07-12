'use client';
import { useEffect, useState } from 'react';

/**
 * Hook de breakpoint (SSR-safe: arranca en `false` para no desincronizar la hidratación).
 * `useIsMobile()` → true cuando el viewport es < `maxWidth` (768 por defecto = breakpoint md).
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, [query]);
  return matches;
}

export function useIsMobile(maxWidth = 768): boolean {
  return useMediaQuery(`(max-width: ${maxWidth - 1}px)`);
}
