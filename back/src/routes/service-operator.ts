import { Router, type Request, type Response } from 'express';
import { Prisma } from '../lib/generated/prisma/client.js';
import { prisma } from '../prisma.js';
import { requireOperatorToken } from '../middleware/operator-token.js';
import { splitNombre, joinNombre } from '../lib/nombre.js';
import {
  createProjectService,
  mirrorColumns,
  tenantExists,
  type CreateProjectDeps,
  type ProjectConfig,
} from '../lib/projects/create-project-service.js';
import {
  calculateProjectCost,
  chargeTokensForProject,
  fetchTenantBalance,
} from '../lib/projects/token-charge.js';

// ---------------------------------------------------------------------------
// Router del Operator Agent (F1/F7 aa-operator-agent) — lado creador_CRM.
// Manos server-side de la plataforma CRM: SOLO LECTURA en v1. Protegido SOLO por
// el service token (x-service-token); montado FUERA de /api → no pasa por el gate
// de usuario (authenticate).
//
// F7 reenfoque: el operador razona sobre PROYECTOS (crm.negocio con tenant_id, i.e.
// negocios vinculados a un cliente real de aa.tenant), no sobre datos internos de
// cada negocio (reservas del día, clientes finales). Un proyecto está "generado"
// cuando su paquete ya se creó (generado_en no null); si no, está solo configurado.
//
// F8-T3: primera escritura del operador — POST /proyectos (alta de proyecto),
// misma lógica que el front vía createProjectService (una sola fuente de verdad).
// Disciplina de escritura del operador: confirmación en 2 pasos (confirmado=true
// o 409 PENDIENTE_CONFIRMACION) + idempotencia por (tenantId, nombre, ventana).
// Las lecturas siguen sin auditoría (solo las escrituras se auditan). Nunca se
// exponen datos sensibles de los negocios (tokens, config ajena, NIF) ni envs.
// ---------------------------------------------------------------------------

/** Forma de un negocio en el listado del operador (sin datos sensibles). */
type NegocioRow = {
  id: string;
  nombre: string;
  vertical: string;
  plan: string;
  createdAt: Date;
};

/** Fila cruda del cruce crm.negocio ⟕ aa.tenant (aliases camelCase desde el SQL). */
type ProyectoJoinRow = {
  negocioId: string;
  nombre: string;
  vertical: string;
  cliente: string | null; // aa.tenant.nombre (null si el tenant no existe)
  codigoCliente: string | null; // aa.tenant.codigo
  generadoEn: Date | null; // crm.negocio.generado_en
  createdAt: Date;
};

/** Proyecto expuesto al operador: negocio real + su cliente + flag de generación. */
type ProyectoRow = {
  negocioId: string;
  nombre: string;
  vertical: string;
  cliente: string | null;
  codigoCliente: string | null;
  generado: boolean; // generado_en no null → paquete ya creado
  createdAt: Date;
};

/**
 * Filtro de conteo sobre crm.negocio. Un "proyecto" es un negocio con tenant_id no
 * null (vinculado a un cliente real) y no borrado; "generado" añade generado_en no null.
 */
type BusinessCountWhere = {
  eliminadoEn?: null;
  tenantId?: { not: null };
  generadoEn?: { not: null };
};

/**
 * Dependencias de BD que necesitan los handlers. Interfaz estrecha para poder
 * inyectar un doble en tests (patrón DI del repo, ver middleware-auth.test.ts) sin
 * levantar una BD real. En producción se pasa el cliente Prisma, que la satisface
 * estructuralmente (business.count/findMany + $queryRaw).
 *
 * El cruce con aa.tenant va por $queryRaw: aa.* NO está modelado en Prisma (multiSchema),
 * así que las lecturas cross-schema del cliente general se hacen con SQL crudo, como el
 * resto del CRM (ver routes/tenants.ts y routes/projects.ts).
 */
export interface OperatorDb {
  business: {
    count(args: { where: BusinessCountWhere }): Promise<number>;
    findMany(args: {
      where: { eliminadoEn: null };
      select: { id: true; nombre: true; vertical: true; plan: true; createdAt: true };
      orderBy: { createdAt: 'desc' };
    }): Promise<NegocioRow[]>;
  };
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}

/* ---------- GET /estado ---------- */

