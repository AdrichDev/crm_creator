import type { Prisma } from '../generated/prisma/client.js';
import { DEFAULT_VISIT_STATES } from '../comercial/visit-states.js';

// ---------------------------------------------------------------------------
// Alta de proyecto (F8-T3 aa-operator-agent, alternativa A): ÚNICA fuente de
// verdad del create. La comparten POST /projects (front) y el endpoint de
// escritura del operador (/service/operator/proyectos) para evitar drift.
// Crea, en 1 transacción: Business + Location + BusinessSetting(config) +
// Membership(ADMIN) + VisitStates. Las deps son interfaces estrechas (patrón
// DI del repo, ver routes/service-operator.ts) que Prisma satisface
// estructuralmente y los tests sustituyen por dobles.
// ---------------------------------------------------------------------------

/** Config del onboarding tal y como la envía el front (se persiste íntegra). */
export type ProjectConfig = Record<string, unknown> & {
  business?: { name?: string; vertical?: string; clienteId?: string };
  branding?: { primary?: string; secondary?: string; logoImage?: string };
};

/** Categoría de BusinessSetting donde vive la config completa del proyecto. */
export const CONFIG_CATEGORY = 'config';

/** Negocio recién creado: lo mínimo que consume la respuesta del alta. */
export interface CreatedBusiness {
  id: string;
  createdAt: Date;
}

/** Columnas espejo de Business derivadas de la config (nombre/vertical/marca…). */
export interface BusinessMirror {
  nombre: string;
  vertical: string;
  marcaPrimario?: string;
  marcaSecundario?: string;
  logoUrl?: string;
}

/** Cliente transaccional estrecho: solo los modelos/métodos que usa el alta. */
export interface ProjectTxClient {
  business: {
    create(args: { data: { tenantId: string } & BusinessMirror }): Promise<CreatedBusiness>;
  };
  location: {
    create(args: { data: { businessId: string; nombre: string } }): Promise<unknown>;
  };
  businessSetting: {
    // datos tipado como InputJsonValue (no unknown) para que Prisma.TransactionClient
    // satisfaga la interfaz estructuralmente en el binding real.
    create(args: { data: { businessId: string; categoria: string; datos: Prisma.InputJsonValue } }): Promise<unknown>;
  };
  membership: {
    create(args: { data: { userId: string; businessId: string; role: 'ADMIN' } }): Promise<unknown>;
  };
  visitState: {
    createMany(args: {
      data: { nombre: string; color: string; icono: string; orden: number; esPendiente: boolean; businessId: string; esSistema: boolean }[];
    }): Promise<unknown>;
  };
}

/** Dependencias inyectables del alta: validación de tenant + transacción. */
export interface CreateProjectDeps {
  tenantExists(tenantId: string): Promise<boolean>;
  transaction<T>(fn: (tx: ProjectTxClient) => Promise<T>): Promise<T>;
}

/** Cliente mínimo para SQL crudo (cruce cross-schema con aa.*, no modelado en Prisma). */
export interface RawQueryDb {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}

/**
 * Comprueba que el tenant existe y está activo en aa.tenant. Va por $queryRaw
 * porque aa.* no está modelado en Prisma (multiSchema), como el resto del CRM.
 */
export async function tenantExists(db: RawQueryDb, tenantId: string): Promise<boolean> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM aa.tenant WHERE id = ${tenantId} AND activo = true LIMIT 1`;
  return rows.length > 0;
}

// Calcula las columnas espejo (nombre/vertical/marca…) a partir de la config.
export function mirrorColumns(config: ProjectConfig): BusinessMirror {
  return {
    nombre: config.business?.name ?? 'Nuevo proyecto',
    vertical: config.business?.vertical ?? 'custom',
    ...(config.branding?.primary ? { marcaPrimario: config.branding.primary } : {}),
    ...(config.branding?.secondary ? { marcaSecundario: config.branding.secondary } : {}),
    ...(config.branding?.logoImage ? { logoUrl: config.branding.logoImage } : {}),
  };
}

export interface CreateProjectInput {
  tenantId: string;
  userId: string;
  config: ProjectConfig;
}

/** Resultado tipado: el caller mapea tenant_not_found a su 422; errores de BD suben. */
export type CreateProjectResult =
  | { ok: true; business: CreatedBusiness }
  | { ok: false; error: 'tenant_not_found' };

/**
 * Crea el proyecto desde cero: Business + sede + config + membership ADMIN +
 * estados de visita base, todo dentro de UNA transacción. Valida antes que el
 * tenant exista en AA. Comportamiento idéntico al create histórico de
 * POST /projects (fijado por tests de caracterización).
 */
export async function createProjectService(
  input: CreateProjectInput,
  deps: CreateProjectDeps,
): Promise<CreateProjectResult> {
  const { tenantId, userId, config } = input;
  if (!(await deps.tenantExists(tenantId))) {
    return { ok: false, error: 'tenant_not_found' };
  }
  const mirror = mirrorColumns(config);
  const business = await deps.transaction(async (tx) => {
    const b = await tx.business.create({ data: { tenantId, ...mirror } });
    await tx.location.create({ data: { businessId: b.id, nombre: config.business?.name ?? 'Sede' } });
    await tx.businessSetting.create({ data: { businessId: b.id, categoria: CONFIG_CATEGORY, datos: config as Prisma.InputJsonValue } });
    await tx.membership.create({ data: { userId, businessId: b.id, role: 'ADMIN' } });
    // Comercial de campo: estados de visita base del negocio (idempotente por negocio nuevo).
    await tx.visitState.createMany({ data: DEFAULT_VISIT_STATES.map((s) => ({ ...s, businessId: b.id, esSistema: true })) });
    return b;
  });
  return { ok: true, business };
}
