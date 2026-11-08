// Guarda estructural de tenancy (S2): toda operación de Prisma sobre un modelo con
// negocio debe llevar el `businessId` (o el filtro por el padre, en las tablas hijas).
// Es una decisión del dueño: "validar y fallar". Un `TenantScopeError` es un fallo de
// programación (500 genérico + log), nunca una respuesta al usuario.
//
// Clasificación de los 46 modelos del esquema (derivada de `prisma/schema.prisma`, sin
// parseo en runtime: son listas explícitas, y el test de auto-comprobación obliga a
// decidir cuando aparezca un modelo nuevo):
//   - TENANT_MODELS: modelos con `businessId` obligatorio → where/data exigen negocio.
//   - NULLABLE_TENANT_MODELS: `OAuthCredential` → `businessId` puede ser `null` explícito
//     (credencial de plataforma), pero NUNCA faltar.
//   - CHILD_MODELS: tablas hijas sin `businessId` que heredan el negocio por su padre
//     obligatorio → lecturas/updates/deletes filtran por la relación y los creates exigen
//     la FK del padre (la propiedad del padre la comprueba la ruta).
//   - EXEMPT_MODELS: globales (User, PlatformSetting, CalendarToken) y la raíz Business.
//
// La única salida es `runUnscoped(motivo, fn)` (AsyncLocalStorage) para crons, rutas de
// operador, resolución de membresías y búsqueda de clave de API.
//
// Este módulo NO se cablea aquí: la instalación en el singleton vive en `src/prisma.ts`.

import { AsyncLocalStorage } from 'node:async_hooks';
import { Prisma } from './generated/prisma/client.js';

/** Fallo de programación: una consulta intentó cruzar el aislamiento entre negocios. */
export class TenantScopeError extends Error {
  /** Modelo de Prisma sobre el que se intentó la operación (para el log del servidor). */
  readonly model: string;
  /** Operación de Prisma (findMany, update…), sin argumentos ni valores. */
  readonly operation: string;

  constructor(model: string, operation: string, requirement: string) {
    super(
      `TenantScopeError: la operación ${operation} sobre ${model} no está acotada al negocio: ` +
        `${requirement}. Añade el filtro de negocio o envuelve la llamada en runUnscoped(motivo, fn).`,
    );
    this.name = 'TenantScopeError';
    this.model = model;
    this.operation = operation;
  }
}

// ----------------------------- Clasificación de modelos -----------------------------

/** Modelos con `businessId` obligatorio: el negocio viaja en la propia fila. */
export const TENANT_MODELS: readonly string[] = [
  'Booking',
  'BusinessSetting',
  'Campaign',
  'Contacto',
  'Customer',
  'CustomerNote',
  'CustomerPackage',
  'Document',
  'Employee',
  'ExportVersion',
  'Fichaje',
  'Invoice',
  'Location',
  'Membership',
  'Notification',
  'Package',
  'Pedido',
  'Product',
  'Reminder',
  'Resource',
  'Sale',
  'Service',
  'Tag',
  'Team',
  'TelegramMessage',
  'TenantApiKey',
  'TenantSecret',
  'TenantStateEvent',
  'TimeOffRequest',
  'Visit',
  'VisitState',
  'WorkdayEvent',
];

/** `businessId` opcional en la fila: `null` explícito = credencial de plataforma. */
export const NULLABLE_TENANT_MODELS: readonly string[] = ['OAuthCredential'];

/** Modelos globales (sin negocio) y la raíz `Business`. No se validan. */
export const EXEMPT_MODELS: readonly string[] = ['User', 'PlatformSetting', 'CalendarToken', 'Business'];

export interface ChildModelSpec {
  /** Relación OBLIGATORIA con el padre del que se hereda el negocio. */
  readonly relations: readonly string[];
  /** FK escalar de esa relación: obligatoria en los creates de la tabla hija. */
  readonly foreignKeys: readonly string[];
}

/**
 * Tablas hijas: sin `businessId` propio, heredan el negocio por su padre obligatorio.
 * `relations` + `foreignKeys` son la proyección del mismo vínculo (relación y su FK).
 */
