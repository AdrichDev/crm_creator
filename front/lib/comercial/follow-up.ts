// Lista unificada de seguimiento (panel "Seguimiento" + campana de notificaciones).
// Combina recordatorios (Reminder) con clientes en estado pendiente con próxima acción
// (Customer.proximaAccionEn), ordenados por urgencia: vencido → hoy → próximo → pendiente.
// PURO: sin fetch, sin fecha implícita (recibe `now` para ser determinista en tests).

export type FollowUpUrgency = 'vencido' | 'hoy' | 'proximo' | 'pendiente';
export type FollowUpKind = 'reminder' | 'cliente-pendiente';

export interface FollowUpItem {
  id: string;
  kind: FollowUpKind;
  urgency: FollowUpUrgency;
  fecha: string | null;
  customerId: string;
  customerNombre: string;
  titulo: string;
  /** Solo presente en items de tipo 'reminder' (para la acción "completar"). */
  reminderId?: string;
}

export interface FollowUpReminderInput {
  id: string;
  customerId: string;
  customerNombre: string;
  titulo: string;
  fechaPrevista: string | null;
  estado: 'PENDING' | 'DONE' | 'CANCELLED';
}

export interface FollowUpClienteInput {
  id: string;
  nombre: string;
  proximaAccionEn: string | null | undefined;
  estadoVisita: { esPendiente: boolean } | null;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date): Date {
  const x = startOfDay(d);
  x.setDate(x.getDate() + 1);
  return x;
}

/** Clasifica una fecha prevista contra "hoy" (comparación por día natural, no por 24h exactas). */
export function reminderUrgency(fechaPrevista: string | null, now: Date): FollowUpUrgency {
  if (!fechaPrevista) return 'proximo';
  const f = new Date(fechaPrevista);
  if (f < startOfDay(now)) return 'vencido';
  if (f < endOfDay(now)) return 'hoy';
  return 'proximo';
}

const URGENCY_ORDER: Record<FollowUpUrgency, number> = { vencido: 0, hoy: 1, proximo: 2, pendiente: 3 };

export function buildFollowUpList(
  reminders: FollowUpReminderInput[],
  clientes: FollowUpClienteInput[],
  now: Date = new Date(),
): FollowUpItem[] {
  const items: FollowUpItem[] = [];

  for (const r of reminders) {
    if (r.estado !== 'PENDING') continue;
    items.push({
      id: `reminder:${r.id}`,
      kind: 'reminder',
      reminderId: r.id,
      urgency: reminderUrgency(r.fechaPrevista, now),
      fecha: r.fechaPrevista,
      customerId: r.customerId,
      customerNombre: r.customerNombre,
      titulo: r.titulo,
    });
  }

  for (const c of clientes) {
    if (!c.estadoVisita?.esPendiente || !c.proximaAccionEn) continue;
    items.push({
      id: `cliente:${c.id}`,
      kind: 'cliente-pendiente',
      urgency: 'pendiente',
      fecha: c.proximaAccionEn,
      customerId: c.id,
      customerNombre: c.nombre,
      titulo: 'Próxima acción pendiente',
    });
  }

  return items.sort((a, b) => {
    const byUrgency = URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency];
    if (byUrgency !== 0) return byUrgency;
    const fa = a.fecha ? new Date(a.fecha).getTime() : Infinity;
    const fb = b.fecha ? new Date(b.fecha).getTime() : Infinity;
    return fa - fb;
  });
}
