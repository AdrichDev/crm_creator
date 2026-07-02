'use client';
import { Button, Badge } from '@/components/ui/primitives';
import { Navigation } from 'lucide-react';
import type { FollowUpItem, FollowUpUrgency } from '@/lib/comercial/follow-up';

// Panel "Seguimiento": lista unificada (recordatorios + clientes pendientes con próxima
// acción) ya ordenada por buildFollowUpList. Presentacional puro: recibe los items ya
// resueltos y delega las acciones al padre (que sabe hacer fetch/PATCH).

interface Props {
  items: FollowUpItem[];
  onCompletar: (reminderId: string) => void;
  onAbrirFicha: (customerId: string) => void;
  getRouteUrl: (customerId: string) => string | null;
}

const URGENCY_LABEL: Record<FollowUpUrgency, string> = {
  vencido: 'Vencido', hoy: 'Hoy', proximo: 'Próximo', pendiente: 'Pendiente',
};
const URGENCY_TONE: Record<FollowUpUrgency, 'red' | 'amber' | 'blue' | 'gray'> = {
  vencido: 'red', hoy: 'amber', proximo: 'blue', pendiente: 'gray',
};

export function SeguimientoPanel({ items, onCompletar, onAbrirFicha, getRouteUrl }: Props) {
  if (items.length === 0) {
    return <p className="text-sm text-[var(--panel-muted)]">Nada en seguimiento.</p>;
  }
  return (
    <ul className="space-y-1">
      {items.map((item) => {
        const routeUrl = getRouteUrl(item.customerId);
        return (
          <li key={item.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm">
            <Badge tone={URGENCY_TONE[item.urgency]}>{URGENCY_LABEL[item.urgency]}</Badge>
            <span className="font-medium text-white">{item.customerNombre}</span>
            <span className="flex-1 text-[var(--panel-muted)]">{item.titulo}</span>
            {item.fecha && (
              <span className="text-xs text-[var(--panel-muted)]">{new Date(item.fecha).toLocaleDateString('es-ES')}</span>
            )}
            <div className="flex items-center gap-1">
              {item.kind === 'reminder' && (
                <Button variant="outline" onClick={() => onCompletar(item.reminderId!)}>Completar</Button>
              )}
              <Button variant="outline" onClick={() => onAbrirFicha(item.customerId)}>Ficha</Button>
              {routeUrl ? (
                <a href={routeUrl} target="_blank" rel="noopener noreferrer"
                   className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500">
                  <Navigation className="h-3 w-3" /> Ir
                </a>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
