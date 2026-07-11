import { Router, type Request, type Response } from 'express';

// ---------------------------------------------------------------------------
// crm-tenant-lifecycle-gate (WU6) — purga de datos de un negocio. Acción
// AISLADA, explícita e IRREVERSIBLE (hard-delete real), deliberadamente
// DESACOPLADA del kill switch (design §7):
//   - NO lee ni cambia `lifecycle`: no exige TERMINATED ni transiciona nada.
//   - NINGÚN cambio de lifecycle invoca este endpoint (invariante verificado
//     en purge.guard.test.ts): la interfaz LifecycleOperatorDb no tiene
//     métodos de borrado y este router solo registra POST .../purge.
//   - Guard fuerte de doble confirmación: el payload debe repetir el id (o el
//     nombre EXACTO) del negocio en `echo` + `confirm: true`. Sin ambos, o si
//     el echo no coincide → 400 y NO se borra nada.
//   - Auditado aparte (log de operador, no TenantStateEvent: el histórico de
//     estados muere con el negocio; un evento en esa tabla no sobreviviría).
//
// CASCADA (por qué NO basta prisma.business.delete): aunque las 32 FKs
// directas a `negocio` son ON DELETE CASCADE, existen 3 FKs hijo→padre con
// ON DELETE RESTRICT dentro del propio negocio (verificado en migrations/
// 20260616071953_crm_negocios/migration.sql):
//   reserva.sucursal_id → sucursal, reserva.servicio_id → servicio,
//   paquete_cliente.paquete_id → paquete.
// Postgres comprueba RESTRICT por fila DURANTE la cascada y el orden entre
// ramas de cascada no está garantizado → un delete único puede fallar según
// el orden interno. Por eso se borra explícitamente hijos→padres en UNA
// transacción. Las join tables implícitas M-N (_EmpServices, _ResServices,
// _ResEmployees, _BookingResources, _CustomerTags, _PackageServices) son
// CASCADE en ambos lados → se limpian solas al borrar cualquiera de los lados.
//
// NO se borra (fuera del negocio, decisión consciente):
//   - crm.usuario / crm.token_calendario / AuthToken: nivel usuario/auth, un
//     usuario puede pertenecer a otros negocios vía Membership.
//   - aa.* (tenant, uso_tokens…): pertenecen al CLIENTE general, no al negocio.
// ---------------------------------------------------------------------------

type DeleteCount = { count: number };
type ByBusiness = { businessId: string };

/**
 * Vista de BD dentro de la transacción de purga. Interfaz DI ESTRECHA y
 * EXCLUSIVA de este endpoint: es la única del carril de operador que expone
 * borrados. La separación con LifecycleOperatorDb (sin deletes) mantiene el
 * invariante "lifecycle jamás borra" a nivel estructural, no solo por test.
 * Prisma (TransactionClient) la satisface estructuralmente.
 */
