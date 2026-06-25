'use client';
import { apiFetch, isApiEnabled } from '@/lib/api/client';
import { getMyBookings } from '@/lib/api/me';

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
  // NUNCA cae al mock (`seed`): los datos son SIEMPRE de Supabase vía back. Vacío
  // o error → lista vacía, así no aparecen filas fantasma del mock.
  async list(key, _seed) {
    const empty = [] as typeof _seed;
    // El cliente solo ve SUS datos (/me/*) y el catálogo (servicios/productos vía flujo normal).
    if (activeRole() === 'cliente') {
      if (CLIENT_DENY.has(key)) return empty;
      if (key === 'citas') {
        try {
          const rows = await getMyBookings();
          return rows.map((b) => ({
            id: b.id,
            cliente: 'Tú',
            servicio: b.servicio,
            empleado: b.empleado,
            fecha: b.fecha,
            hora: b.hora,
            estado: b.estado,
          })) as unknown as typeof _seed;
        } catch { return empty; }
      }
      // servicios/productos (catálogo) y resto → flujo normal de abajo.
    }
    const path = API_PATH[key]; if (!path) return empty;
    try { return (await apiFetch<typeof _seed>(path)) ?? empty; } catch { return empty; }
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

/** Selecciona el backend activo. FUENTE ÚNICA: con NEXT_PUBLIC_API_URL → REST (Supabase
 * vía back). Sin él (repo generador en demo) → localStorage mock. Se eliminó el acceso
 * directo a Supabase del front (saltaba el back/REST y usaba tablas/mapeos antiguos). */
export function getBackend(): DataBackend {
  if (isApiEnabled()) return apiBackend;
  return localBackend;
}
