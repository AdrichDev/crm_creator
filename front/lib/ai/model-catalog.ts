'use client';
// model-catalog (S8): capa de datos del selector de modelos del CRM.
//
// La fuente de verdad es agents-agency (`GET /api/models`, contrato S7). El navegador NO
// habla con AA: pide al relé del propio CRM (`/api/models`, route handler server-side que
// reenvía con el token de servicio). Si el relé falla por cualquier motivo se devuelve la
// lista estática de `lib/config/models.ts` (respaldo), nunca una lista vacía.
import { LLM_PROVIDERS, type LlmModel, type LlmProvider } from '@/lib/config/models';
import { getAccessToken } from '@/lib/auth/session';

/** Endpoint del relé server-side del CRM (no el de AA). */
export const MODELS_ENDPOINT = '/api/models';

/**
 * Modelo tal como lo publica AA (contrato S7). Todos los campos salvo `id` son opcionales
 * aquí: el parseo es defensivo porque el catálogo viene de fuera del CRM.
 */
export interface CatalogModelDto {
  id: string;
  name?: string;
  provider?: string;
  reasoning?: boolean;
  efforts?: string[];
  defaultEffort?: string | null;
  /** Presente en el contrato S7, no se usa en el selector. */
  contextWindow?: number;
  /** Presente en el contrato S7 (cruzan el catálogo con `/v1/models` del proveedor). */
  verified?: boolean;
}

export interface CatalogProviderDto {
  id: string;
  name?: string;
  models?: CatalogModelDto[];
}

export interface CatalogResponseDto {
  providers: CatalogProviderDto[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/** Normaliza la lista de efforts: solo strings no vacíos, sin duplicados, orden original. */
function normalizeEfforts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const raw of value) {
    const effort = nonEmptyString(raw);
    if (effort && !out.includes(effort)) out.push(effort);
  }
  return out;
}

/** Mapea UN modelo del contrato S7 a la forma del selector. */
function toLlmModel(raw: unknown): LlmModel | null {
  if (!isObject(raw)) return null;
  const id = nonEmptyString(raw.id);
  if (!id) return null;
  const efforts = normalizeEfforts(raw.efforts);
  const declaredDefault = nonEmptyString(raw.defaultEffort);
  // Un defaultEffort que el modelo no acepta se descarta: el selector cae al primero.
  const defaultEffort = declaredDefault && efforts.includes(declaredDefault) ? declaredDefault : null;
  return {
    id,
    label: nonEmptyString(raw.name) ?? id,
    reasoning: typeof raw.reasoning === 'boolean' ? raw.reasoning && efforts.length > 0 : efforts.length > 0,
    efforts,
    defaultEffort,
  };
}

/**
 * Convierte la respuesta de AA en la lista del selector.
 * Devuelve `null` cuando el payload no tiene la forma del contrato (el caller usa el
 * respaldo estático). Un proveedor o modelo malformado se descarta sin tirar el resto.
 */
export function parseModelCatalog(raw: unknown): LlmProvider[] | null {
  if (!isObject(raw)) return null;
  const rawProviders = raw.providers;
  if (!Array.isArray(rawProviders)) return null;

  const providers: LlmProvider[] = [];
  for (const rawProvider of rawProviders) {
    if (!isObject(rawProvider)) return null;
    const id = nonEmptyString(rawProvider.id);
    if (!id) continue;
    if (!Array.isArray(rawProvider.models)) return null;

    const models: LlmModel[] = [];
    for (const rawModel of rawProvider.models) {
      const model = toLlmModel(rawModel);
      if (model) models.push(model);
    }
    if (models.length === 0) continue;

    providers.push({
      id,
      label: nonEmptyString(rawProvider.name) ?? id,
      models,
      supportsEffort: models.some((m) => m.efforts.length > 0),
    });
  }

  return providers.length > 0 ? providers : null;
}

/**
 * Pide el catálogo al relé del CRM con el Bearer del operador (el relé exige sesión de
 * operador y añade el token de servicio hacia AA). Cualquier fallo → respaldo estático.
 */
export async function fetchModelCatalog(): Promise<LlmProvider[]> {
  try {
    const token = await getAccessToken();
    const res = await fetch(MODELS_ENDPOINT, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      cache: 'no-store',
    });
    if (!res.ok) return LLM_PROVIDERS;
    const providers = parseModelCatalog(await res.json());
    return providers ?? LLM_PROVIDERS;
  } catch {
    return LLM_PROVIDERS;
  }
}

/** Modelo del catálogo cargado (o `undefined` si el id no está en la lista). */
export function findCatalogModel(providers: LlmProvider[], modelId: string): LlmModel | undefined {
  for (const provider of providers) {
    const found = provider.models.find((m) => m.id === modelId);
    if (found) return found;
  }
  return undefined;
}