export interface PurgeTx {
  // --- Nietos sin negocio_id propio: se alcanzan vía la relación con su padre ---
  packageSession: { deleteMany(args: { where: { customerPackage: ByBusiness } }): Promise<DeleteCount> };
  bookingStatusHistory: { deleteMany(args: { where: { booking: ByBusiness } }): Promise<DeleteCount> };
  saleLine: { deleteMany(args: { where: { sale: ByBusiness } }): Promise<DeleteCount> };
  invoiceLine: { deleteMany(args: { where: { invoice: ByBusiness } }): Promise<DeleteCount> };
  pedidoLine: { deleteMany(args: { where: { pedido: ByBusiness } }): Promise<DeleteCount> };
  employeeSchedule: { deleteMany(args: { where: { employee: ByBusiness } }): Promise<DeleteCount> };
  openingHour: { deleteMany(args: { where: { location: ByBusiness } }): Promise<DeleteCount> };
  holiday: { deleteMany(args: { where: { location: ByBusiness } }): Promise<DeleteCount> };
  teamMember: { deleteMany(args: { where: { team: ByBusiness } }): Promise<DeleteCount> };
  // --- Hijos directos que referencian a otros padres del negocio (van ANTES) ---
  booking: { deleteMany(args: { where: ByBusiness }): Promise<DeleteCount> };
  customerPackage: { deleteMany(args: { where: ByBusiness }): Promise<DeleteCount> };
  visit: { deleteMany(args: { where: ByBusiness }): Promise<DeleteCount> };
  customerNote: { deleteMany(args: { where: ByBusiness }): Promise<DeleteCount> };
  reminder: { deleteMany(args: { where: ByBusiness }): Promise<DeleteCount> };
  contacto: { deleteMany(args: { where: ByBusiness }): Promise<DeleteCount> };
  fichaje: { deleteMany(args: { where: ByBusiness }): Promise<DeleteCount> };
  workdayEvent: { deleteMany(args: { where: ByBusiness }): Promise<DeleteCount> };
  timeOffRequest: { deleteMany(args: { where: ByBusiness }): Promise<DeleteCount> };
  document: { deleteMany(args: { where: ByBusiness }): Promise<DeleteCount> };
  invoice: { deleteMany(args: { where: ByBusiness }): Promise<DeleteCount> };
  sale: { deleteMany(args: { where: ByBusiness }): Promise<DeleteCount> };
  pedido: { deleteMany(args: { where: ByBusiness }): Promise<DeleteCount> };
  telegramMessage: { deleteMany(args: { where: ByBusiness }): Promise<DeleteCount> };
  notification: { deleteMany(args: { where: ByBusiness }): Promise<DeleteCount> };
  campaign: { deleteMany(args: { where: ByBusiness }): Promise<DeleteCount> };
  product: { deleteMany(args: { where: ByBusiness }): Promise<DeleteCount> };
  // --- Padres referenciados dentro del negocio (van DESPUÉS de sus hijos) ---
  package: { deleteMany(args: { where: ByBusiness }): Promise<DeleteCount> };
  service: { deleteMany(args: { where: ByBusiness }): Promise<DeleteCount> };
  resource: { deleteMany(args: { where: ByBusiness }): Promise<DeleteCount> };
  tag: { deleteMany(args: { where: ByBusiness }): Promise<DeleteCount> };
  team: { deleteMany(args: { where: ByBusiness }): Promise<DeleteCount> };
  customer: { deleteMany(args: { where: ByBusiness }): Promise<DeleteCount> };
  employee: { deleteMany(args: { where: ByBusiness }): Promise<DeleteCount> };
  visitState: { deleteMany(args: { where: ByBusiness }): Promise<DeleteCount> };
  location: { deleteMany(args: { where: ByBusiness }): Promise<DeleteCount> };
  membership: { deleteMany(args: { where: ByBusiness }): Promise<DeleteCount> };
  oAuthCredential: { deleteMany(args: { where: ByBusiness }): Promise<DeleteCount> };
  tenantApiKey: { deleteMany(args: { where: ByBusiness }): Promise<DeleteCount> };
  tenantSecret: { deleteMany(args: { where: ByBusiness }): Promise<DeleteCount> };
  tenantStateEvent: { deleteMany(args: { where: ByBusiness }): Promise<DeleteCount> };
  businessSetting: { deleteMany(args: { where: ByBusiness }): Promise<DeleteCount> };
  // --- La fila del negocio, en último lugar ---
  business: { delete(args: { where: { id: string } }): Promise<unknown> };
}

/**
 * Dependencias del endpoint de purga (patrón DI del repo). El findFirst NO
 * filtra por eliminadoEn: un negocio soft-borrado también es purgable (la
 * purga existe precisamente para la destrucción definitiva).
 */
export interface PurgeDb {
  business: {
    findFirst(args: { where: { id: string } }): Promise<{ id: string; nombre: string } | null>;
  };
  $transaction<T>(fn: (tx: PurgeTx) => Promise<T>): Promise<T>;
}

const CONFIRMATION_REQUIRED = {
  error: {
    code: 'purge_confirmation_required',
    message: 'La purga exige doble confirmación: confirm=true y echo con el id o nombre exacto del negocio',
  },
} as const;

