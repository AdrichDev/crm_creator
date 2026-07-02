// Persistencia del modo de color del mapa (UI state, no dato de negocio). Clave por tenant
// (activeId del proyecto) para que dos negocios en el mismo navegador no se pisen la
// preferencia. Sigue el patrón de lib/theme/crm-theme.ts (SSR-safe: no-op sin window).
import type { ColorMode } from './marker-color';

const KEY_PREFIX = 'comercial.color-mode.v1';

function keyFor(tenantId: string): string {
  return `${KEY_PREFIX}.${tenantId}`;
}

export function loadColorMode(tenantId: string | null | undefined): ColorMode {
  if (typeof window === 'undefined' || !tenantId) return 'estado';
  const v = localStorage.getItem(keyFor(tenantId));
  return v === 'gasto' ? 'gasto' : 'estado';
}

export function saveColorMode(tenantId: string | null | undefined, mode: ColorMode): void {
  if (typeof window === 'undefined' || !tenantId) return;
  localStorage.setItem(keyFor(tenantId), mode);
}
