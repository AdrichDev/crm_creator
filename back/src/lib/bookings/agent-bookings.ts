// ---------------------------------------------------------------------------
// Citas tomadas por el agente conversacional del negocio (crm-citas-del-bot-en-operaos).
//
// El agente escribe en `aa.cita`; OperaOS lee `crm.reserva`. Sin este puente, una reserva
// hecha por el bot es INVISIBLE para el dueño del negocio: la agenda aparece vacía aunque
// el bot lleve semanas reservando.
//
// Se LEE, no se copia. Sigue existiendo una sola fila por reserva, propiedad del esquema
// que la creó, así que no hay nada que sincronizar ni nada que pueda divergir. Es el mismo
// patrón con el que el CRM ya consulta `aa.tenant` y `aa.uso_tokens` desde su propio
// proceso (ver lib/projects/token-charge.ts): SQL crudo cross-schema. agents-agency es el
// dueño del esquema `aa` y quien aplica sus migraciones; aquí solo leemos.
// ---------------------------------------------------------------------------

/** Tope de filas leídas por consulta. Al alcanzarlo se avisa; nunca se trunca en silencio. */
export const AGENT_BOOKINGS_CAP = 2000;

/**
 * Estado en `aa.cita` → etiqueta castellana que ya muestra el front de citas.
 * Dos estados distintos del agente colapsan en "Cancelada", igual que hace ESTADO_LABEL
 * en el router con CANCELLED/NO_SHOW.
 */
const ESTADO_AGENTE: Record<string, string> = {
  scheduled: 'Confirmada',
  attended: 'Completada',
  cancelled: 'Cancelada',
  'no-show': 'Cancelada',
};

/** Estados terminales: los que `pendientes=1` excluye. */
const ESTADOS_TERMINALES = new Set(['attended', 'cancelled', 'no-show']);

/** Fila cruda de `aa.cita` unida a su servicio. */
export type CitaAgenteRow = {
  id: string;
  inicio: Date;
  estado: string;
  comensales: number;
  nombre_cliente: string | null;
  email: string | null;
  notas: string | null;
  servicio_nombre: string;
};

/** Fila en el shape castellano que consume el front, con marca de origen. */
export type CitaAgente = {
  id: string;
  cliente: string;
  clienteComercial: string;
  servicio: string;
  empleado: string;
  fecha: string;
  hora: string;
  estado: string;
  customerId: null;
  teamId: null;
  serviceId: null;
  employeeId: null;
  locationId: null;
  recurso: null;
  aforo: number | null;
  notes: string | null;
  direccion: null;
  /** Marca de origen. Ausente en las reservas nacidas en el CRM. */
  origen: 'agente';
};

/** Cliente mínimo: resolver el tenant del negocio y leer `aa.cita` por SQL crudo. */
export interface AgentBookingsDb {
  business: {
    findUnique(args: {
      where: { id: string };
      select: { tenantId: true };
    }): Promise<{ tenantId: string | null } | null>;
  };
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}

export type ListAgentBookingsArgs = {
  /** Negocio activo de la sesión. Sin él no hay tenant al que anclar y se devuelve `[]`. */
  businessId: string | undefined;
  from?: string;
  to?: string;
  /** Etiqueta castellana tal y como llega del router ("Confirmada", "Cancelada"...). */
  estado?: string;
  /** `pendientes=1`: solo citas no terminales. Tiene prioridad sobre `estado`. */
  soloPendientes?: boolean;
  /** Filtro por empleado del CRM. Si viene, no hay cita del agente que pueda casar. */
  employeeId?: string;
  /** Búsqueda por nombre de cliente o de servicio. */
  search?: string;
};

/**
 * Mapea una fila de `aa.cita` al shape castellano del listado de citas.
 *
 * El id se prefija `aa:` para que NUNCA pueda colisionar con un id de `crm.reserva` y para
 * que el front distinga de un vistazo lo que no le pertenece.
 *
 * `fecha`/`hora` se cortan del ISO igual que en el router (`startAt.toISOString()`), para
 * que ambas fuentes se pinten con el mismo criterio y no aparezcan desfasadas entre sí.
 * Eso exige que `row.inicio` llegue ya en reloj de pared del negocio: la traducción desde
 * el instante UTC que guarda `aa.cita` la hace la consulta, no esta función.
 */
