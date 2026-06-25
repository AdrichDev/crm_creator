import { MODULES, type ModuleId } from './modules';
import { emptyWorkerChips, type WorkerChipId } from './worker-chips';
import { VERTICAL_MAP, type VerticalId } from './verticals';
import type { Terminology } from './terminology';

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
  /** Chips activos del dashboard del trabajador (patrón `modules`). */
  workerChips: Record<WorkerChipId, boolean>;
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
    workerChips: emptyWorkerChips(),
    terminology: { ...v.terminology },
    branding: { primary: v.branding.primary, secondary: v.branding.secondary, logoText: (name || v.label).slice(0, 2).toUpperCase() },
    setupComplete: false,
  };
}

export const DEFAULT_CONFIG: TenantConfig = configFromVertical('peluqueria', 'Mi Negocio');

export const STORAGE_KEY = 'saas-negocios.config.v1';

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
    return { ...parsed, modules: merged, workerChips: mergedChips };
  } catch {
    return null;
  }
}