const CONFIRMATION_MISMATCH = {
  error: {
    code: 'purge_confirmation_mismatch',
    message: 'El echo de confirmación no coincide con el id ni con el nombre exacto del negocio',
  },
} as const;

const BUSINESS_NOT_FOUND = {
  error: { code: 'business_not_found', message: 'Negocio no encontrado' },
} as const;

/* ---------- POST /businesses/:id/purge ---------- */

/**
 * Hard-delete de un negocio y TODOS sus datos, hijos→padres en UNA transacción
 * (orden documentado arriba; sin filas huérfanas). Flujo:
 *   1. Doble confirmación: `confirm === true` (booleano estricto) y `echo`
 *      string no vacío. Falta cualquiera → 400 SIN tocar la BD.
 *   2. Negocio por id (incluye soft-borrados) → 404 si no existe.
 *   3. `echo` debe ser EXACTAMENTE el id o el nombre del negocio → 400 si no.
 *   4. Borrado ordenado dentro de $transaction; devuelve conteos por tabla.
 * Auditoría: log de operador antes y después (no TenantStateEvent, ver arriba).
 */
export async function purgeBusinessHandler(db: PurgeDb, req: Request, res: Response) {
  try {
    const businessId = req.params.id;
    const body = (req.body ?? {}) as { confirm?: unknown; echo?: unknown };

    // 1) Doble confirmación presente (estricta) ANTES de cualquier lectura.
    if (body.confirm !== true || typeof body.echo !== 'string' || !body.echo) {
      return res.status(400).json(CONFIRMATION_REQUIRED);
    }

    // 2) El negocio debe existir (soft-borrados incluidos: purga = destrucción real).
    const business = await db.business.findFirst({ where: { id: businessId } });
    if (!business) return res.status(404).json(BUSINESS_NOT_FOUND);

    // 3) El echo debe repetir el id o el nombre EXACTO (sin trim ni case-fold:
    //    la fricción es deliberada en una acción irreversible).
    if (body.echo !== business.id && body.echo !== business.nombre) {
      return res.status(400).json(CONFIRMATION_MISMATCH);
    }

    // 4) Auditoría de operador ANTES de ejecutar (queda rastro aunque falle a medias).
    console.warn(`[service-operator] PURGE iniciada: negocio ${business.id} ("${business.nombre}")`);

    const deleted = await db.$transaction(async (tx) => {
      const counts: Record<string, number> = {};
      const byBusiness = { businessId: business.id };

      // Fase A — nietos sin negocio_id (vía relación con su padre).
      counts.packageSession = (await tx.packageSession.deleteMany({ where: { customerPackage: byBusiness } })).count;
      counts.bookingStatusHistory = (await tx.bookingStatusHistory.deleteMany({ where: { booking: byBusiness } })).count;
      counts.saleLine = (await tx.saleLine.deleteMany({ where: { sale: byBusiness } })).count;
      counts.invoiceLine = (await tx.invoiceLine.deleteMany({ where: { invoice: byBusiness } })).count;
      counts.pedidoLine = (await tx.pedidoLine.deleteMany({ where: { pedido: byBusiness } })).count;
      counts.employeeSchedule = (await tx.employeeSchedule.deleteMany({ where: { employee: byBusiness } })).count;
      counts.openingHour = (await tx.openingHour.deleteMany({ where: { location: byBusiness } })).count;
      counts.holiday = (await tx.holiday.deleteMany({ where: { location: byBusiness } })).count;
      counts.teamMember = (await tx.teamMember.deleteMany({ where: { team: byBusiness } })).count;

      // Fase B — hijos directos que referencian a otros padres del negocio.
      // reserva ANTES que sucursal/servicio (FKs RESTRICT); paquete_cliente ANTES que paquete.
      counts.booking = (await tx.booking.deleteMany({ where: byBusiness })).count;
      counts.customerPackage = (await tx.customerPackage.deleteMany({ where: byBusiness })).count;
      counts.visit = (await tx.visit.deleteMany({ where: byBusiness })).count;
      counts.customerNote = (await tx.customerNote.deleteMany({ where: byBusiness })).count;
      counts.reminder = (await tx.reminder.deleteMany({ where: byBusiness })).count;
      counts.contacto = (await tx.contacto.deleteMany({ where: byBusiness })).count;
      counts.fichaje = (await tx.fichaje.deleteMany({ where: byBusiness })).count;
      counts.workdayEvent = (await tx.workdayEvent.deleteMany({ where: byBusiness })).count;
      counts.timeOffRequest = (await tx.timeOffRequest.deleteMany({ where: byBusiness })).count;
      counts.document = (await tx.document.deleteMany({ where: byBusiness })).count;
      counts.invoice = (await tx.invoice.deleteMany({ where: byBusiness })).count;
      counts.sale = (await tx.sale.deleteMany({ where: byBusiness })).count;
      counts.pedido = (await tx.pedido.deleteMany({ where: byBusiness })).count;
      counts.telegramMessage = (await tx.telegramMessage.deleteMany({ where: byBusiness })).count;
      counts.notification = (await tx.notification.deleteMany({ where: byBusiness })).count;
      counts.campaign = (await tx.campaign.deleteMany({ where: byBusiness })).count;
      counts.product = (await tx.product.deleteMany({ where: byBusiness })).count;

      // Fase C — padres referenciados dentro del negocio (sus hijos ya no existen).
      counts.package = (await tx.package.deleteMany({ where: byBusiness })).count;
      counts.service = (await tx.service.deleteMany({ where: byBusiness })).count;
      counts.resource = (await tx.resource.deleteMany({ where: byBusiness })).count;
      counts.tag = (await tx.tag.deleteMany({ where: byBusiness })).count;
      counts.team = (await tx.team.deleteMany({ where: byBusiness })).count;
      counts.customer = (await tx.customer.deleteMany({ where: byBusiness })).count;
      counts.employee = (await tx.employee.deleteMany({ where: byBusiness })).count;
      counts.visitState = (await tx.visitState.deleteMany({ where: byBusiness })).count;
      counts.location = (await tx.location.deleteMany({ where: byBusiness })).count;
      counts.membership = (await tx.membership.deleteMany({ where: byBusiness })).count;
      counts.oAuthCredential = (await tx.oAuthCredential.deleteMany({ where: byBusiness })).count;
      counts.tenantApiKey = (await tx.tenantApiKey.deleteMany({ where: byBusiness })).count;
      counts.tenantSecret = (await tx.tenantSecret.deleteMany({ where: byBusiness })).count;
      counts.tenantStateEvent = (await tx.tenantStateEvent.deleteMany({ where: byBusiness })).count;
      counts.businessSetting = (await tx.businessSetting.deleteMany({ where: byBusiness })).count;

      // Fase D — la fila del negocio, en último lugar.
      await tx.business.delete({ where: { id: business.id } });

      return counts;
    });

    const totalRows = Object.values(deleted).reduce((acc, n) => acc + n, 0) + 1; // +1 = la fila de negocio
    console.warn(
      `[service-operator] PURGE completada: negocio ${business.id} ("${business.nombre}"), ${totalRows} filas borradas`,
    );

    return res.json({ id: business.id, nombre: business.nombre, deleted, totalRows });
  } catch (e) {
    console.error('[service-operator] error en purga de negocio:', e);
    return res.status(500).json({ error: { code: 'server_error', message: 'No se pudo purgar el negocio' } });
  }
}

/* ---------- Router ---------- */

/**
 * Router de purga: SOLO registra POST /businesses/:id/purge. Se monta bajo
 * /service/operator (requireOperatorToken ya aplicado router-wide) como los
 * routers hermanos de lifecycle y tenant-keys. Separado en su propio módulo
 * con su propia interfaz de BD para que ningún camino de lifecycle pueda
 * alcanzar un borrado ni por tipo ni por ruta.
 */
export function buildPurgeOperatorRouter(db: PurgeDb): Router {
  const router = Router();
  router.post('/businesses/:id/purge', (req, res) => {
    void purgeBusinessHandler(db, req, res);
  });
  return router;
}
