'use client';
import { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/primitives';
import type { Cita } from '@/lib/mock/data';
import { buildGoogleMapsEmbedUrl, buildGoogleMapsSearchUrl } from '@/lib/citas/google-maps-url';

// direccion: opcional — viene de Location.direccion (back/src/routes/bookings.ts) cuando
// la cita tiene locationId asociado. Sin dirección, el bloque de mapa no se muestra (AC3, WU3).
// clienteComercial: nombre COMERCIAL (razón social) del cliente visitado — distinto de
// `cliente` (persona de contacto). Se muestran como dos registros separados en el detalle.
// origen: 'agente' marca las reservas que tomó el bot del negocio. Viven en el esquema de
// agentes (aa.cita), no en crm.reserva: OperaOS las MUESTRA pero no las toca.
export type CitaConNotas = Omit<Cita, 'id'> & { id: string | number; notes?: string | null; direccion?: string | null; clienteComercial?: string | null; origen?: 'agente' | null };

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

  // Reserva del bot: OperaOS no puede editarla. Liberar la franja, revocar el código de
  // confirmación y avisar al cliente son cosas que solo sabe hacer el motor del agente;
  // un PATCH desde aquí desincronizaría su agenda en silencio.
  const soloLectura = cita.origen === 'agente';

  const mapaEmbedUrl = buildGoogleMapsEmbedUrl(cita.direccion);
  const mapaEnlaceUrl = buildGoogleMapsSearchUrl(cita.direccion);

  // Cliente = nombre COMERCIAL (razón social) de la empresa visitada; Persona de contacto =
  // el individuo (lo que antes ocupaba la única fila "Cliente"). Si no hay razón social
  // registrada, `clienteComercial` ya cae al nombre de la persona (back), así que ambas
  // filas coinciden — no se oculta ninguna, evita un salto de layout entre citas.
  // Cita PERSONAL sin cliente vinculado (visita médica, comida, recado…): `cita.cliente`
  // llega vacío — se omiten ambas filas en vez de mostrar "Cliente:" en blanco.
  const campos: [string, string][] = [
    ...(cita.cliente ? ([['Cliente', cita.clienteComercial || cita.cliente], ['Persona de contacto', cita.cliente]] as [string, string][]) : []),
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
        {!soloLectura && <Button onClick={onIrAgenda}>{irAgendaLabel}</Button>}
      </>}>
      <dl className="divide-y divide-[var(--line)] text-sm">
        {campos.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[110px_1fr] gap-3 py-2">
            <dt className="text-[11px] font-bold uppercase tracking-wider text-[var(--acc)]">{label}</dt>
            <dd className="break-words whitespace-pre-wrap text-[var(--panel-text)]">
              {value}
              {/* Pin junto a la Dirección (paridad con la ficha de cliente): abre
                  Google Maps en pestaña nueva. Solo si hay dirección. */}
              {label === 'Dirección' && mapaEnlaceUrl && (
                <a href={mapaEnlaceUrl} target="_blank" rel="noopener noreferrer"
                  className="row-action edit ml-2 inline-flex items-center align-middle"
                  title="Abrir dirección en Google Maps" aria-label="Abrir dirección en Google Maps">
                  <MapPin className="h-4 w-4" />
                </a>
              )}
            </dd>
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
        {soloLectura ? (
          <>
            <p className="whitespace-pre-wrap rounded-md border border-[var(--line)] px-3 py-2 text-sm text-[var(--panel-text)]">
              {cita.notes || <span className="text-[var(--panel-muted)]">Sin anotaciones.</span>}
            </p>
            <p className="mt-2 text-xs text-[var(--panel-muted)]">
              Reserva tomada por tu asistente. Se muestra aquí, pero se gestiona desde el asistente.
            </p>
          </>
        ) : (
          <>
            <textarea className="opera-control" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Añade una anotación sobre esta cita…" />
            {/* El pin de ubicación ahora vive junto a la fila "Dirección" de la ficha;
                aquí solo queda el botón de guardar. */}
            <div className="mt-2 flex items-center justify-end">
              <Button variant="outline" onClick={() => onSave(notes)}>Guardar anotación</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
