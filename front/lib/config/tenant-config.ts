import { MODULES, type ModuleId } from './modules';
import { emptyWorkerChips, type WorkerChipId } from './worker-chips';
import { VERTICAL_MAP, type VerticalId } from './verticals';
import { defaultDashboardWidgets, MAX_DASHBOARD_WIDGETS, type WidgetId } from './dashboard-widgets';
import type { Terminology } from './terminology';
import { normalizeSchedule, type BusinessSchedule } from './schedule';

/** Tarjeta favorita del dashboard (máx. 6). */
export interface Favorite {
  id: string;
  /** Módulo destino al que enlaza la tarjeta. */
  target: ModuleId;
  /** Título visible (por defecto, el del módulo). */
  label?: string;
  /** Opciones/atajos añadidos a la tarjeta (vía select). */
  options: string[];
}

/**
 * Design-tokens extraídos de la landing por la IA de OperaOS.
 * La landing manda: estos valores definen el look del CRM generado.
 */
export interface DesignTokens {
  palette?: { primary?: string; secondary?: string; background?: string; text?: string; accent?: string };
  typography?: { heading?: string; body?: string };
  shape?: { radius?: string; shadow?: string };
}

/** Vistas/accesos que incluye la app del negocio. Admin va siempre implícita. */
export interface BusinessViews {
  /** Vista de empleados/trabajadores (módulos de personas). */
  worker: boolean;
  /** Vista de cliente final (reservas, facturas). */
  client: boolean;
}

export const DEFAULT_VIEWS: BusinessViews = { worker: true, client: false };

export interface TenantConfig {
  business: {
    name: string;
    vertical: VerticalId;
    phone?: string;
    email?: string;
    address?: string;
    /** Id del cliente real en agents-agency (vínculo crm_project.id_cliente). */
    clienteId?: string;
  };
  modules: Record<ModuleId, boolean>;
  /** Accesos de la app: Trabajador y Cliente (Admin siempre activa). */
  views?: BusinessViews;
  /** Chips activos del dashboard del trabajador (patrón `modules`). */
  workerChips: Record<WorkerChipId, boolean>;
  /** Widgets favoritos del inicio (admin/trabajador), máx. MAX_DASHBOARD_WIDGETS. */
  dashboardWidgets: WidgetId[];
  /**
   * Emoji elegido por el negocio para cada módulo del menú. Sobrescribe el
   * emoji por defecto/por sector (lib/config/icons.ts). Ej.: clínica dental →
   * `clientes: '🦷'` en vez de la silla de ruedas por defecto del vertical.
   */
  moduleEmojis?: Partial<Record<ModuleId, string>>;
  terminology: Terminology;
  branding: {
    primary: string;
    secondary: string;
    logoText: string;
    /** Imagen de marca (data URL) para el sidebar; si existe, sustituye a las iniciales. */
    logoImage?: string;
    /** Nombre del zip de la landing importado (referencia del diseño origen). */
    designSource?: string;
    /** Tokens completos extraídos por la IA de la landing (paleta, tipografía, forma). */
    tokens?: DesignTokens;
  };
  /** Conexión a la base de datos del proyecto (manual, opcional; editable a futuro). */
  database?: {
    host?: string;
    port?: string;
    name?: string;
    user?: string;
    password?: string;
    /** URL completa de conexión, si se prefiere a los campos sueltos. */
    url?: string;
  };
  /**
   * Landing del cliente importada por ZIP (UC-2). Bloque OPCIONAL: sin él, no hay
   * landing y el CRM funciona como hoy (no regresión). La INGESTA (validación +
   * almacenamiento local, lib/landing/) está disponible; SERVIR la landing
   * públicamente queda POSPUESTO por seguridad (capa aislada CSP+sandbox + cybersec).
   * `enabled` permanece false hasta entonces.
   */
  landing?: {
    enabled: boolean;
    source: string;
    entry: string;
    assetsRef: string;
    uploadedAt: string;
    sha256?: string;
  };
  /**
   * Horario de apertura del negocio (grupos de días + tramos, ver lib/config/schedule.ts).
   * OPCIONAL y retrocompatible: configs antiguas sin este campo siguen funcionando
   * (deserialize lo tolera ausente). Al guardar el onboarding se aplana y se
   * persiste además en OpeningHour vía PUT /config/horario.
   */
  horario?: BusinessSchedule;
  /** Tarjetas favoritas del dashboard (máx. 6). */
  favorites?: Favorite[];
  /** Interruptor maestro del tenant. undefined/true = activo; false = en mantenimiento. */
  tenantEnabled?: boolean;
  setupComplete: boolean;
}

export const MAX_FAVORITES = 6;

/** Mapa de módulos todos en false salvo los obligatorios. */
export function emptyModules(): Record<ModuleId, boolean> {
  return Object.fromEntries(
    MODULES.map((m) => [m.id, !!m.mandatory]),
  ) as Record<ModuleId, boolean>;
}

/** Construye una config a partir de un vertical (preset). */
export function configFromVertical(vertical: VerticalId, name = ''): TenantConfig {
  const v = VERTICAL_MAP[vertical];
  const modules = emptyModules();
  for (const id of v.defaultModules) modules[id] = true;
  return {
    business: { name: name || v.label, vertical },
    modules,
    views: { ...DEFAULT_VIEWS },
    workerChips: emptyWorkerChips(),
    dashboardWidgets: defaultDashboardWidgets(vertical),
    terminology: { ...v.terminology },
    branding: { primary: v.branding.primary, secondary: v.branding.secondary, logoText: (name || v.label).slice(0, 2).toUpperCase() },
    setupComplete: false,
  };
}

const baseDefaultConfig = configFromVertical('peluqueria', 'OperaOS · Consola');
export const DEFAULT_CONFIG: TenantConfig = {
  ...baseDefaultConfig,
  branding: { ...baseDefaultConfig.branding, logoImage: '/favicon.svg' },
};

export const STORAGE_KEY = 'saas-negocios.config.v1';

/**
 * Config baked in at build time via NEXT_PUBLIC_TENANT_JSON env var.
 * Used by the exported standalone app to load its tenant config without localStorage.
 * null when the env var is absent (normal dev/prod CRM flow).
 */
export const BAKED_TENANT_CONFIG: TenantConfig | null =
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_TENANT_JSON
    ? (() => {
        try {
          return JSON.parse(process.env.NEXT_PUBLIC_TENANT_JSON!) as TenantConfig;
        } catch {
          return null;
        }
      })()
    : null;

export function serialize(cfg: TenantConfig): string {
  return JSON.stringify(cfg);
}

export function deserialize(raw: string | null): TenantConfig | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as TenantConfig;
    if (!parsed.business || !parsed.modules) return null;
    // Asegura que módulos/chips nuevos del catálogo existan en configs antiguas.
    const merged = { ...emptyModules(), ...parsed.modules };
    const mergedChips = { ...emptyWorkerChips(), ...parsed.workerChips };
    const mergedViews = { ...DEFAULT_VIEWS, ...parsed.views };
    const mergedWidgets = (parsed.dashboardWidgets ?? defaultDashboardWidgets(parsed.business.vertical))
      .slice(0, MAX_DASHBOARD_WIDGETS);
    // Horario retrocompatible: migra la forma antigua (mode GLOBAL, grupos sin mode)
    // a la nueva (mode por grupo) sin romper. Ausente → se deja undefined.
    const horario = parsed.horario ? normalizeSchedule(parsed.horario) : undefined;
    return { ...parsed, modules: merged, workerChips: mergedChips, views: mergedViews, dashboardWidgets: mergedWidgets, horario };
  } catch {
    return null;
  }
}
