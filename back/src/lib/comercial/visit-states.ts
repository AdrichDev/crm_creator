import { prisma } from '../../prisma.js';

// Estados de visita base sembrados por negocio (RF-06/07/19). `esSistema` = no borrable.
// El color/icono fija la representación del marcador en el mapa. Separado de la categoría ABC.
export interface DefaultVisitState {
  nombre: string;
  color: string;
  icono: string; // lucide-react
  orden: number;
  esPendiente: boolean; // cuenta como pendiente (aparece en la vista de pendientes)
}

export const DEFAULT_VISIT_STATES: DefaultVisitState[] = [
  { nombre: 'Pendiente de visitar', color: '#ef4444', icono: 'MapPin', orden: 0, esPendiente: true },
  { nombre: 'Visitado', color: '#22c55e', icono: 'CircleCheck', orden: 1, esPendiente: false },
  { nombre: 'Seguimiento pendiente', color: '#f59e0b', icono: 'Clock', orden: 2, esPendiente: true },
  { nombre: 'Revisitar', color: '#3b82f6', icono: 'RefreshCw', orden: 3, esPendiente: true },
  { nombre: 'Inactivo', color: '#9ca3af', icono: 'Ban', orden: 4, esPendiente: false },
];

// Idempotente: siembra los estados base sólo si el negocio aún no tiene ninguno.
// Usado por el seed, el backfill y el alta de negocio (para que todo negocio con el
// módulo comercial disponga de estados desde el minuto cero).
export async function seedVisitStates(businessId: string): Promise<number> {
  const existing = await prisma.visitState.count({ where: { businessId } });
  if (existing > 0) return 0;
  const res = await prisma.visitState.createMany({
    data: DEFAULT_VISIT_STATES.map((s) => ({ ...s, businessId, esSistema: true })),
  });
  return res.count;
}
