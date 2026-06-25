// Tema del CRM: SOLO claro/oscuro. El modo "system" se retiró (no funcionaba bien y
// se alinea con agents-agency: data-theme + localStorage, sin seguir al SO en vivo).
// Migración: una preferencia 'system' legada (o ausente) se resuelve UNA vez según el
// SO al cargar y se persiste — respeta lo que el usuario veía, sin sorpresa visual.

export type CrmMode = 'light' | 'dark';

const KEY = 'crm-theme.mode.v1';

export function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Resuelve el modo efectivo. Firma `(mode, systemDark)` conservada por compat:
 * un valor 'system' legado se resuelve según el SO; 'light'/'dark' se respetan.
 */
export function resolveMode(mode: CrmMode | 'system', systemDark: boolean): CrmMode {
  if (mode === 'light') return 'light';
  if (mode === 'dark') return 'dark';
  return systemDark ? 'dark' : 'light';
}

export function loadMode(): CrmMode {
  if (typeof window === 'undefined') return 'dark';
  const v = localStorage.getItem(KEY);
  if (v === 'light' || v === 'dark') return v;
  // 'system' legado o sin preferencia: resolver una vez según el SO y persistir.
  const resolved: CrmMode = systemPrefersDark() ? 'dark' : 'light';
  localStorage.setItem(KEY, resolved);
  return resolved;
}

export function applyMode(mode: CrmMode): CrmMode {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = mode;
  return mode;
}

export function saveMode(mode: CrmMode): CrmMode {
  if (typeof window !== 'undefined') localStorage.setItem(KEY, mode);
  return applyMode(mode);
}

/** Inicializa el tema al cargar. Ya NO sigue cambios del SO (modo system retirado). */
export function initTheme(): void {
  applyMode(loadMode());
}
