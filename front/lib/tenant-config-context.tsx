'use client';

import {
  createContext, useContext, useEffect, useMemo, useState, useCallback, type ReactNode,
} from 'react';
import { MODULE_MAP, type ModuleId } from './config/modules';
import type { WorkerChipId } from './config/worker-chips';
import { MAX_DASHBOARD_WIDGETS, type WidgetId } from './config/dashboard-widgets';
import {
  type TenantConfig, DEFAULT_CONFIG, configFromVertical, deserialize,
} from './config/tenant-config';
import { GENERATED_TENANT } from './config/generated-tenant';
import { VERTICAL_MAP, type VerticalId } from './config/verticals';
import type { Role } from './config/roles';
import { isApiEnabled, apiFetch } from './api/client';
import { isAuthed, onAuthStateChange, roleFromMembership, BUSINESS_KEY, type MemberRole } from './auth/session';
import { getAuthProfile } from './api/profile';
import { reconcileTenantBlock } from './tenant/blocked-state';

// Proyecto tal como lo sirve el back (/api/projects).
interface ApiProject {
  id: string;
  createdAt: string;
  config: unknown;
  business?: { nombre: string; vertical: string; marcaPrimario: string; marcaSecundario: string; logoUrl: string | null };
}

// Un "proyecto" = un producto generado para un cliente (su configuración).
export interface Project {
  id: string;
  config: TenantConfig;
  createdAt: string;
  generatedAt?: string;   // fecha de la última generación de paquete
}

const PROJECTS_KEY = 'saas.projects.v1';
const PROJECTS_BACKUP_KEY = 'saas.projects.backup.v1'; // copia tras migrar a Supabase
const MIGRATED_KEY = 'saas.projects.migrated.v1';       // flag: migración localStorage→Supabase hecha
const ACTIVE_KEY = 'saas.active-project.v1';
const ROLE_KEY = 'saas.role.v1';
const uid = () => 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

interface Ctx {
  ready: boolean;
  projects: Project[];
  activeId: string | null;
  hasActive: boolean;
  config: TenantConfig;            // config del proyecto activo (o DEFAULT si ninguno)
  // perfil activo (vista "iniciar sesión como": admin / trabajador / cliente)
  role: Role;
  setRole: (r: Role) => void;
  // gestión de proyectos
  createProject: (config: TenantConfig) => Promise<string>;
  // Persiste la config SOBRE un proyecto existente (edición del onboarding → BD).
  updateProject: (id: string, config: TenantConfig) => Promise<void>;
  openProject: (id: string) => void;
  closeProject: () => void;
  deleteProject: (id: string) => void;
  markGenerated: (id: string) => void;
  // edición del proyecto activo (API compatible con el panel)
  setConfig: (next: TenantConfig) => void;
  update: (patch: Partial<TenantConfig>) => void;
  toggleModule: (id: ModuleId, on: boolean) => void;
  setModuleEmoji: (id: ModuleId, emoji: string) => void;
  toggleWorkerChip: (id: WorkerChipId, on: boolean) => void;
  toggleDashboardWidget: (id: WidgetId, on: boolean) => void;
  applyVertical: (vertical: VerticalId, name?: string) => void;
  reset: () => void;
}

const C = createContext<Ctx | null>(null);

// Reconstruye un Project del front desde la respuesta del back. Usa la config
// guardada (BusinessSetting) si existe; si no, arma una por defecto desde el
// vertical + branding de Business (proyectos sin onboarding previo).
function projectFromApi(p: ApiProject): Project {
  let cfg = (p.config && (p.config as TenantConfig).business)
    ? deserialize(JSON.stringify(p.config))
    : null;
  if (!cfg) {
    const v: VerticalId = (p.business && VERTICAL_MAP[p.business.vertical as VerticalId])
      ? (p.business.vertical as VerticalId) : 'custom';
    cfg = configFromVertical(v, p.business?.nombre ?? 'Proyecto');
    if (p.business?.marcaPrimario) cfg.branding.primary = p.business.marcaPrimario;
    if (p.business?.marcaSecundario) cfg.branding.secondary = p.business.marcaSecundario;
    if (p.business?.logoUrl) cfg.branding.logoImage = p.business.logoUrl;
  }
  cfg.setupComplete = true;
  return { id: p.id, config: cfg, createdAt: p.createdAt };
}

