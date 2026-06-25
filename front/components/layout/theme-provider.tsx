'use client';
import { useEffect } from 'react';
import { initTheme } from '@/lib/theme/crm-theme';

/** Aplica el tema (claro/oscuro) al cargar. El modo "system" se retiró; ya no sigue al SO en vivo. */
export function CrmThemeProvider() {
  useEffect(() => initTheme(), []);
  return null;
}