export function mapCitaAgente(row: CitaAgenteRow): CitaAgente {
  const inicio = new Date(row.inicio).toISOString();
  // Un lead puede reservar dando solo el email; y el bot puede cerrar una reserva sin
  // ninguno de los dos. Mostrar vacío dejaría una fila anónima sin explicación.
  const nombre = row.nombre_cliente || row.email || 'Cliente del bot';
  return {
    id: `aa:${row.id}`,
    cliente: nombre,
    clienteComercial: nombre,
    servicio: row.servicio_nombre,
    // El esquema de agentes no asigna empleado a una reserva: no hay dato que mostrar.
    empleado: '',
    fecha: inicio.slice(0, 10),
    hora: inicio.slice(11, 16),
    estado: ESTADO_AGENTE[row.estado] ?? 'Pendiente',
    customerId: null,
    teamId: null,
    serviceId: null,
    employeeId: null,
    locationId: null,
    recurso: null,
    aforo: row.comensales ?? null,
    notes: row.notas ?? null,
    direccion: null,
    origen: 'agente',
  };
}

/** ¿Pasa la fila los filtros que no van en el SQL (estado, búsqueda)? */
function pasaFiltros(
  row: CitaAgenteRow,
  { estado, soloPendientes, search }: Pick<ListAgentBookingsArgs, 'estado' | 'soloPendientes' | 'search'>,
): boolean {
  if (soloPendientes) {
    if (ESTADOS_TERMINALES.has(row.estado)) return false;
  } else if (estado && (ESTADO_AGENTE[row.estado] ?? 'Pendiente') !== estado) {
    return false;
  }
  if (search) {
    const aguja = search.toLowerCase();
    const pajar = `${row.nombre_cliente ?? ''} ${row.email ?? ''} ${row.servicio_nombre}`.toLowerCase();
    if (!pajar.includes(aguja)) return false;
  }
  return true;
}

/**
 * Citas que el agente del negocio ha tomado, en el shape del listado de OperaOS.
 *
 * El anclaje de tenancy es el `tenant_id` del negocio activo, resuelto AQUÍ desde
 * `crm.negocio` y nunca tomado de la petición: es el único punto donde el dato no puede
 * venir del cliente. Un negocio sin agente contratado (`tenant_id` nulo) devuelve lista
 * vacía sin llegar a consultar `aa.cita`.
 *
 * Al SQL van los filtros selectivos (tenant y rango de fechas, ambos indexados); estado y
 * búsqueda se aplican después en memoria sobre un conjunto ya acotado por el rango que
 * manda el calendario.
 */