export function TenantConfigProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [role, setRoleState] = useState<Role>('admin');
  const [ready, setReady] = useState(false);
  const apiMode = isApiEnabled();

  // Modo CRM (Supabase): los proyectos = Business del usuario, desde /api/projects.
  // La consola de tarjetas los pinta igual; cero localStorage de proyectos/mock.
  // EXCEPCIÓN: Si es GENERATED_TENANT, somos el frontend exportado de un solo cliente;
  // NO cargamos la lista de proyectos del back, pero SÍ usamos este effect para
  // resolver el rol (getAuthProfile) y escuchar cambios de sesión.
  useEffect(() => {
    if (!apiMode) return;
    let alive = true;
    
    async function migrateLocalProjects() {
      if (localStorage.getItem(MIGRATED_KEY)) return;
      let locals: Project[] = [];
      try { locals = JSON.parse(localStorage.getItem(PROJECTS_KEY) ?? '[]') as Project[]; } catch { locals = []; }
      for (const p of locals) {
        const tenantId = p.config?.business?.clienteId;
        if (!tenantId) continue;
        try {
          await apiFetch('/projects', { method: 'POST', body: JSON.stringify({ tenantId, config: p.config }) });
        } catch { /* omitir */ }
      }
      try {
        if (localStorage.getItem(PROJECTS_KEY)) localStorage.setItem(PROJECTS_BACKUP_KEY, localStorage.getItem(PROJECTS_KEY)!);
        localStorage.setItem(MIGRATED_KEY, new Date().toISOString());
      } catch { /* noop */ }
    }

    async function loadProjects() {
      if (!(await isAuthed())) { if (alive) setReady(true); return; }
      
      if (!GENERATED_TENANT) {
        try {
          await migrateLocalProjects();
          const rows = await apiFetch<ApiProject[]>('/projects');
          if (!alive) return;
          setProjects(rows.map(projectFromApi));
          const a = localStorage.getItem(ACTIVE_KEY);
          if (a) setActiveId(a);
        } catch { /* deja la lista como esté */ }
      }
      
      if (alive) setReady(true);
      
      try {
        const me = await getAuthProfile();
        if (alive) setRole(roleFromMembership(me.role as MemberRole | undefined));
      } catch {
        const r = localStorage.getItem(ROLE_KEY);
        if (alive && (r === 'admin' || r === 'trabajador' || r === 'cliente')) setRoleState(r);
      }
    }
    
    void loadProjects();
    
    const unsub = onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        setTimeout(() => { void loadProjects(); }, 0);
      } else if (event === 'SIGNED_OUT' && alive) {
        if (!GENERATED_TENANT) { setProjects([]); setActiveId(null); }
      }
    });
    return () => { alive = false; unsub(); };
  }, [apiMode, setRole]);

  // Modo generador (sin API) o App Exportada (GENERATED_TENANT).
  useEffect(() => {
    if (apiMode && !GENERATED_TENANT) return;
    let alive = true;
    try {
      const p = localStorage.getItem(PROJECTS_KEY);
      if (p && !GENERATED_TENANT) {
        setProjects(JSON.parse(p) as Project[]);
      } else if (GENERATED_TENANT) {
        const cfg = deserialize(JSON.stringify(GENERATED_TENANT));
        if (cfg) {
          const seeded: Project = {
            id: uid(),
            config: { ...cfg, setupComplete: true },
            createdAt: new Date().toISOString(),
          };
          setProjects([seeded]);
          setActiveId(seeded.id);
          localStorage.setItem(PROJECTS_KEY, JSON.stringify([seeded]));
          localStorage.setItem(ACTIVE_KEY, seeded.id);
        }
      }
      
      const a = localStorage.getItem(ACTIVE_KEY);
      if (a) setActiveId(a);
      
      if (!apiMode) {
        const r = localStorage.getItem(ROLE_KEY);
        if (r === 'admin' || r === 'trabajador' || r === 'cliente') setRoleState(r);
        setReady(true);
      }
    } catch { /* noop */ }
  }, [apiMode]);

  const setRole = useCallback((r: Role) => {
    setRoleState(r);
    try { localStorage.setItem(ROLE_KEY, r); } catch { /* noop */ }
  }, []);

  const persistProjects = useCallback((next: Project[]) => {
    setProjects(next);
    try { localStorage.setItem(PROJECTS_KEY, JSON.stringify(next)); } catch { /* noop */ }
  }, []);
  const persistActive = useCallback((id: string | null) => {
    setActiveId(id);
    try { if (id) localStorage.setItem(ACTIVE_KEY, id); else localStorage.removeItem(ACTIVE_KEY); } catch { /* noop */ }
  }, []);

  const active = projects.find((p) => p.id === activeId) ?? null;
  const config = active?.config ?? DEFAULT_CONFIG;

  const mutateActive = useCallback((mut: (c: TenantConfig) => TenantConfig) => {
    setActiveId((aid) => {
      if (!aid) return aid;
      setProjects((prev) => {
        const next = prev.map((p) => (p.id === aid ? { ...p, config: mut(p.config) } : p));
        try { localStorage.setItem(PROJECTS_KEY, JSON.stringify(next)); } catch { /* noop */ }
        return next;
      });
      return aid;
    });
  }, []);

  const createProject = useCallback(async (cfg: TenantConfig): Promise<string> => {
    const config = { ...cfg, setupComplete: true };
    if (apiMode) {
      // Crea Business+BusinessSetting+Membership en Supabase. El back valida que el
      // tenant (cfg.business.clienteId) existe; lanza si falta → el llamador lo gestiona.
      const created = await apiFetch<ApiProject>('/projects', {
        method: 'POST',
        body: JSON.stringify({ tenantId: cfg.business.clienteId, config }),
      });
      const proj: Project = { id: created.id, config, createdAt: created.createdAt };
      setProjects((prev) => [proj, ...prev]);
      return created.id;
    }
    const id = uid();
    const proj: Project = { id, config, createdAt: new Date().toISOString() };
    setProjects((prev) => {
      const next = [proj, ...prev];
      try { localStorage.setItem(PROJECTS_KEY, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
    return id;
  }, [apiMode]);

  // Persiste la config SOBRE un proyecto existente (modo edición del onboarding).
  // A diferencia de setConfig (copia de trabajo del panel, solo memoria), este SÍ
  // escribe en la BD (PATCH /projects/:id) de forma ESPERADA y con el id EXPLÍCITO
  // (evita el activeId obsoleto del cierre de setConfig). Actualiza el estado local
  // tras el éxito; si el PATCH falla, propaga el error para que el llamador no navegue
  // como "guardado".
  const updateProject = useCallback(async (id: string, cfg: TenantConfig): Promise<void> => {
    const config = { ...cfg, setupComplete: true };
    if (apiMode) {
      await apiFetch(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify({ config }) });
    }
    setProjects((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, config } : p));
      // Modo generador (sin API): la persistencia real es localStorage.
      if (!apiMode) { try { localStorage.setItem(PROJECTS_KEY, JSON.stringify(next)); } catch { /* noop */ } }
      return next;
    });
  }, [apiMode]);

  const openProject = useCallback((id: string) => {
    persistActive(id);
    // En modo CRM, el proyecto ES el negocio: fija el tenant activo para el scoping
    // de datos (x-business-id) de todas las llamadas al back.
    if (apiMode) { try { localStorage.setItem(BUSINESS_KEY, id); } catch { /* noop */ } }
    // Reconciliación del kill switch (crm-tenant-block-scoping): un bloqueo obsoleto
    // de OTRO negocio no debe persistir contra el negocio recién activado.
    reconcileTenantBlock(id);
  }, [persistActive, apiMode]);
  const closeProject = useCallback(() => persistActive(null), [persistActive]);

  const deleteProject = useCallback((id: string) => {
    if (apiMode) void apiFetch(`/projects/${id}`, { method: 'DELETE' }).catch(() => { /* soft delete best-effort */ });
    setProjects((prev) => {
      const next = prev.filter((p) => p.id !== id);
      if (!apiMode) { try { localStorage.setItem(PROJECTS_KEY, JSON.stringify(next)); } catch { /* noop */ } }
      return next;
    });
    setActiveId((aid) => (aid === id ? null : aid));
    try { if (localStorage.getItem(ACTIVE_KEY) === id) localStorage.removeItem(ACTIVE_KEY); } catch { /* noop */ }
  }, [apiMode]);

  const markGenerated = useCallback((id: string) => {
    setProjects((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, generatedAt: new Date().toISOString() } : p));
      try { localStorage.setItem(PROJECTS_KEY, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  }, []);

  const setConfig = useCallback((next: TenantConfig) => {
    // Copia de trabajo LOCAL del panel (/panel): NO escribe en la BD. La persistencia
    // de la config del proyecto ocurre SOLO al pulsar "Guardar cambios" en el onboarding
    // (updateProject → PATCH /projects/:id). Editar en /panel es efímero por diseño.
    mutateActive(() => next);
  }, [mutateActive]);
  const update = useCallback((patch: Partial<TenantConfig>) => mutateActive((c) => ({ ...c, ...patch })), [mutateActive]);
  const toggleModule = useCallback((id: ModuleId, on: boolean) => {
    if (MODULE_MAP[id]?.mandatory) return;
    mutateActive((c) => ({ ...c, modules: { ...c.modules, [id]: on } }));
  }, [mutateActive]);
  const setModuleEmoji = useCallback((id: ModuleId, emoji: string) => {
    mutateActive((c) => {
      const next = { ...(c.moduleEmojis ?? {}) };
      if (emoji && emoji.trim()) next[id] = emoji.trim(); else delete next[id];
      return { ...c, moduleEmojis: next };
    });
  }, [mutateActive]);
  const toggleWorkerChip = useCallback((id: WorkerChipId, on: boolean) => {
    mutateActive((c) => ({ ...c, workerChips: { ...c.workerChips, [id]: on } }));
  }, [mutateActive]);
  const toggleDashboardWidget = useCallback((id: WidgetId, on: boolean) => {
    mutateActive((c) => {
      const current = c.dashboardWidgets ?? [];
      if (on) {
        // Defensa en profundidad: el límite también se aplica aquí, no solo en la UI.
        if (current.includes(id) || current.length >= MAX_DASHBOARD_WIDGETS) return c;
        return { ...c, dashboardWidgets: [...current, id] };
      }
      return { ...c, dashboardWidgets: current.filter((w) => w !== id) };
    });
  }, [mutateActive]);
  const applyVertical = useCallback((vertical: VerticalId, name?: string) => {
    mutateActive((c) => ({ ...configFromVertical(vertical, name ?? c.business.name), setupComplete: true }));
  }, [mutateActive]);
  const reset = useCallback(() => mutateActive((c) => configFromVertical(c.business.vertical, c.business.name)), [mutateActive]);

  const value = useMemo<Ctx>(() => ({
    ready, projects, activeId, hasActive: !!active, config, role, setRole,
    createProject, updateProject, openProject, closeProject, deleteProject, markGenerated,
    setConfig, update, toggleModule, setModuleEmoji, toggleWorkerChip, toggleDashboardWidget, applyVertical, reset,
  }), [ready, projects, activeId, active, config, role, setRole, createProject, updateProject, openProject, closeProject,
       deleteProject, markGenerated, setConfig, update, toggleModule, setModuleEmoji, toggleWorkerChip, toggleDashboardWidget, applyVertical, reset]);

  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useTenantConfig(): Ctx {
  const ctx = useContext(C);
  if (!ctx) throw new Error('useTenantConfig debe usarse dentro de TenantConfigProvider');
  return ctx;
}
/** Alias semántico para la gestión de proyectos. */
export function useProjects(): Ctx { return useTenantConfig(); }

export function useModuleEnabled(id: ModuleId): boolean {
  return useTenantConfig().config.modules[id] ?? false;
}

/**
 * Branding del tenant activo, null-safe: si se usa FUERA del provider (p. ej. un
 * documento imprimible renderizado en un test aislado) cae al branding por defecto
 * en lugar de lanzar. Lee la MISMA fuente que el resto del panel (el contexto).
 */
export function useTenantBranding(): TenantConfig['branding'] {
  const ctx = useContext(C);
  return (ctx?.config ?? DEFAULT_CONFIG).branding;
}
/** Perfil activo del panel + setter. */
export function useRole(): { role: Role; setRole: (r: Role) => void } {
  const { role, setRole } = useTenantConfig();
  return { role, setRole };
}
export function useTerm(key: string, fallback: string): string {
  const { config } = useTenantConfig();
  return config.terminology[key] ?? fallback;
}
