// Catálogo de eventos de dominio que el CRM publica hacia n8n.
// `data` lleva SOLO lo que la plantilla necesita (minimización de PII).
// Convención: dominio.hecho_en_pasado.

export type AutomationEventName = 'user.invited' | 'password.reset_requested';

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
}

export interface AutomationEnvelope<N extends AutomationEventName = AutomationEventName> {
  eventId: string;
  name: N;
  businessId: string;
  occurredAt: string;
  data: AutomationPayloads[N];
}
