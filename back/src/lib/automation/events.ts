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
  | 'calendar.event_push'
  // crm-integraciones-comunicacion (WU2): WhatsApp delegado a n8n. El backend NO
  // llama a Twilio: solo notifica el cambio de estado de la credencial marcador
  // (connect/revoke). El envío real de mensajes vive en un workflow n8n aparte.
  | 'whatsapp.credential_event'
  // crm-integraciones-comunicacion (WU1, Decisión 6): telemetría de integraciones
  // OAuth. Solo metadatos, sin PII. Se emiten con el mismo emit() soft-fail; sin
  // webhook configurado, emit() devuelve skipped (fail-open, no rompe el negocio).
  | 'integracion.reauth_requerido'
  | 'integracion.scope_insuficiente'
  | 'integracion.fallo_proveedor';

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

  // --- crm-integraciones-comunicacion (WU2): WhatsApp delegado a n8n ---
  'whatsapp.credential_event': {
    businessId: string;
    credentialId: string;
    /** connected | revoked. El envío real de mensajes es un evento aparte, fuera de WU2. */
    tipoEvento: 'connected' | 'revoked';
  };

  // --- crm-integraciones-comunicacion (WU1, Decisión 6): telemetría OAuth ---
  // businessId viaja en el envelope; el payload lleva solo metadatos del fallo.
  'integracion.reauth_requerido': {
    servicio: string;          // gmail | calendar
    motivo?: string;           // invalid_grant | token_revoked (opcional)
  };
  'integracion.scope_insuficiente': {
    servicio: string;
    requerido: string;         // scope que faltó
    concedidos: string[];      // scopes que sí otorgó el usuario
  };
  'integracion.fallo_proveedor': {
    servicio: string;
    codigo: string;            // http_5xx | fetch_error (metadato, sin cuerpo de respuesta)
  };
}

export interface AutomationEnvelope<N extends AutomationEventName = AutomationEventName> {
  eventId: string;
  name: N;
  businessId: string;
  occurredAt: string;
  data: AutomationPayloads[N];
  /**
   * crm-email-templates: HTML del correo ya maquetado por el back (estilo plantilla).
   * Si está presente, n8n debe usar `email.subject`/`email.html` para el envío en
   * vez de maquetar desde `data.detalle`. Ausente → comportamiento anterior.
   */
  email?: { subject: string; html: string };
}
