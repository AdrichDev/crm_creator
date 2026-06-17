// Tipos del estudio de mercado interactivo del CRM.
// Adaptado de agents-agency, pero acoplado al store mock/localStorage del CRM
// (useCollection<'estudios'>), no a un backend REST.

/** Una sección editable del estudio (contenido en markdown ligero). */
export interface StudySection {
  key: string;
  title: string;
  markdown: string;
  /** Valoración por estrellas de la sección (0-5), null = sin valorar. */
  rating?: number | null;
}

export type ProspectStatus = 'new' | 'contacted' | 'discarded';
export type WebsiteStatus = 'no_web' | 'web_no_chatbot' | 'web_chatbot';

/** Un prospecto detectado en la zona del negocio. */
export interface Prospect {
  id: string;
  name: string;
  sector?: string;
  address?: string;
  phone?: string;
  rating?: number | null;
  websiteStatus?: WebsiteStatus;
  websiteUrl?: string;
  /** Puntuación de oportunidad (0-5) editable por estrellas. */
  opportunityScore?: number | null;
  status: ProspectStatus;
}

/**
 * Estudio de mercado. Mantiene los campos del Estudio original del CRM
 * (titulo, fecha, modelo, tokens, contenido) y añade los campos
 * interactivos. Todos opcionales para no romper estudios ya guardados.
 */
export interface Estudio {
  id: number | string;
  titulo: string;
  fecha: string;
  modelo: string;
  tokens: number;
  contenido: string;
  /** Secciones editables derivadas del contenido (lazy, se rellenan al abrir). */
  sections?: StudySection[];
  /** Prospectos de la zona. */
  prospects?: Prospect[];
  /** Valoración global del estudio (0-5). */
  rating?: number | null;
}

export const PROSPECT_STATUS_LABELS: Record<ProspectStatus, string> = {
  new: 'Nuevo',
  contacted: 'Contactado',
  discarded: 'Descartado',
};

export const WEBSITE_STATUS_LABELS: Record<WebsiteStatus, string> = {
  no_web: 'Sin web',
  web_no_chatbot: 'Web sin chatbot',
  web_chatbot: 'Web con chatbot',
};