/**
 * Resumen del CRM para el operador, en términos de PROYECTOS:
 *   - totalProyectos:       negocios con cliente real (tenant_id no null) y activos.
 *   - proyectosGenerados:   de esos, cuántos ya tienen el paquete generado.
 *   - clientesConProyecto:  nº de clientes distintos (aa.tenant) con al menos un proyecto.
 * Solo lectura → sin auditoría. `db` inyectable para tests.
 */
export async function estadoHandler(db: OperatorDb, _req: Request, res: Response) {
  try {
    const [totalProyectos, proyectosGenerados, clientesConProyecto] = await Promise.all([
      db.business.count({ where: { tenantId: { not: null }, eliminadoEn: null } }),
      db.business.count({ where: { tenantId: { not: null }, eliminadoEn: null, generadoEn: { not: null } } }),
      // COUNT(DISTINCT tenant_id) sobre negocios reales y activos. Raw: agregado simple.
      db
        .$queryRaw<{ n: number | bigint }[]>`
          SELECT COUNT(DISTINCT tenant_id) AS n
          FROM crm.negocio
          WHERE tenant_id IS NOT NULL AND eliminado_en IS NULL
        `
        .then((rows) => Number(rows[0]?.n ?? 0)),
    ]);
    res.json({ totalProyectos, proyectosGenerados, clientesConProyecto });
  } catch (e) {
    console.error('[service-operator] error en estado:', e);
    res.status(500).json({ error: { code: 'server_error', message: 'No se pudo cargar el estado' } });
  }
}

/* ---------- GET /proyectos ---------- */

/**
 * Lista de proyectos reales: negocios con tenant_id no null y activos, cruzados con su
 * cliente (aa.tenant) por SQL crudo (LEFT JOIN cross-schema). Devuelve el cliente y su
 * código, y un flag `generado` (paquete ya creado). Ordenado por alta descendente.
 * El filtro (tenant_id no null, no borrado) y el cruce viven en el SQL; el handler solo
 * proyecta el flag `generado` desde generado_en.
 */
export async function proyectosHandler(db: OperatorDb, _req: Request, res: Response) {
  try {
    const rows = await db.$queryRaw<ProyectoJoinRow[]>`
      SELECT n.id           AS "negocioId",
             n.nombre       AS "nombre",
             n.vertical     AS "vertical",
             t.nombre       AS "cliente",
             t.codigo       AS "codigoCliente",
             n.generado_en  AS "generadoEn",
             n.creado_en    AS "createdAt"
      FROM crm.negocio n
      LEFT JOIN aa.tenant t ON t.id = n.tenant_id
      WHERE n.tenant_id IS NOT NULL AND n.eliminado_en IS NULL
      ORDER BY n.creado_en DESC
    `;
    const proyectos: ProyectoRow[] = rows.map((r) => ({
      negocioId: r.negocioId,
      nombre: r.nombre,
      vertical: r.vertical,
      cliente: r.cliente,
      codigoCliente: r.codigoCliente,
      generado: r.generadoEn != null,
      createdAt: r.createdAt,
    }));
    res.json({ proyectos });
  } catch (e) {
    console.error('[service-operator] error listando proyectos:', e);
    res.status(500).json({ error: { code: 'server_error', message: 'No se pudieron cargar los proyectos' } });
  }
}

/* ---------- GET /negocios ---------- */

/**
 * Lista de negocios activos (eliminadoEn null) con campos no sensibles:
 * id, nombre, vertical, plan y createdAt. Ordenados por alta descendente.
 */
