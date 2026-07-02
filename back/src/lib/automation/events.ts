// Catálogo de eventos de dominio que el CRM publica hacia n8n.
// `data` lleva SOLO lo que la plantilla necesita (minimización de PII).
// Convención: dominio.hecho_en_pasado.

export type AutomationEventName =
  | 'user.invited'
  | 'password.reset_requested'
  | 'booking.confirmed'
  | 'booking.reminder.24h'
  | 'booking.reminder.2h'
  | 'booking.no_show'
  // Fases 3-5: digests (a admins/cliente) y eventos de dominio. `detalle` siempre
  // es texto plano multilínea (una línea por ítem); n8n lo escapa con data.safe.
  | 'invoice.pending_digest'
  | 'cash.daily_summary'
  | 'stock.low_digest'
  | 'customer.birthday'
  | 'customer.reactivation_digest'
  | 'package.renewal_due'
  | 'fichaje.weekly_summary'
  | 'review.request'
  | 'timeoff.requested'
  | 'timeoff.resolved'
  // crm-citas-google-calendar (WU3): push opt-in de un ítem de agenda a Google
  // Calendar. Workflow n8n dedicado (crm-calendar-push), credencial Google en n8n.
  | 'calendar.event_push';

// Payload común de los eventos de cita. `fecha`/`hora` van ya formateados (es-ES)
// para que la plantilla n8n no dependa de la zona horaria del CRM.
export interface BookingEventData {
  bookingId: string;
  businessName: string;
  customerName: string;
  email: string;
  serviceName: string;
  employeeName?: string;
  fecha: string; // formateado es-ES (día completo)
  hora: string;  // formateado es-ES (HH:MM)
}

export interface AutomationPayloads {
  'user.invited': {
    userId: string;
    email: string;
    firstName: string;
    businessName?: string;
    inviteUrl: string;   // enlace /set-password?token=... (token de un solo uso)
    expiresAt: string;   // ISO
  };
  'password.reset_requested': {
    userId: string;
    email: string;
    firstName: string;
    resetUrl: string;    // enlace /reset-password?token=...
    expiresAt: string;   // ISO
  };
  'booking.confirmed': BookingEventData;
  'booking.reminder.24h': BookingEventData;
  'booking.reminder.2h': BookingEventData;
  'booking.no_show': BookingEventData;

  // --- Fase 3: facturación / ventas (digests diarios a admins) ---
  'invoice.pending_digest': {
    businessName: string;
    email: string;          // admin destinatario
    detalle: string;        // texto plano, una línea por factura
    totalPendientes: number; // número de facturas pendientes/vencidas
  };
  'cash.daily_summary': {
    businessName: string;
    email: string;          // admin destinatario
    fecha: string;          // día resumido (es-ES), el día anterior
    total: number;          // suma de ventas del día
    detalle: string;        // texto plano, una línea por método de pago
  };
  'stock.low_digest': {
    businessName: string;
    email: string;          // admin destinatario
    detalle: string;        // texto plano, una línea por producto
    numProductos: number;
  };

  // --- Fase 4: clientes / marketing ---
  'customer.birthday': {
    businessName: string;
    customerName: string;
    email: string;          // email del cliente
  };
  'customer.reactivation_digest': {
    businessName: string;
    email: string;          // admin destinatario
    detalle: string;        // texto plano, una línea por cliente inactivo (máx 50)
    numClientes: number;
  };
  'package.renewal_due': {
    businessName: string;
    customerName: string;
    email: string;          // email del cliente
    packageName: string;
    sesionesRestantes: number;
  };

  // --- Fase 5: equipo / estudios ---
  'fichaje.weekly_summary': {
    businessName: string;
    email: string;          // admin destinatario
    detalle: string;        // texto plano, una línea por empleado
  };
  'review.request': {
    businessName: string;
    customerName: string;
    email: string;          // email del cliente
    serviceName: string;
    fecha: string;
    hora: string;
  };
  'timeoff.requested': {
    businessName: string;
    email: string;          // admin destinatario
    employeeName: string;
    tipo: string;           // etiqueta castellana (Vacaciones, Baja…)
    inicio: string;         // YYYY-MM-DD
    fin: string;            // YYYY-MM-DD
    dias: number;
  };
  'timeoff.resolved': {
    businessName: string;
    employeeName: string;
    email: string;          // email del empleado
    estado: string;         // etiqueta castellana (Aprobada / Rechazada)
    inicio: string;
    fin: string;
  };

  // --- crm-citas-google-calendar (WU3): push opt-in a Google Calendar ---
  'calendar.event_push': {
    /** UID iCal estable, mismo identificador que el feed ICS (booking-{id}@crm / reminder-{id}@crm). */
    uid: string;
    titulo: string;
    inicio: string;   // ISO 8601
    fin: string;       // ISO 8601
    direccion?: string;
  };
}

export interface AutomationEnvelope<N extends AutomationEventName = AutomationEventName> {
  eventId: string;
  name: N;
  businessId: string;
  occurredAt: string;
  data: AutomationPayloads[N];
}