export const CHILD_MODELS: Record<string, ChildModelSpec> = {
  OpeningHour: { relations: ['location'], foreignKeys: ['locationId'] },
  Holiday: { relations: ['location'], foreignKeys: ['locationId'] },
  EmployeeSchedule: { relations: ['employee'], foreignKeys: ['employeeId'] },
  BookingStatusHistory: { relations: ['booking'], foreignKeys: ['bookingId'] },
  PackageSession: { relations: ['customerPackage'], foreignKeys: ['customerPackageId'] },
  SaleLine: { relations: ['sale'], foreignKeys: ['saleId'] },
  InvoiceLine: { relations: ['invoice'], foreignKeys: ['invoiceId'] },
  PedidoLine: { relations: ['pedido'], foreignKeys: ['pedidoId'] },
  TeamMember: { relations: ['team'], foreignKeys: ['teamId'] },
};

// ----------------------------- Operaciones -----------------------------

/** Operaciones que exigen `businessId` en el `where` (o filtro por el padre, en hijas). */
export const TENANT_SCOPE_WHERE_OPS: readonly string[] = [
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
  'upsert',
];

/**
 * Operaciones que exigen el negocio en los datos (o la FK del padre, en hijas).
 * `upsert` no está aquí: su `create` se valida aparte, junto con el `where`.
 */
export const TENANT_SCOPE_DATA_OPS: readonly string[] = ['create', 'createMany', 'createManyAndReturn'];

const WHERE_OPS = new Set<string>(TENANT_SCOPE_WHERE_OPS);
const DATA_OPS = new Set<string>(TENANT_SCOPE_DATA_OPS);

export type TenantScopeArgs = Record<string, unknown>;

// ----------------------------- Salida explícita (runUnscoped) -----------------------------

interface UnscopedStore {
  reason: string;
}

const UNSCOPED = new AsyncLocalStorage<UnscopedStore>();

/** Motivo de la salida explícita activa, o `undefined` fuera de `runUnscoped`. */
export function currentUnscopedReason(): string | undefined {
  return UNSCOPED.getStore()?.reason;
}

/** ¿Estamos dentro de un `runUnscoped`? La guarda no valida en ese contexto. */
export function isUnscoped(): boolean {
  return UNSCOPED.getStore() !== undefined;
}

/**
 * Salida explícita y auditada a la guarda de tenancy: crons, rutas de operador,
 * resolución de membresías en `authenticate` y búsqueda de clave de API.
 * El motivo es obligatorio y no puede estar en blanco.
 *
 * ⚠️ Las consultas de Prisma son PEREZOSAS (`PrismaPromise`): la guarda corre al hacer
 * `then`, no al crear la promesa. Por eso el callback debe ESPERAR la consulta dentro del
 * wrap (`async () => … await prisma.x.findMany(…)`); devolver la promesa sin esperarla la
 * resuelve fuera del contexto y la guarda vuelve a morder. Ver
 * `tenant-scope-transaction.test.ts`.
 */
export function runUnscoped<T>(reason: string, fn: () => T): T {
  if (typeof reason !== 'string' || reason.trim() === '') {
    throw new Error('runUnscoped requiere un motivo no vacío: toda consulta sin negocio debe justificarse.');
  }
  return UNSCOPED.run({ reason }, fn);
}

// ----------------------------- Comprobaciones de forma -----------------------------

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Acepta `businessId` como cadena no vacía o como `{ equals: <cadena> }`.
 * Con `allowNull` (modelos de negocio opcional) también acepta `null` / `{ equals: null }`,
 * que es la forma EXPLÍCITA de decir "esta fila no pertenece a ningún negocio".
 * Cualquier otro operador (`in`, `not`, `contains`…) NO acota la consulta.
 */
function isBusinessIdFilter(value: unknown, allowNull: boolean): boolean {
  if (value === undefined) return false;
  if (value === null) return allowNull;
  if (isNonEmptyString(value)) return true;
  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    if (keys.length === 1 && keys[0] === 'equals') return isBusinessIdFilter(value.equals, allowNull);
  }
  return false;
}

/**
 * ¿El filtro lleva el negocio en su nivel superior o dentro de un `AND` de nivel superior?
 * Un `businessId` anidado en una relación o en un `OR` no acota la consulta, así que no vale.
 */
