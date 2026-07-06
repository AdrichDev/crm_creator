'use client';
import { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/primitives';
import type { Cita } from '@/lib/mock/data';
import { buildGoogleMapsEmbedUrl, buildGoogleMapsSearchUrl } from '@/lib/citas/google-maps-url';

// direccion: opcional — viene de Location.direccion (back/src/routes/bookings.ts) cuando
// la cita tiene locationId asociado. Sin dirección, el bloque de mapa no se muestra (AC3, WU3).
export type CitaConNotas = Cita & { notes?: string | null; direccion?: string | null };

// Modal de detalle de cita desde el widget Agenda (Inicio) — crm-citas-ux-agenda WU5.
// Patrón visual del ContactInfoModal de agents-agency (dl/dt/dd + ✕ rotatorio, ver
// ui/modal.tsx + globals.css .opera-modal-close) con los tokens del CRM. Las
// "anotaciones" viven en Booking.notes (texto libre, sin migración — ver decisiones
// de crm-citas-ux-agenda/proposal.md).
export function CitaDetalleModal({ cita, onClose, onSave, onIrAgenda, irAgendaLabel = 'Ir a agenda' }: {
  cita: CitaConNotas | null;
  onClose: () => void;
  onSave: (notes: string) => void;
  onIrAgenda: () => void;
  /** Desde el widget del inicio navega a /citas; desde /citas la misma acción
   * abre directamente el formulario de edición — la etiqueta debe reflejarlo. */
  irAgendaLabel?: string;
}) {
  const [notes, setNotes] = useState('');

  useEffect(() => { setNotes(cita?.notes ?? ''); }, [cita]);

  if (!cita) return null;

  const mapaEmbedUrl = buildGoogleMapsEmbedUrl(cita.direccion);
  const mapaEnlaceUrl = buildGoogleMapsSearchUrl(cita.direccion);

  const campos: [string, string][] = [
    ['Cliente', cita.cliente],
    ['Servicio', cita.servicio],
    ['Profesional', cita.empleado || '—'],
    ['Fecha', cita.fecha],
    ['Hora', cita.hora],
    ['Estado', cita.estado],
    // Registro "Dirección" solo si hay dirección (cliente visitado > sucursal,
    // ver back/src/lib/citaDireccion.ts) — sin ella se omite la fila, no se
    // muestra un "Dirección:" vacío (pedido owner).
    ...(cita.direccion ? ([['Dirección', cita.direccion]] as [string, string][]) : []),
  ];

  return (
    <Modal open title="Detalle de cita" onClose={onClose}
      footer={<>
        <Button variant="outline" onClick={onClose}>Cerrar</Button>
        <Button onClick={onIrAgenda}>{irAgendaLabel}</Button>
      </>}>
      <dl className="divide-y divide-[var(--line)] text-sm">
        {campos.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[110px_1fr] gap-3 py-2">
            <dt className="text-[11px] font-bold uppercase tracking-wider text-[var(--acc)]">{label}</dt>
            <dd className="break-words whitespace-pre-wrap text-[var(--panel-text)]">{value}</dd>
          </div>
        ))}
      </dl>
      {mapaEmbedUrl && (
        <div className="mt-4">
          <label className="opera-label">Ubicación</label>
          <div className="overflow-hidden rounded-md border border-[var(--line)]">
            <iframe
              title="Ubicación de la cita en Google Maps"
              src={mapaEmbedUrl}
              className="h-40 w-full sm:h-52"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
          {mapaEnlaceUrl && (
            <a href={mapaEnlaceUrl} target="_blank" rel="noopener noreferrer"
              className="mt-1 inline-block text-xs text-[var(--acc)] underline">
              Abrir en Google Maps
            </a>
          )}
        </div>
      )}
      <div className="mt-4">
        <label className="opera-label">Anotaciones</label>
        <textarea className="opera-control" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder="Añade una anotación sobre esta cita…" />
        {/* Fila de acciones: pin de ubicación a la izquierda (solo con dirección,
            abre Google Maps en pestaña nueva) y "Guardar anotación" a la derecha. */}
        <div className={`mt-2 flex items-center ${mapaEnlaceUrl ? 'justify-between' : 'justify-end'}`}>
          {mapaEnlaceUrl && (
            <a href={mapaEnlaceUrl} target="_blank" rel="noopener noreferrer"
              className="row-action edit inline-flex items-center"
              title="Abrir dirección en Google Maps" aria-label="Abrir dirección en Google Maps">
              <MapPin className="h-4 w-4" />
            </a>
          )}
          <Button variant="outline" onClick={() => onSave(notes)}>Guardar anotación</Button>
        </div>
      </div>
    </Modal>
  );
}
