// Tema claro/oscuro del CRM. Sigue el SO (prefers-color-scheme) con override manual,
// igual que las preferencias generales de Windows.

export type CrmMode = 'system' | 'light' | 'dark';
export type ResolvedMode = 'light' | 'dark';

const KEY = 'crm-theme.mode.v1';

/** Resuelve el modo efectivo a partir de la preferencia y el SO. */
export function resolveMode(mode: CrmMode, systemPrefersDark: boolean): ResolvedMode {
  if (mode === 'light') return 'light';
  if (mode === 'dark') return 'dark';
  return systemPrefersDark ? 'dark' : 'light';
}

export function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function loadMode(): CrmMode {
  if (typeof window === 'undefined') return 'system';
  const v = localStorage.getItem(KEY);
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
}

export function applyMode(mode: CrmMode): ResolvedMode {
  const resolved = resolveMode(mode, systemPrefersDark());
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = resolved;
  return resolved;
}

export function saveMode(mode: CrmMode): ResolvedMode {
  if (typeof window !== 'undefined') localStorage.setItem(KEY, mode);
  return applyMode(mode);
}

/** Inicializa el tema y, si el modo es 'system', reacciona a cambios del SO. */
export function initTheme(): () => void {
  const mode = loadMode();
  applyMode(mode);
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => { if (loadMode() === 'system') applyMode('system'); };
  mq.addEventListener?.('change', handler);
  return () => mq.removeEventListener?.('change', handler);
}
