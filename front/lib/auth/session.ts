'use client';
// Session management via Supabase Auth SDK.
// login  → supabase.auth.signInWithPassword
// logout → supabase.auth.signOut
// token  → supabase.auth.getSession().data.session.access_token
// saas.token (localStorage JWT) REMOVED — Supabase manages the session cookie/storage.
// saas.business.id (localStorage) KEPT — active tenant selection.
import { getAuthClient } from '@/lib/supabase/auth-client';
import type { Role } from '@/lib/config/roles';

export const BUSINESS_KEY = 'saas.business.id';

export type MemberRole =
  | 'OWNER' | 'ADMIN' | 'MANAGER' | 'EMPLOYEE' | 'RECEPTIONIST' | 'PROFESSIONAL' | 'ACCOUNTANT' | 'CLIENT';

/** Maps a membership role to the UI role profile. */
export function roleFromMembership(role?: MemberRole): Role {
  if (role === 'OWNER' || role === 'ADMIN') return 'admin';
  if (role === 'CLIENT') return 'cliente';
  return 'trabajador';
}

export interface SessionUser {
  id: string;
  email: string;
}

/**
 * Login via Supabase Auth signInWithPassword.
 * Role and active business are resolved from the AUTHORITATIVE source — the
 * backend `GET /auth/me` (which reads crm.Membership) — NOT from JWT user_metadata
 * (which is never populated: the design keeps tenancy in the DB, not in JWT claims).
 * Stores the resolved active businessId in localStorage (saas.business.id).
 */
export async function login(email: string, password: string): Promise<Role> {
  const supabase = getAuthClient();
  if (!supabase) throw new Error('Supabase no configurado');

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);

  const session = data.session;
  if (!session) throw new Error('No se obtuvo sesión');

  // Resolve role + active business from the backend (source of truth = Membership).
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (base) {
    const stored = (() => { try { return localStorage.getItem(BUSINESS_KEY); } catch { return null; } })();
    const headers: Record<string, string> = { Authorization: `Bearer ${session.access_token}` };
    if (stored) headers['x-business-id'] = stored;
    try {
      const res = await fetch(`${base}/api/auth/me`, { headers });
      if (res.ok) {
        const me = (await res.json()) as { activeBusinessId?: string | null; role?: MemberRole | null };
        if (me.activeBusinessId) {
          try { localStorage.setItem(BUSINESS_KEY, me.activeBusinessId); } catch { /* noop */ }
        }
        return roleFromMembership(me.role ?? undefined);
      }
    } catch { /* network issue → fall through to default below */ }
  }
  // Backend unavailable: session is valid but role unresolved. Default to the
  // least-privileged worker profile; the dashboard re-resolves via /me on load.
  return roleFromMembership(undefined);
}

/** Sign out via Supabase Auth. Clears local business selection. */
export async function logout(): Promise<void> {
  const supabase = getAuthClient();
  if (supabase) {
    await supabase.auth.signOut().catch(() => { /* best-effort */ });
  }
  try { localStorage.removeItem(BUSINESS_KEY); } catch { /* noop */ }
}

/**
 * Returns true if an active Supabase session exists.
 * Uses getSession() which reads from local storage — no network call.
 */
export async function isAuthed(): Promise<boolean> {
  const supabase = getAuthClient();
  if (!supabase) return false;
  const { data } = await supabase.auth.getSession();
  return !!data.session;
}

/**
 * Returns the current session's access_token, or null if not authenticated.
 * This token is used as the Bearer in all CRM back API calls.
 */
export async function getAccessToken(): Promise<string | null> {
  const supabase = getAuthClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * Returns the current authenticated user (id + email), or null.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const supabase = getAuthClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return null;
  const u = data.session.user;
  return { id: u.id, email: u.email ?? '' };
}

/**
 * Subscribe to auth state changes. Returns the unsubscribe function.
 * Use in client components to react to login/logout events.
 */
export function onAuthStateChange(
  callback: (event: string, session: { access_token: string; user: { id: string; email?: string } } | null) => void,
): () => void {
  const supabase = getAuthClient();
  if (!supabase) return () => {};
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
  return () => subscription.unsubscribe();
}

/** Active business id from localStorage (unchanged from prior implementation). */
export function getActiveBusinessId(): string | null {
  const env = process.env.NEXT_PUBLIC_BUSINESS_ID || null;
  if (typeof window === 'undefined') return env;
  return window.localStorage.getItem(BUSINESS_KEY) || env;
}
