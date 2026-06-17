// Catálogo de eventos de dominio que el CRM publica hacia n8n.
// `data` lleva SOLO lo que la plantilla necesita (minimización de PII).
// Convención: dominio.hecho_en_pasado.

export type AutomationEventName = 'user.invited' | 'password.reset_requested';

// Branding del tenant para que el email vaya acorde a cada cliente.
// Opcional: si falta, la plantilla usa valores por defecto neutros.
export interface EmailBranding {
  primary?: string;     // color de marca (botones/acentos), ej. "#4f46e5"
  secondary?: string;   // color secundario (degradado del logo)
  logoText?: string;    // iniciales/nombre corto si no hay imagen
  logoImage?: string;   // URL ABSOLUTA del logo (debe ser accesible por el cliente de correo)
}

export interface AutomationPayloads {
  'user.invited': {
    userId: string;
    email: string;
    firstName: string;
    businessName?: string;
    inviteUrl: string;   // enlace /set-password?token=... (token de un solo uso)
    expiresAt: string;   // ISO
    branding?: EmailBranding;
  };
  'password.reset_requested': {
    userId: string;
    email: string;
    firstName: string;
    businessName?: string;
    resetUrl: string;    // enlace /reset-password?token=...
    expiresAt: string;   // ISO
    branding?: EmailBranding;
  };
}

export interface AutomationEnvelope<N extends AutomationEventName = AutomationEventName> {
  eventId: string;
  name: N;
  businessId: string;
  occurredAt: string;
  data: AutomationPayloads[N];
}
