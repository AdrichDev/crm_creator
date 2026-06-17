// Autenticación DEMO local (sin backend). Pantalla de login simple para los CRM
// generados que aún no tienen landing. En cuanto el negocio importa una landing
// (config.branding.designSource), el gate de login desaparece (ver AppShell) y
// manda la landing.
import type { Role } from '@/lib/config/roles';

const AUTH_KEY = 'saas.auth.v1';
export const DEMO_PASSWORD = '1234';

// Email demo -> rol con el que entra al panel. Espejo de DEMO_USERS (roles.ts).
export const DEMO_EMAIL_ROLE: Record<string, Role> = {
  'admin@negocio.com': 'admin',
  'sara@negocio.com': 'trabajador',
  'lucia@mail.com': 'cliente',
};

/** Valida credenciales demo. Devuelve el rol si son correctas, o null. */
export function demoLogin(email: string, password: string): Role | null {
  const role = DEMO_EMAIL_ROLE[email.trim().toLowerCase()];
  return role && password === DEMO_PASSWORD ? role : null;
}

export function setAuthed(email: string): void {
  try { localStorage.setItem(AUTH_KEY, JSON.stringify({ email, at: Date.now() })); } catch { /* noop */ }
}
export function isAuthed(): boolean {
  try { return !!localStorage.getItem(AUTH_KEY); } catch { return false; }
}
export function logout(): void {
  try { localStorage.removeItem(AUTH_KEY); } catch { /* noop */ }
}
