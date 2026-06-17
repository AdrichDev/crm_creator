'use client';
import { getSupabase, getActiveTenantId, isSupabaseEnabled } from '@/lib/supabase/client';
import { apiFetch, isApiEnabled } from '@/lib/api/client';
import { getMyBookings, mapBookingStatus } from '@/lib/api/me';

import { TABLE_MAP, toDbRow, fromDbRow } from '@/lib/supabase/tables';

export type WithId = { id: number | string };

export interface DataBackend {
  /** true si los datos vienen de un servidor remoto (hay que re-leer tras mutar). */
  remote: boolean;
  list<T extends WithId>(key: string, seed: T[]): Promise<T[]>;
  create<T extends WithId>(key: string, item: T): Promise<void>;
  update<T extends WithId>(key: string, id: T['id'], patch: Partial<T>): Promise<void>;
  remove(key: string, id: WithId['id']): Promise<void>;
}

// ---------------------------------------------------------------------------
// Backend LOCAL (actual): localStorage sembrado desde mock.
// ---------------------------------------------------------------------------
// Namespacing por proyecto activo: cada negocio tiene sus propios datos (y sus
// mocks sectoriales) en local, sin mezclarse entre proyectos.
function activeProject(): string {
  try { return localStorage.getItem('saas.active-project.v1') || 'default'; } catch { return 'default'; }
}
const storageKey = (key: string) => `saas.data.${activeProject()}.${key}.v1`;

function read<T>(key: string, seed: T[]): T[] {
  try {
    const raw = localStorage.getItem(storageKey(key));
    return raw ? (JSON.parse(raw) as T[]) : seed;
  } catch { return seed; }
}
function write<T>(key: string, items: T[]) {
  try { localStorage.setItem(storageKey(key), JSON.stringify(items)); } catch { /* noop */ }
}

const localBackend: DataBackend = {
  remote: false,
  async list(key, seed) { return read(key, seed); },
  async create(key, item) { write(key, [item, ...read(key, [] as typeof item[])]); },
  async update(key, id, patch) {
    write(key, read(key, [] as { id: typeof id }[]).map((it) => (it.id === id ? { ...it, ...patch } : it)));
  },
  async remove(key, id) {
    write(key, read(key, [] as { id: typeof id }[]).filter((it) => it.id !== id));
  },
};

// ---------------------------------------------------------------------------
// Backend SUPABASE (se activa solo cuando hay credenciales en .env).
// ---------------------------------------------------------------------------
const supabaseBackend: DataBackend = {
  remote: true,
  async list(key, seed) {
    const sb = getSupabase(); const table = TABLE_MAP[key];
    if (!sb || !table) return seed;
    const tenant = getActiveTenantId();
    let q = sb.from(table).select('*').order('created_at', { ascending: false });
    if (tenant) q = q.eq('tenant_id', tenant);
    const { data, error } = await q;
    if (error || !data) return seed;
    return data.map((r) => fromDbRow(key, r as Record<string, unknown>)) as typeof seed;
  },
  async create(key, item) {
    const sb = getSupabase(); const table = TABLE_MAP[key];
    if (!sb || !table) return;
    const row = toDbRow(key, item as Record<string, unknown>);
    row.tenant_id = getActiveTenantId();
    await sb.from(table).insert(row);
  },
  async update(key, id, patch) {
    const sb = getSupabase(); const table = TABLE_MAP[key];
    if (!sb || !table) return;
    await sb.from(table).update(toDbRow(key, patch as Record<string, unknown>)).eq('id', id);
  },
  async remove(key, id) {
    const sb = getSupabase(); const table = TABLE_MAP[key];
    if (!sb || !table) return;
    await sb.from(table).delete().eq('id', id);
  },
};


// ---------------------------------------------------------------------------
// Backend API REST (OperaOS) — se activa con NEXT_PUBLIC_API_URL.
// ---------------------------------------------------------------------------
const API_PATH: Record<string, string> = {
  clientes: '/customers',
  citas: '/bookings',
  servicios: '/services',
  empleados: '/employees',
  fichaje: '/fichajes',
  vacaciones: '/time-off',
  productos: '/products',
  ventas: '/sales',
  facturas: '/invoices',
  marketing: '/campaigns',
};

// Rol activo del panel (mismo origen que useRole → 'saas.role.v1').
function activeRole(): string | null {
  try { return typeof window !== 'undefined' ? window.localStorage.getItem('saas.role.v1') : null; } catch { return null; }
}
// Datos de staff que el rol cliente NO debe pedir (recibiría 403). Devolvemos vacío.
const CLIENT_DENY = new Set(['clientes', 'empleados', 'ventas', 'fichaje', 'vacaciones', 'marketing', 'facturas']);

const apiBackend: DataBackend = {
  remote: true,
  async list(key, seed) {
    // El cliente solo ve SUS datos (/me/*) y el catálogo (servicios/productos vía flujo normal).
    if (activeRole() === 'cliente') {
      if (CLIENT_DENY.has(key)) return [] as typeof seed;
      if (key === 'citas') {
        try {
          const rows = await getMyBookings();
          return rows.map((b) => ({
            id: b.id,
            cliente: 'Tú',
            servicio: b.service?.name ?? '',
            empleado: '',
            fecha: (b.startAt ?? '').slice(0, 10),
            hora: (b.startAt ?? '').slice(11, 16),
            estado: mapBookingStatus(b.status),
          })) as unknown as typeof seed;
        } catch { return [] as typeof seed; }
      }
      // servicios/productos (catálogo) y resto → flujo normal de abajo.
    }
    const path = API_PATH[key]; if (!path) return seed;
    try { return (await apiFetch<typeof seed>(path)) ?? seed; } catch { return seed; }
  },
  async create(key, item) {
    if (activeRole() === 'cliente') return; // el cliente no escribe datos de gestión.
    const path = API_PATH[key]; if (!path) return;
    const { id: _omit, ...data } = item as Record<string, unknown>;
    await apiFetch(path, { method: 'POST', body: JSON.stringify(data) });
  },
  async update(key, id, patch) {
    if (activeRole() === 'cliente') return;
    const path = API_PATH[key]; if (!path) return;
    await apiFetch(`${path}/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },
  async remove(key, id) {
    if (activeRole() === 'cliente') return;
    const path = API_PATH[key]; if (!path) return;
    await apiFetch(`${path}/${id}`, { method: 'DELETE' });
  },
};

/** Selecciona el backend activo según la configuración de entorno. */
export function getBackend(): DataBackend {
  if (isApiEnabled()) return apiBackend;
  if (isSupabaseEnabled()) return supabaseBackend;
  return localBackend;
}
