'use client';
import { useEffect } from 'react';
import { initTheme } from '@/lib/theme/crm-theme';

/** Aplica el tema (sistema/claro/oscuro) al cargar y escucha cambios del SO. */
export function CrmThemeProvider() {
  useEffect(() => initTheme(), []);
  return null;
}