function filterCarriesBusinessId(filter: unknown, allowNull: boolean): boolean {
  if (!isPlainObject(filter)) return false;
  if (isBusinessIdFilter(filter.businessId, allowNull)) return true;
  const and = filter.AND;
  if (Array.isArray(and)) return and.some((entry) => filterCarriesBusinessId(entry, allowNull));
  if (isPlainObject(and)) return filterCarriesBusinessId(and, allowNull);
  return false;
}

/** ¿Los datos de escritura llevan el negocio? `businessId` o `business: { connect: { id } }`. */
function dataCarriesBusinessId(data: unknown, allowNull: boolean): boolean {
  if (!isPlainObject(data)) return false;
  if ('businessId' in data) return isBusinessIdFilter(data.businessId, allowNull);
  const business = data.business;
  if (!isPlainObject(business)) return false;
  const connect = business.connect;
  if (!isPlainObject(connect)) return false;
  return isNonEmptyString(connect.id);
}

/** ¿El filtro de la relación padre lleva el negocio del padre? (`{ businessId }` o `{ is: … }`) */
function relationCarriesBusinessId(value: unknown, allowNull: boolean): boolean {
  if (!isPlainObject(value)) return false;
  if (isBusinessIdFilter(value.businessId, allowNull)) return true;
  const is = value.is;
  if (isPlainObject(is)) return isBusinessIdFilter(is.businessId, allowNull);
  return false;
}

function childWhereCarriesParent(where: unknown, spec: ChildModelSpec, allowNull: boolean): boolean {
  if (!isPlainObject(where)) return false;
  if (spec.relations.some((relation) => relationCarriesBusinessId(where[relation], allowNull))) return true;
  const and = where.AND;
  if (Array.isArray(and)) return and.some((entry) => childWhereCarriesParent(entry, spec, allowNull));
  if (isPlainObject(and)) return childWhereCarriesParent(and, spec, allowNull);
  return false;
}

/** ¿El create de la tabla hija lleva el padre? Su FK escalar o `<relación>: { connect: { id } }`. */
function childDataCarriesParent(data: unknown, spec: ChildModelSpec): boolean {
  if (!isPlainObject(data)) return false;
  if (spec.foreignKeys.some((fk) => isNonEmptyString(data[fk]))) return true;
  return spec.relations.some((relation) => {
    const value = data[relation];
    if (!isPlainObject(value)) return false;
    const connect = value.connect;
    return isPlainObject(connect) && isNonEmptyString(connect.id);
  });
}

/**
 * Aplica la comprobación a `data`: un objeto, o todas las filas de un `createMany`.
 * Un array vacío no permite demostrar el negocio, así que falla.
 */
function dataRowsCarry(data: unknown, check: (row: unknown) => boolean): boolean {
  if (Array.isArray(data)) return data.length > 0 && data.every(check);
  return check(data);
}

// ----------------------------- Validador puro -----------------------------

/**
 * Nombre canónico del modelo. Prisma entrega el delegado con la inicial en minúscula en
 * `$allOperations` (`params.model === 'employee'`), mientras que la clasificación de arriba
 * usa el nombre del datamodel (`Employee`). Se normaliza aquí para que la guarda funcione
 * igual llamada desde la extensión (runtime) que desde un test (`assertTenantScoped('Employee')`).
 */
function canonicalModel(model: string): string {
  if (model === '') return model;
  return model[0]!.toUpperCase() + model.slice(1);
}

/**
 * Valida una operación de Prisma contra la guarda de tenancy. Puro: no consulta la base
 * de datos ni el contexto de `runUnscoped` (eso lo hace `guardDelegateCall`).
 * Lanza `TenantScopeError` si falta el negocio. Nunca incluye valores en el mensaje.
 */
