// Catálogo de LLMs y niveles de effort del selector del CRM.
//
// model-catalog (S8): esta lista YA NO es la fuente de verdad. El catálogo real lo sirve
// agents-agency en `GET /api/models` (spec S7) y el CRM lo consume por el relé de servidor
// `front/app/api/models/route.ts` con el token de servicio. `LLM_PROVIDERS` es SOLO el
// respaldo estático que se usa cuando el relé falla (red caída, 401/500, body inválido).
// Por eso la lista se mantiene alineada a mano con AA: sin ids retirados (p. ej.
// `gpt-4.1-nano`, que OpenAI devuelve 404) y con los proveedores que AA ofrece.

export interface LlmModel {
  id: string;
  label: string;
  /** Si el modelo acepta niveles de razonamiento (`efforts` no vacío). */
  reasoning: boolean;
  /** Niveles de esfuerzo que ACEPTA el modelo, en el orden que declara el catálogo. */
  efforts: string[];
  /** Esfuerzo por defecto del modelo; `null` si el modelo no razona. */
  defaultEffort: string | null;
}

export interface LlmProvider {
  id: string;
  label: string;
  models: LlmModel[];
  supportsEffort: boolean;
}

/** Niveles de effort conocidos: id + etiqueta visible. Un id desconocido se pinta tal cual. */
export const REASONING_EFFORTS = [
  { id: 'none', label: 'Ninguno (más barato)' },
  { id: 'low', label: 'Bajo' },
  { id: 'medium', label: 'Medio' },
  { id: 'high', label: 'Alto' },
  { id: 'xhigh', label: 'Extra alto (más caro)' },
];

/** Etiqueta visible de un nivel de effort (`xhigh` → "Extra alto (más caro)"). */
export function effortLabel(id: string): string {
  return REASONING_EFFORTS.find((r) => r.id === id)?.label ?? id;
}

// Niveles que declaran los modelos razonadores de OpenAI y de Anthropic.
const OPENAI_EFFORTS = ['none', 'low', 'medium', 'high', 'xhigh'];
const ANTHROPIC_EFFORTS = ['none', 'low', 'medium', 'high'];

/**
 * Respaldo estático (S8). Se usa SOLO cuando el relé `GET /api/models` falla.
 * NanBuilders no aparece aquí a propósito: AA solo lo publica si tiene
 * `NANBUILDERS_BASE_URL` + clave (fail-soft, spec S3), y sin esa configuración sus ids no
 * enrutan a ningún sitio.
 *
 * model-catalog S4: DeepSeek tampoco aparece como proveedor propio — va de la mano de
 * NanBuilders, que sirve sus modelos como `nan/deepseek-…` cuando tiene la clave.
 */
export const LLM_PROVIDERS: LlmProvider[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    supportsEffort: true,
    models: [
      { id: 'gpt-5.6-luna', label: 'GPT-5.6 luna (fuerte)', reasoning: true, efforts: OPENAI_EFFORTS, defaultEffort: 'low' },
      { id: 'gpt-5.4', label: 'GPT-5.4 (fuerte)', reasoning: true, efforts: OPENAI_EFFORTS, defaultEffort: 'low' },
      { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini (rápido)', reasoning: true, efforts: OPENAI_EFFORTS, defaultEffort: 'low' },
      { id: 'gpt-5.4-nano', label: 'GPT-5.4 nano (ultra barato)', reasoning: true, efforts: OPENAI_EFFORTS, defaultEffort: 'low' },
    ],
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    supportsEffort: false,
    models: [
      { id: 'gemini-3-pro', label: 'Gemini 3 Pro', reasoning: false, efforts: [], defaultEffort: null },
      { id: 'gemini-3-flash', label: 'Gemini 3 Flash', reasoning: false, efforts: [], defaultEffort: null },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', reasoning: false, efforts: [], defaultEffort: null },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', reasoning: false, efforts: [], defaultEffort: null },
    ],
  },
  {
    id: 'anthropic',
    label: 'Anthropic Claude',
    supportsEffort: true,
    models: [
      { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', reasoning: true, efforts: ANTHROPIC_EFFORTS, defaultEffort: 'low' },
      { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (rápido)', reasoning: true, efforts: ANTHROPIC_EFFORTS, defaultEffort: 'low' },
    ],
  },
];

/** Proveedor del modelo según la lista de respaldo (última opción: el primero). */
export function providerOfModel(model: string): LlmProvider {
  return LLM_PROVIDERS.find((p) => p.models.some((m) => m.id === model)) ?? LLM_PROVIDERS[0];
}

/**
 * Heurística de respaldo para un modelo que no está en el catálogo cargado.
 * Con catálogo disponible manda `efforts` del propio modelo (spec S8), no este prefijo.
 */
export function modelSupportsEffort(model: string): boolean {
  return model.startsWith('gpt-5') || model.startsWith('claude');
}
