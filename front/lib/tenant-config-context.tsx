'use client';

import {
  createContext, useContext, useEffect, useMemo, useState, useCallback, type ReactNode,
} from 'react';
import { MODULE_MAP, type ModuleId } from './config/modules';
import type { WorkerChipId } from './config/worker-chips';
import {
  type TenantConfig, DEFAULT_CONFIG, configFromVertical,
} from './config/tenant-config';
import type { VerticalId } from './config/verticals';
import type { Role } from './config/roles';
import { provisionTenant, deprovisionTenant } from './data/provision';

// Un "proyecto" = un producto generado para un cliente (su configuración).
export interface Project {
  id: string;
  config: TenantConfig;
  createdAt: string;
  generatedAt?: string;   // fecha de la última generación de paquete
}

const PROJECTS_KEY = 'saas.projects.v1';
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
  createProject: (config: TenantConfig) => string;
  openProject: (id: string) => void;
  closeProject: () => void;
  deleteProject: (id: string) => void;
  markGenerated: (id: string) => void;
  // edición del proyecto activo (API compatible con el panel)
  setConfig: (next: TenantConfig) => void;
  update: (patch: Partial<TenantConfig>) => void;
  toggleModule: (id: ModuleId, on: boolean) => void;
  toggleWorkerChip: (id: WorkerChipId, on: boolean) => void;
  applyVertical: (vertical: VerticalId, name?: string) => void;
  reset: () => void;
}

const C = createContext<Ctx | null>(null);

export function TenantConfigProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [role, setRoleState] = useState<Role>('admin');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const p = localStorage.getItem(PROJECTS_KEY);
      if (p) setProjects(JSON.parse(p) as Project[]);
      const a = localStorage.getItem(ACTIVE_KEY);
      if (a) setActiveId(a);
      const r = localStorage.getItem(ROLE_KEY);
      if (r === 'admin' || r === 'trabajador' || r === 'cliente') setRoleState(r);
    } catch { /* noop */ }
    setReady(true);
  }, []);

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

  const createProject = useCallback((cfg: TenantConfig) => {
    const id = uid();
    const proj: Project = { id, config: { ...cfg, setupComplete: true }, createdAt: new Date().toISOString() };
    setProjects((prev) => {
      const next = [proj, ...prev];
      try { localStorage.setItem(PROJECTS_KEY, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
    // Provisiona el schema del proyecto en Postgres (no bloquea la creación local).
    void provisionTenant(id, proj.config);
    return id;
  }, []);

  const openProject = useCallback((id: string) => persistActive(id), [persistActive]);
  const closeProject = useCallback(() => persistActive(null), [persistActive]);

  const deleteProject = useCallback((id: string) => {
    void deprovisionTenant(id); // elimina su schema en Postgres
    setProjects((prev) => {
      const next = prev.filter((p) => p.id !== id);
      try { localStorage.setItem(PROJECTS_KEY, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
    setActiveId((aid) => (aid === id ? null : aid));
    try { if (localStorage.getItem(ACTIVE_KEY) === id) localStorage.removeItem(ACTIVE_KEY); } catch { /* noop */ }
  }, []);

  const markGenerated = useCallback((id: string) => {
    setProjects((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, generatedAt: new Date().toISOString() } : p));
      try { localStorage.setItem(PROJECTS_KEY, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  }, []);

  const setConfig = useCallback((next: TenantConfig) => mutateActive(() => next), [mutateActive]);
  const update = useCallback((patch: Partial<TenantConfig>) => mutateActive((c) => ({ ...c, ...patch })), [mutateActive]);
  const toggleModule = useCallback((id: ModuleId, on: boolean) => {
    if (MODULE_MAP[id]?.mandatory) return;
    mutateActive((c) => ({ ...c, modules: { ...c.modules, [id]: on } }));
  }, [mutateActive]);
  const toggleWorkerChip = useCallback((id: WorkerChipId, on: boolean) => {
    mutateActive((c) => ({ ...c, workerChips: { ...c.workerChips, [id]: on } }));
  }, [mutateActive]);
  const applyVertical = useCallback((vertical: VerticalId, name?: string) => {
    mutateActive((c) => ({ ...configFromVertical(vertical, name ?? c.business.name), setupComplete: true }));
  }, [mutateActive]);
  const reset = useCallback(() => mutateActive((c) => configFromVertical(c.business.vertical, c.business.name)), [mutateActive]);

  const value = useMemo<Ctx>(() => ({
    ready, projects, activeId, hasActive: !!active, config, role, setRole,
    createProject, openProject, closeProject, deleteProject, markGenerated,
    setConfig, update, toggleModule, toggleWorkerChip, applyVertical, reset,
  }), [ready, projects, activeId, active, config, role, setRole, createProject, openProject, closeProject,
       deleteProject, markGenerated, setConfig, update, toggleModule, toggleWorkerChip, applyVertical, reset]);

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
/** Perfil activo del panel + setter. */
export function useRole(): { role: Role; setRole: (r: Role) => void } {
  const { role, setRole } = useTenantConfig();
  return { role, setRole };
}
export function useTerm(key: string, fallback: string): string {
  const { config } = useTenantConfig();
  return config.terminology[key] ?? fallback;
}
