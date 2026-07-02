import type { AutomationPayloads } from './automation/index.js';
import { joinNombre } from './nombre.js';

// Constructores puros de payloads de eventos de dominio (Fases 4-5). Extraídos de
// los routers para poder testear el mapeo sin harness Express. Fechas en UTC.

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export function buildReviewRequest(args: {
  businessName: string;
  customer: { nombre: string; apellido: string | null };
  email: string;
  serviceName: string;
  startAt: Date;
}): AutomationPayloads['review.request'] {
  return {
    businessName: args.businessName,
    customerName: joinNombre(args.customer) || 'Cliente',
    email: args.email,
    serviceName: args.serviceName,
    fecha: args.startAt.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }),
    hora: args.startAt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }),
  };
}

export function buildTimeoffRequested(args: {
  businessName: string;
  email: string;                 // admin destinatario
  employee: { nombre: string; apellido: string | null } | null;
  tipoLabel: string;
  inicio: Date;
  fin: Date;
  dias: number | null;
}): AutomationPayloads['timeoff.requested'] {
  return {
    businessName: args.businessName,
    email: args.email,
    employeeName: args.employee ? joinNombre(args.employee) : 'Empleado',
    tipo: args.tipoLabel,
    inicio: isoDay(args.inicio),
    fin: isoDay(args.fin),
    dias: args.dias ?? 0,
  };
}

export function buildTimeoffResolved(args: {
  businessName: string;
  employee: { nombre: string; apellido: string | null };
  email: string;                 // email del empleado
  estadoLabel: string;
  inicio: Date;
  fin: Date;
}): AutomationPayloads['timeoff.resolved'] {
  return {
    businessName: args.businessName,
    employeeName: joinNombre(args.employee),
    email: args.email,
    estado: args.estadoLabel,
    inicio: isoDay(args.inicio),
    fin: isoDay(args.fin),
  };
}