export async function negociosHandler(db: OperatorDb, _req: Request, res: Response) {
  try {
    const negocios = await db.business.findMany({
      where: { eliminadoEn: null },
      select: { id: true, nombre: true, vertical: true, plan: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ negocios });
  } catch (e) {
    console.error('[service-operator] error listando negocios:', e);
    res.status(500).json({ error: { code: 'server_error', message: 'No se pudieron cargar los negocios' } });
  }
}

/* ---------- POST /proyectos ---------- */

/** Ventana de idempotencia del alta: mismo tenant + mismo nombre en 5 minutos. */
const IDEMPOTENCY_WINDOW_MS = 5 * 60 * 1000;

/**
 * Dependencias del alta vía operador. Extiende las del service compartido con:
 *   - ownerUserId(): usuario CRM dueño del Membership (env OPERATOR_OWNER_USER_ID,
 *     leído por request y fail-closed: sin valor NO se crea nada).
 *   - findRecentProject(): candado de idempotencia sin tabla nueva — busca un
 *     negocio activo con el mismo (tenantId, nombre) dentro de la ventana.
 */
export interface OperatorCreateDeps extends CreateProjectDeps {
  ownerUserId(): string;
  findRecentProject(
    tenantId: string,
    nombre: string,
    since: Date,
  ): Promise<{ id: string; createdAt: Date } | null>;
  /**
   * Saldo del tenant (saldo_tokens - tokens_usados) en aa.tenant; `null` si no
   * hay fila (el 422 tenant_not_found lo emite createProjectService, no esto).
   */
  fetchBalance(tenantId: string): Promise<{ saldo: number } | null>;
  /**
   * Cobra tokens al tenant y registra el consumo en aa.uso_tokens. Best-effort:
   * NUNCA lanza (absorbe su error internamente), no revierte el proyecto.
   */
  chargeTokens(
    tenantId: string,
    cost: number,
    context: { projectId: string; modulesCount: number },
  ): Promise<void>;
}

/**
 * Alta de proyecto desde el operador (token-only). Disciplina de escritura:
 *   1. Gate de confirmación en 2 pasos: sin `confirmado === true` → 409
 *      PENDIENTE_CONFIRMACION y NO se escribe nada (convención operator MCP).
 *   2. Fail-closed del owner: sin OPERATOR_OWNER_USER_ID → 500 y no se crea.
 *   3. Idempotencia por (tenantId, nombre, ventana 5 min): doble confirmación
 *      devuelve el proyecto ya creado (200) en vez de duplicarlo.
 *   4. Crea por createProjectService: el MISMO código que POST /projects.
 * Los errores nunca filtran token/env/detalles internos.
 */
export async function crearProyectoHandler(deps: OperatorCreateDeps, req: Request, res: Response) {
  try {
    const body = (req.body ?? {}) as { tenantId?: unknown; config?: unknown; confirmado?: unknown };

    // 1) Confirmación en 2 pasos: el operador debe reenviar con confirmado=true.
    if (body.confirmado !== true) {
      return res.status(409).json({
        error: {
          code: 'PENDIENTE_CONFIRMACION',
          message: 'Alta pendiente de confirmación: reenviar con confirmado=true para crear el proyecto',
        },
      });
    }

    // 2) Owner del Membership resuelto por entorno; sin él no se crea (fail-closed).
    const ownerUserId = deps.ownerUserId();
    if (!ownerUserId) {
      return res.status(500).json({
        error: { code: 'operator_owner_unset', message: 'El operador no tiene un usuario propietario configurado' },
      });
    }

    const config = (body.config ?? {}) as ProjectConfig;
    const tenantId = typeof body.tenantId === 'string' && body.tenantId
      ? body.tenantId
      : config.business?.clienteId;
    if (!tenantId) {
      return res.status(422).json({ error: { code: 'tenant_required', message: 'Selecciona un cliente (tenant) existente' } });
    }

    // 3) Idempotencia sin tabla nueva: mismo (tenantId, nombre) activo y reciente
    //    → devolver el existente (200) en vez de crear un duplicado.
    const nombre = mirrorColumns(config).nombre;
    const since = new Date(Date.now() - IDEMPOTENCY_WINDOW_MS);
    const existing = await deps.findRecentProject(tenantId, nombre, since);
    if (existing) {
      // Duplicado en la ventana: se devuelve el existente y NO se cobra de nuevo.
      return res.status(200).json({ id: existing.id, config, createdAt: existing.createdAt.toISOString() });
    }

    // 4) Metering (aa-token-metering-crm): coste del alta + chequeo de saldo ANTES
    //    de crear. Si el tenant no tiene fila (balance null) NO cortamos aquí —
    //    dejamos que createProjectService devuelva su 422 tenant_not_found (única
    //    fuente de ese caso, no se duplica el check).
    const modules = (config as { modules?: unknown }).modules;
    const modulesCount = Array.isArray(modules) ? modules.length : 0;
    const costo = calculateProjectCost(config);
    const balance = await deps.fetchBalance(tenantId);
    if (balance !== null && balance.saldo < costo) {
      return res.status(402).json({
        error: { code: 'insufficient_tokens', message: 'Saldo de tokens insuficiente para crear el proyecto' },
      });
    }

    // 5) Mismo camino de código que el front (createProjectService valida el tenant).
    const result = await createProjectService({ tenantId, userId: ownerUserId, config }, deps);
    if (!result.ok) {
      return res.status(422).json({ error: { code: 'tenant_not_found', message: 'El cliente (tenant) no existe en agents-agency' } });
    }

    // 6) Cobro post-creación (best-effort): chargeTokens absorbe su propio error,
    //    nunca revierte el proyecto ni tumba la 201. Se espera (await) para no
    //    perder el intento si el proceso muere justo tras responder (Decisión 3).
    await deps.chargeTokens(tenantId, costo, { projectId: result.business.id, modulesCount });

    // tokensDeducted = coste calculado SIEMPRE, aunque el cobro real haya fallado
    // en silencio: el operador no ve un error de infraestructura en un proyecto
    // que SÍ se creó; el fallo (si lo hubo) vive en el log para reconciliar.
    return res.status(201).json({
      id: result.business.id,
      config,
      createdAt: result.business.createdAt.toISOString(),
      tokensDeducted: costo,
    });
  } catch (e) {
    console.error('[service-operator] error creando proyecto:', e);
    return res.status(500).json({ error: { code: 'server_error', message: 'No se pudo crear el proyecto' } });
  }
}

/* ---------- Escrituras del bot (crm-operator-bot-write-ops) ---------- */
//
// Espejo de negocio de /api/tenants, /api/customers, /api/sales, /api/invoices
// (crudRouter), pero token-only y con businessId EXPLÍCITO (query en GET, body
// en POST) en vez de sesión (req.businessId). Cada ruta valida antes de operar
// que el businessId exista y esté activo (eliminadoEn IS NULL) — mismo control
// que las rutas /api/* aplican vía membership, aquí explícito por parámetro.
// `numero` de factura es SERVER-ASSIGNED aquí (secuencial por negocio): el bot
// nunca lo envía, a diferencia del front (que sí lo pide en el formulario).

/** Tenant activo (aa.tenant), mismo shape mínimo que consume CrmClient.listTenants(). */
type TenantRow = { id: string; nombre: string };

/** Cliente (crm.cliente) expuesto al operador — sin datos de comercial de campo. */
type CustomerListRow = { id: string; nombre: string; apellido: string | null; telefono: string | null; email: string | null };

/** Factura (crm.factura) expuesta al operador. */
type InvoiceListRow = { id: string; cliente: string; numero: string; total: Prisma.Decimal | number; createdAt: Date };

/** Venta (crm.venta) expuesta al operador. */
type SaleListRow = { id: string; cliente: string | null; total: Prisma.Decimal | number; createdAt: Date };

/**
 * Dependencias de BD de las escrituras del operador. Interfaz estrecha (mismo
 * patrón DI que OperatorDb/OperatorCreateDeps) — Prisma la satisface
 * estructuralmente; los tests inyectan un doble sin BD real.
 */
export interface OperatorWriteDb {
  business: {
    findFirst(args: { where: { id: string; eliminadoEn: null } }): Promise<{ id: string } | null>;
  };
  customer: {
    findMany(args: { where: { businessId: string; eliminadoEn: null }; orderBy: { createdAt: 'desc' } }): Promise<CustomerListRow[]>;
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
  };
  invoice: {
    findMany(args: { where: { businessId: string; eliminadoEn: null }; orderBy: { createdAt: 'desc' } }): Promise<InvoiceListRow[]>;
    count(args: { where: { businessId: string; eliminadoEn: null } }): Promise<number>;
    create(args: { data: Record<string, unknown> }): Promise<{ id: string; numero: string }>;
  };
  sale: {
    findMany(args: { where: { businessId: string; eliminadoEn: null }; orderBy: { createdAt: 'desc' } }): Promise<SaleListRow[]>;
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
  };
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $transaction<T>(fn: (tx: OperatorWriteTx) => Promise<T>): Promise<T>;
}

/**
 * Vista de BD dentro de una transacción — solo lo que necesita la numeración
 * de facturas con lock (lockBusinessRow + count + create). Mismo espíritu que
 * TxClient en sale-lines.ts: interfaz estrecha, Prisma la satisface
 * estructuralmente vía `prisma.$transaction`.
 */
export interface OperatorWriteTx {
  invoice: {
    count(args: { where: { businessId: string; eliminadoEn: null } }): Promise<number>;
    create(args: { data: Record<string, unknown> }): Promise<{ id: string; numero: string }>;
  };
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}

/** true si `businessId` es un negocio existente y activo (no soft-borrado). */
async function businessActive(db: OperatorWriteDb, businessId: unknown): Promise<boolean> {
  if (typeof businessId !== 'string' || !businessId) return false;
  const row = await db.business.findFirst({ where: { id: businessId, eliminadoEn: null } });
  return row != null;
}

const BUSINESS_NOT_FOUND = { error: { code: 'business_not_found', message: 'Negocio no encontrado o inactivo' } };

/* ---------- GET /tenants ---------- */

/** Lista tenants activos (aa.tenant), mismo criterio que GET /api/tenants. */
export async function tenantsHandler(db: OperatorWriteDb, _req: Request, res: Response) {
  try {
    const rows = await db.$queryRaw<TenantRow[]>`
      SELECT id, nombre FROM aa.tenant WHERE activo = true ORDER BY nombre ASC
    `;
    res.json({ tenants: rows });
  } catch (e) {
    console.error('[service-operator] error listando tenants:', e);
    res.status(500).json({ error: { code: 'server_error', message: 'No se pudieron cargar los tenants' } });
  }
}

/* ---------- GET/POST /customers ---------- */

export async function customersListHandler(db: OperatorWriteDb, req: Request, res: Response) {
  try {
    const businessId = (req.query as Record<string, unknown>).businessId;
    if (!(await businessActive(db, businessId))) return res.status(404).json(BUSINESS_NOT_FOUND);
    const rows = await db.customer.findMany({
      where: { businessId: businessId as string, eliminadoEn: null },
      orderBy: { createdAt: 'desc' },
    });
    const customers = rows.map((c) => ({ id: c.id, nombre: joinNombre(c), telefono: c.telefono, email: c.email }));
    res.json({ customers });
  } catch (e) {
    console.error('[service-operator] error listando clientes:', e);
    res.status(500).json({ error: { code: 'server_error', message: 'No se pudieron cargar los clientes' } });
  }
}

export async function customersCreateHandler(db: OperatorWriteDb, req: Request, res: Response) {
  try {
    const body = (req.body ?? {}) as { businessId?: unknown; nombre?: unknown; telefono?: unknown; email?: unknown };
    if (!(await businessActive(db, body.businessId))) return res.status(404).json(BUSINESS_NOT_FOUND);
    if (typeof body.nombre !== 'string' || !body.nombre.trim()) {
      return res.status(422).json({ error: { code: 'invalid', message: 'Falta nombre' } });
    }
    const { nombre, apellido } = splitNombre(body.nombre);
    const row = await db.customer.create({
      data: {
        businessId: body.businessId as string,
        nombre,
        apellido,
        telefono: typeof body.telefono === 'string' ? body.telefono : null,
        email: typeof body.email === 'string' ? body.email : null,
      },
    });
    res.status(201).json({ id: row.id });
  } catch (e) {
    console.error('[service-operator] error creando cliente:', e);
    res.status(500).json({ error: { code: 'server_error', message: 'No se pudo crear el cliente' } });
  }
}

/* ---------- GET/POST /invoices ---------- */

// Serializa la numeración de facturas por negocio (lock de fila del negocio,
// mismo patrón que lockSale en sale-lines.ts, arreglado el 2026-07-02 para el
// mismo problema). Sin esto, dos POST /invoices concurrentes para el mismo
// businessId hacen count()+create() sueltos, leen el mismo count y generan
// `numero` duplicado (Invoice no tiene índice único sobre (businessId, numero)).
async function lockBusinessForInvoicing(tx: OperatorWriteTx, businessId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM crm.negocio WHERE id = ${businessId} FOR UPDATE`;
}

/** Numeración secuencial por negocio (F00001, F00002…). Nunca la envía el bot. */
async function nextInvoiceNumero(tx: OperatorWriteTx, businessId: string): Promise<string> {
  const count = await tx.invoice.count({ where: { businessId, eliminadoEn: null } });
  return `F${String(count + 1).padStart(5, '0')}`;
}

export async function invoicesListHandler(db: OperatorWriteDb, req: Request, res: Response) {
  try {
    const businessId = (req.query as Record<string, unknown>).businessId;
    if (!(await businessActive(db, businessId))) return res.status(404).json(BUSINESS_NOT_FOUND);
    const rows = await db.invoice.findMany({
      where: { businessId: businessId as string, eliminadoEn: null },
      orderBy: { createdAt: 'desc' },
    });
    const invoices = rows.map((i) => ({
      id: i.id, cliente: i.cliente, numero: i.numero, total: Number(i.total), createdAt: i.createdAt.toISOString(),
    }));
    res.json({ invoices });
  } catch (e) {
    console.error('[service-operator] error listando facturas:', e);
    res.status(500).json({ error: { code: 'server_error', message: 'No se pudieron cargar las facturas' } });
  }
}

export async function invoicesCreateHandler(db: OperatorWriteDb, req: Request, res: Response) {
  try {
    const body = (req.body ?? {}) as { businessId?: unknown; cliente?: unknown; servicio?: unknown; total?: unknown };
    if (!(await businessActive(db, body.businessId))) return res.status(404).json(BUSINESS_NOT_FOUND);
    if (typeof body.cliente !== 'string' || !body.cliente.trim()) {
      return res.status(422).json({ error: { code: 'invalid', message: 'Falta cliente' } });
    }
    const total = Number(body.total);
    if (!Number.isFinite(total) || total < 0) {
      return res.status(422).json({ error: { code: 'invalid', message: 'Total inválido' } });
    }
    const businessId = body.businessId as string;
    const fecha = new Date().toISOString().slice(0, 10);
    const row = await db.$transaction(async (tx) => {
      await lockBusinessForInvoicing(tx, businessId);
      const numero = await nextInvoiceNumero(tx, businessId);
      return tx.invoice.create({
        data: {
          businessId, numero, cliente: body.cliente,
          servicio: typeof body.servicio === 'string' ? body.servicio : null,
          total, fecha, estado: 'Pendiente',
        },
      });
    });
    res.status(201).json({ id: row.id, numero: row.numero });
  } catch (e) {
    console.error('[service-operator] error creando factura:', e);
    res.status(500).json({ error: { code: 'server_error', message: 'No se pudo crear la factura' } });
  }
}

/* ---------- GET/POST /sales ---------- */

export async function salesListHandler(db: OperatorWriteDb, req: Request, res: Response) {
  try {
    const businessId = (req.query as Record<string, unknown>).businessId;
    if (!(await businessActive(db, businessId))) return res.status(404).json(BUSINESS_NOT_FOUND);
    const rows = await db.sale.findMany({
      where: { businessId: businessId as string, eliminadoEn: null },
      orderBy: { createdAt: 'desc' },
    });
    const sales = rows.map((s) => ({ id: s.id, cliente: s.cliente, total: Number(s.total), createdAt: s.createdAt.toISOString() }));
    res.json({ sales });
  } catch (e) {
    console.error('[service-operator] error listando ventas:', e);
    res.status(500).json({ error: { code: 'server_error', message: 'No se pudieron cargar las ventas' } });
  }
}

export async function salesCreateHandler(db: OperatorWriteDb, req: Request, res: Response) {
  try {
    const body = (req.body ?? {}) as { businessId?: unknown; cliente?: unknown; total?: unknown };
    if (!(await businessActive(db, body.businessId))) return res.status(404).json(BUSINESS_NOT_FOUND);
    if (typeof body.cliente !== 'string' || !body.cliente.trim()) {
      return res.status(422).json({ error: { code: 'invalid', message: 'Falta cliente' } });
    }
    const total = Number(body.total);
    if (!Number.isFinite(total) || total < 0) {
      return res.status(422).json({ error: { code: 'invalid', message: 'Total inválido' } });
    }
    const row = await db.sale.create({ data: { businessId: body.businessId as string, cliente: body.cliente, total } });
    res.status(201).json({ id: row.id });
  } catch (e) {
    console.error('[service-operator] error creando venta:', e);
    res.status(500).json({ error: { code: 'server_error', message: 'No se pudo crear la venta' } });
  }
}

/* ---------- Router ---------- */

export const serviceOperatorRouter = Router();

// Todo el router exige el service token del operador (fail-closed).
serviceOperatorRouter.use(requireOperatorToken());

// Deps reales del alta: Prisma satisface las interfaces estrechas estructuralmente.
// El owner se lee del entorno EN CADA request (fail-closed si falta o está vacío).
const operatorCreateDeps: OperatorCreateDeps = {
  ownerUserId: () => process.env.OPERATOR_OWNER_USER_ID ?? '',
  tenantExists: (tenantId) => tenantExists(prisma, tenantId),
  transaction: (fn) => prisma.$transaction(fn),
  findRecentProject: (tenantId, nombre, since) =>
    prisma.business.findFirst({
      where: { tenantId, nombre, eliminadoEn: null, createdAt: { gte: since } },
      select: { id: true, createdAt: true },
    }),
  // Metering cross-schema: lee saldo y cobra sobre aa.* por SQL crudo en el
  // propio proceso del CRM (mismo patrón que tenantExists), ver token-charge.ts.
  fetchBalance: (tenantId) => fetchTenantBalance(prisma, tenantId),
  chargeTokens: (tenantId, cost, context) => chargeTokensForProject(prisma, tenantId, cost, context),
};

// Deps reales de las escrituras del operador: Prisma satisface OperatorWriteDb
// estructuralmente (mismos casts que ya usa customers.ts para el create genérico).
const operatorWriteDb: OperatorWriteDb = {
  business: {
    findFirst: (args) => prisma.business.findFirst({ where: args.where, select: { id: true } }),
  },
  customer: {
    findMany: (args) =>
      prisma.customer.findMany({
        where: args.where,
        orderBy: args.orderBy,
        select: { id: true, nombre: true, apellido: true, telefono: true, email: true },
      }),
    create: (args) =>
      prisma.customer.create({ data: args.data as unknown as Prisma.CustomerUncheckedCreateInput, select: { id: true } }),
  },
  invoice: {
    findMany: (args) =>
      prisma.invoice.findMany({
        where: args.where,
        orderBy: args.orderBy,
        select: { id: true, cliente: true, numero: true, total: true, createdAt: true },
      }),
    count: (args) => prisma.invoice.count({ where: args.where }),
    create: (args) =>
      prisma.invoice.create({ data: args.data as unknown as Prisma.InvoiceUncheckedCreateInput, select: { id: true, numero: true } }),
  },
  sale: {
    findMany: (args) =>
      prisma.sale.findMany({
        where: args.where,
        orderBy: args.orderBy,
        select: { id: true, cliente: true, total: true, createdAt: true },
      }),
    create: (args) =>
      prisma.sale.create({ data: args.data as unknown as Prisma.SaleUncheckedCreateInput, select: { id: true } }),
  },
  $queryRaw: (query, ...values) => prisma.$queryRaw(query, ...values),
  $transaction: (fn) =>
    prisma.$transaction((tx) =>
      fn({
        invoice: {
          count: (args) => tx.invoice.count({ where: args.where }),
          create: (args) =>
            tx.invoice.create({ data: args.data as unknown as Prisma.InvoiceUncheckedCreateInput, select: { id: true, numero: true } }),
        },
        $queryRaw: (query, ...values) => tx.$queryRaw(query, ...values),
      }),
    ),
};

serviceOperatorRouter.get('/estado', (req, res) => estadoHandler(prisma, req, res));
serviceOperatorRouter.get('/proyectos', (req, res) => proyectosHandler(prisma, req, res));
serviceOperatorRouter.get('/negocios', (req, res) => negociosHandler(prisma, req, res));
serviceOperatorRouter.post('/proyectos', (req, res) => crearProyectoHandler(operatorCreateDeps, req, res));

serviceOperatorRouter.get('/tenants', (req, res) => tenantsHandler(operatorWriteDb, req, res));
serviceOperatorRouter.get('/customers', (req, res) => customersListHandler(operatorWriteDb, req, res));
serviceOperatorRouter.post('/customers', (req, res) => customersCreateHandler(operatorWriteDb, req, res));
serviceOperatorRouter.get('/invoices', (req, res) => invoicesListHandler(operatorWriteDb, req, res));
serviceOperatorRouter.post('/invoices', (req, res) => invoicesCreateHandler(operatorWriteDb, req, res));
serviceOperatorRouter.get('/sales', (req, res) => salesListHandler(operatorWriteDb, req, res));
serviceOperatorRouter.post('/sales', (req, res) => salesCreateHandler(operatorWriteDb, req, res));
