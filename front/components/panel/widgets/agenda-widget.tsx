'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTerm } from '@/lib/tenant-config-context';
import { useCollection } from '@/lib/data/use-collection';
import { citas as seedCitas, type Cita } from '@/lib/mock/data';
import { CitaDetalleModal, type CitaConNotas } from '@/components/crm/cita-detalle-modal';
import { estadoTone } from '@/components/agenda/shared';
import { AgendaGrid } from './agenda-grid';

/**
 * Widget Agenda: calendario mes/semana/día sobre la colección `citas` (mock).
 * La gramática de navegación/grid vive en `AgendaGrid` (crm-operaos-agenda-
 * contactos-fichaje-telegram WU1) — este componente solo aporta los datos y
 * el contenido de cada tarjeta, sin duplicar la lógica de calendario.
 */
export function AgendaWidget() {
  const router = useRouter();
  const termCitas = useTerm('citas', 'Citas');
  const { items, update } = useCollection<Cita>('citas', seedCitas);

  // Modal de detalle (WU5): se guarda solo el id, el detalle se deriva de `items` en
  // cada render para reflejar de inmediato el guardado optimista de useCollection.
  const [detalleId, setDetalleId] = useState<Cita['id'] | null>(null);

  // Click en una cita: abre el modal de detalle (WU5). El deep-link a /citas?edit=
  // se conserva como acción explícita dentro del modal ("Ir a agenda").
  function editarCita(id: Cita['id']) {
    setDetalleId(id);
  }

  const detalleCita = (items as CitaConNotas[]).find((c) => c.id === detalleId) ?? null;

  return (
    <>
      <AgendaGrid<Cita>
        items={items}
        getKey={(c) => c.id}
        emptyLabel={`Sin ${termCitas.toLowerCase()} este día.`}
        renderCard={(c, { compact }) => (
          <div
            className={compact ? 'cita-full-card cita-full-card-compact' : 'cita-full-card'}
            style={{ borderLeftColor: estadoTone(c.estado) }}
            onClick={(e) => { e.stopPropagation(); editarCita(c.id); }}
          >
            <div className="time">{c.hora}</div>
            <div className="client">{c.cliente}</div>
            {!compact && <div className="meta">{c.servicio} · {c.empleado} · {c.estado}</div>}
          </div>
        )}
      />

      <CitaDetalleModal
        cita={detalleCita}
        onClose={() => setDetalleId(null)}
        onSave={(notes) => { if (detalleCita) update(detalleCita.id, { notes } as unknown as Partial<Cita>); }}
        onIrAgenda={() => { const id = detalleCita?.id; setDetalleId(null); if (id != null) router.push(`/citas?edit=${id}`); }}
      />
    </>
  );
}