export function assertTenantScoped(rawModel: string, operation: string, args?: unknown): void {
  const model = canonicalModel(rawModel);
  if (EXEMPT_MODELS.includes(model)) return;

  const payload: TenantScopeArgs = isPlainObject(args) ? args : {};

  if (model === 'OAuthCredential') {
    // Nullable: el `null` explícito es válido, la ausencia no.
    if (WHERE_OPS.has(operation) && !filterCarriesBusinessId(payload.where, true)) {
      throw new TenantScopeError(model, operation, 'falta businessId (o null explícito) en el where');
    }
    if (DATA_OPS.has(operation) && !dataRowsCarry(payload.data, (row) => dataCarriesBusinessId(row, true))) {
      throw new TenantScopeError(model, operation, 'falta businessId (o null explícito) en los datos');
    }
    if (operation === 'upsert' && !dataCarriesBusinessId(payload.create, true)) {
      throw new TenantScopeError(model, operation, 'falta businessId (o null explícito) en el create del upsert');
    }
    return;
  }

  const spec = CHILD_MODELS[model];
  if (spec) {
    if (WHERE_OPS.has(operation) && !childWhereCarriesParent(payload.where, spec, false)) {
      throw new TenantScopeError(
        model,
        operation,
        `el where no filtra por el negocio del padre (${spec.relations.join('|')})`,
      );
    }
    if (DATA_OPS.has(operation) && !dataRowsCarry(payload.data, (row) => childDataCarriesParent(row, spec))) {
      throw new TenantScopeError(
        model,
        operation,
        `los datos no llevan el padre (${spec.foreignKeys.join('|')} o ${spec.relations.join('|')}.connect)`,
      );
    }
    if (operation === 'upsert' && !childDataCarriesParent(payload.create, spec)) {
      throw new TenantScopeError(
        model,
        operation,
        `el create del upsert no lleva el padre (${spec.foreignKeys.join('|')})`,
      );
    }
    return;
  }

  if (!TENANT_MODELS.includes(model)) {
    // Falla cerrado: un modelo sin clasificar es una decisión pendiente (ver el test de
    // auto-comprobación sobre los modelos del cliente generado).
    throw new TenantScopeError(model, operation, 'modelo sin clasificar en la guarda de tenancy');
  }

  if (WHERE_OPS.has(operation) && !filterCarriesBusinessId(payload.where, false)) {
    throw new TenantScopeError(model, operation, 'falta businessId en el where');
  }
  if (DATA_OPS.has(operation) && !dataRowsCarry(payload.data, (row) => dataCarriesBusinessId(row, false))) {
    throw new TenantScopeError(model, operation, 'falta businessId en los datos');
  }
  if (operation === 'upsert' && !dataCarriesBusinessId(payload.create, false)) {
    throw new TenantScopeError(model, operation, 'falta businessId en el create del upsert');
  }
}

/**
 * Punto de entrada para delegados de Prisma (y para el `_fake-prisma` de los tests de
 * rutas): la misma comprobación, honrando `runUnscoped`.
 */
export function guardDelegateCall(model: string, operation: string, args?: unknown): void {
  if (isUnscoped()) return;
  assertTenantScoped(model, operation, args);
}

// ----------------------------- Extensión de Prisma -----------------------------

interface AllOperationsParams {
  model?: string;
  operation: string;
  args: unknown;
  query: (args: unknown) => Promise<unknown>;
}

/**
 * Objeto de extensión tal y como lo aceptan `$extends` / `Prisma.defineExtension` en
 * Prisma 7 (`Prisma.defineExtension(obj)` devuelve `(client) => client.$extends(obj)`, así
 * que aquí se exporta el objeto plano para poder instalarlo en el singleton).
 */
type PrismaExtensionObject = Exclude<Parameters<typeof Prisma.defineExtension>[0], Function>;

/**
 * Extensión de Prisma (`$allModels.$allOperations`) que aplica la guarda a TODA consulta
 * por modelo: si falta el negocio lanza `TenantScopeError`; dentro de `runUnscoped` deja
 * pasar. No se instala aquí: el singleton de `src/prisma.ts` la cablea en T2.
 */
export const tenantScopeExtension = {
  name: 'tenant-scope',
  query: {
    $allModels: {
      async $allOperations(params: AllOperationsParams): Promise<unknown> {
        if (params.model) guardDelegateCall(params.model, params.operation, params.args);
        return params.query(params.args);
      },
    },
  },
} as unknown as PrismaExtensionObject;