export async function listAgentBookings(
  db: AgentBookingsDb,
  args: ListAgentBookingsArgs,
): Promise<CitaAgente[]> {
  const { businessId, from, to, employeeId } = args;

  // Un empleado es una entidad del CRM; ninguna cita del agente tiene empleado asignado,
  // así que filtrar por uno no puede devolver ninguna. Se corta antes de consultar.
  if (employeeId) return [];
  // Sin negocio activo no hay tenant al que anclar: devolver algo sería devolver las citas
  // de cualquiera. `undefined` en el `where` NO es un filtro, es la ausencia de filtro.
  if (!businessId) return [];

  const negocio = await db.business.findUnique({
    where: { id: businessId },
    select: { tenantId: true },
  });
  if (!negocio?.tenantId) return [];

  // Mismo criterio de límites que `GET /bookings` (gte / lte sobre el inicio).
  const desde = from ? new Date(from) : null;
  const hasta = to ? new Date(to) : null;

  const rows = await db.$queryRaw<CitaAgenteRow[]>`
    WITH citas AS (
      SELECT c.id, c.estado, c.comensales, c.nombre_cliente, c.email,
             c.notas, s.nombre AS servicio_nombre,
             -- Las dos tablas declaran "timestamp without time zone" y guardan cosas
             -- distintas: crm.reserva.inicia_en guarda el reloj de pared del negocio,
             -- mientras que aa.cita.inicio guarda un instante UTC real (AA genera las
             -- franjas con Luxon en la zona del agente y las serializa con offset).
             -- Sin traducir, una cena de las 21:00 aparecía en OperaOS a las 19:00, es
             -- decir antes de que el restaurante abriera. Se pasa a reloj de pared del
             -- negocio para que ambas fuentes se pinten con el mismo criterio.
             c.inicio AT TIME ZONE 'UTC'
                      AT TIME ZONE COALESCE(h.zona_horaria, 'Europe/Madrid') AS inicio
      FROM aa.cita c
      JOIN aa.servicio_agente s ON s.id = c.servicio_id
      JOIN aa.agente a ON a.id = s.agente_id
      LEFT JOIN aa.horario_agente h ON h.agente_id = a.id
      WHERE a.tenant_id = ${negocio.tenantId}
    )
    SELECT id, inicio, estado, comensales, nombre_cliente, email, notas, servicio_nombre
    FROM citas
    -- El rango también se compara contra la hora ya traducida: filtrar por el instante
    -- UTC dejaría fuera del mes las citas de las dos primeras horas del día 1.
    WHERE (${desde}::timestamp IS NULL OR inicio >= ${desde}::timestamp)
      AND (${hasta}::timestamp IS NULL OR inicio <= ${hasta}::timestamp)
    ORDER BY inicio ASC
    LIMIT ${AGENT_BOOKINGS_CAP}`;

  if (rows.length === AGENT_BOOKINGS_CAP) {
    // Truncar en silencio pintaría una agenda incompleta indistinguible de una completa.
    console.warn('[agent-bookings] tope de filas alcanzado; el listado puede estar incompleto', {
      businessId,
      tenantId: negocio.tenantId,
      cap: AGENT_BOOKINGS_CAP,
    });
  }

  return rows.filter((row) => pasaFiltros(row, args)).map(mapCitaAgente);
}

/**
 * Fusiona la página de reservas propias con las citas del agente y devuelve el tramo que
 * corresponde a `page`/`limit`.
 *
 * Ambas fuentes emiten `fecha`/`hora` cortadas del mismo ISO, así que ordenar por esa
 * pareja en orden lexicográfico ES el orden cronológico: no hace falta reconstruir fechas.
 */
export function fusionarCitas<T extends { fecha: string; hora: string }>(
  propias: T[],
  agente: CitaAgente[],
  page: number,
  limit: number,
): (T | CitaAgente)[] {
  const todas: (T | CitaAgente)[] = [...propias, ...agente];
  todas.sort((a, b) => (a.fecha === b.fecha ? a.hora.localeCompare(b.hora) : a.fecha.localeCompare(b.fecha)));
  return todas.slice((page - 1) * limit, page * limit);
}

/** Conteo por estado tal y como lo devuelve `prisma.booking.groupBy`. */
export type GrupoEstado = { status: string; _count: { _all: number } };

/** Totales de las tarjetas de resumen de /citas. */
export type ResumenCitas = { total: number; confirmadas: number; pendientes: number };

/**
 * Suma el resumen de ambas fuentes. Si las citas del agente no se contaran aquí, las
 * tarjetas contradirían al calendario que las lista justo debajo.
 *
 * Los estados del agente ya llegan traducidos a la etiqueta castellana (`mapCitaAgente`),
 * así que se comparan contra la misma etiqueta que muestra el front, no contra el enum.
 */
export function resumirCitas(grupos: GrupoEstado[], agente: CitaAgente[]): ResumenCitas {
  let total = 0;
  let confirmadas = 0;
  let pendientes = 0;
  for (const g of grupos) {
    const n = g._count._all;
    total += n;
    if (g.status === 'CONFIRMED') confirmadas += n;
    else if (g.status === 'PENDING') pendientes += n;
  }
  for (const c of agente) {
    total += 1;
    if (c.estado === 'Confirmada') confirmadas += 1;
    else if (c.estado === 'Pendiente') pendientes += 1;
  }
  return { total, confirmadas, pendientes };
}
