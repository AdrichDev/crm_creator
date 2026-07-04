import type { ProjectConfig } from './create-project-service.js';

// ---------------------------------------------------------------------------
// Metering de tokens del CRM → AA (aa-token-metering-crm).
//
// Cobro cross-schema desde el proceso de creador_CRM: el alta de proyecto
// consume tokens del tenant (aa.tenant) y deja un registro auditable en
// aa.uso_tokens. No hay workspace compartido con agents-agency (cada uno con su
// Prisma client), así que el cobro va por SQL crudo cross-schema dentro del
// propio proceso del CRM, igual que tenantExists() en create-project-service.ts
// (ver design.md, Decisión 4). agents-agency es el dueño del schema `aa` y
// aplica la migración de columnas; aquí solo leemos/escribimos.
// ---------------------------------------------------------------------------

/** Tokens fijos por proyecto nuevo. */
const TOKENS_BASE = 100;
/** Tokens por cada módulo seleccionado en la config. */
const TOKENS_PER_MODULE = 50;

/**
 * Códigos de error transitorios de Prisma/Postgres que justifican reintentar la
 * operación completa (conexión inestable, pool agotado), NO errores de negocio
 * ni violaciones de constraint. Ver design.md, Decisión 1.
 *   P1001 — no se pudo alcanzar el servidor de BD.
 *   P1017 — el servidor cerró la conexión.
 *   P2024 — timeout obteniendo conexión del pool.
 */
const TRANSIENT_PRISMA_CODES = new Set(['P1001', 'P1017', 'P2024']);

/** Coste del alta de proyecto: base fija + tokens por módulo. Función pura. */
export function calculateProjectCost(config: ProjectConfig): number {
  const modules = (config as { modules?: unknown }).modules;
  const modulesCount = Array.isArray(modules) ? modules.length : 0;
  return TOKENS_BASE + modulesCount * TOKENS_PER_MODULE;
}

/** Un error es transitorio si su `code` está en la lista de códigos de conexión. */
function isTransientError(e: unknown): boolean {
  const code = (e as { code?: unknown } | null)?.code;
  return typeof code === 'string' && TRANSIENT_PRISMA_CODES.has(code);
}

/**
 * Ejecuta `fn` reintentando SOLO sobre errores transitorios de conexión
 * (TRANSIENT_PRISMA_CODES), hasta `maxAttempts`. Misma forma que withCodeRetry
 * (agents-agency/back/src/lib/codes.ts) pero con otra condición de reintento:
 * un error no transitorio (incl. lógica de negocio) se propaga de inmediato.
 */
export async function withTransientRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (!isTransientError(e)) throw e;
      // Error transitorio de conexión → reintentar la operación completa.
    }
  }
  throw lastError;
}

/** Cliente mínimo para leer el saldo del tenant (SQL crudo cross-schema). */
export interface BalanceQueryDb {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}

/** Cliente transaccional mínimo del cobro: solo `$executeRaw`. */
export interface TokenChargeTx {
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number>;
}

/** Cliente mínimo del cobro: abre la transacción que envuelve update + insert. */
export interface TokenChargeDb {
  $transaction<T>(fn: (tx: TokenChargeTx) => Promise<T>): Promise<T>;
}

/**
 * Saldo actual del tenant (saldo_tokens - tokens_usados). Devuelve `null` si no
 * hay fila para ese tenant: NO es un error propio: createProjectService/
 * tenantExists es la única fuente del caso `tenant_not_found`, no lo duplicamos
 * aquí con otro código (ver design.md / tasks.md T2.3).
 */
export async function fetchTenantBalance(
  db: BalanceQueryDb,
  tenantId: string,
): Promise<{ saldo: number } | null> {
  const rows = await db.$queryRaw<{ saldo: number | bigint }[]>`
    SELECT (saldo_tokens - tokens_usados) AS saldo
    FROM aa.tenant
    WHERE id = ${tenantId} AND activo = true
    LIMIT 1`;
  if (!rows || rows.length === 0) return null;
  return { saldo: Number(rows[0].saldo) };
}

/** Contexto auditable que se guarda junto al consumo (aa.uso_tokens.contexto). */
export interface TokenChargeContext {
  projectId: string;
  modulesCount: number;
}

/**
 * Cobra `cost` tokens al tenant y registra el consumo, de forma atómica:
 *   UPDATE aa.tenant SET tokens_usados = tokens_usados + cost  (incremento
 *   aritmético atómico por fila, sin SELECT ... FOR UPDATE, Decisión 5)
 *   + INSERT INTO aa.uso_tokens (operacion='crm_generate', tokens, contexto).
 * Toda la transacción va envuelta en withTransientRetry (reintenta solo fallos
 * de conexión). BEST-EFFORT: si se agotan los reintentos o hay un error
 * inesperado, NO lanza al caller (el proyecto ya se creó y no debe revertirse,
 * Decisión 3): captura, loguea una vez y retorna. NUNCA loguea el éxito.
 */
export async function chargeTokensForProject(
  db: TokenChargeDb,
  tenantId: string,
  cost: number,
  context: TokenChargeContext,
): Promise<void> {
  try {
    await withTransientRetry(() =>
      db.$transaction(async (tx) => {
        await tx.$executeRaw`
          UPDATE aa.tenant
          SET tokens_usados = tokens_usados + ${cost}
          WHERE id = ${tenantId}`;
        await tx.$executeRaw`
          INSERT INTO aa.uso_tokens (id, tenant_id, operacion, tokens, contexto, creado_en)
          VALUES (gen_random_uuid()::text, ${tenantId}, 'crm_generate', ${cost}, ${JSON.stringify(context)}::jsonb, now())`;
      }),
    );
  } catch (error) {
    // Fallo total tras agotar reintentos (o error no transitorio inesperado):
    // se loguea para reconciliación manual futura y se continúa. El alta de
    // proyecto NO se revierte (Decisión 3). Único punto de log de esta feature.
    console.error('[service-operator] fallo deduccion tokens:', {
      tenantId,
      businessId: context.projectId,
      costo: cost,
      error,
    });
  }
}
