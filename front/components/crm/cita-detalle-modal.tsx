'use client';
import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/primitives';
import type { Cita } from '@/lib/mock/data';

export type CitaConNotas = Cita & { notes?: string | null };

// Modal de detalle de cita desde el widget Agenda (Inicio) — crm-citas-ux-agenda WU5.
// Patrón visual del ContactInfoModal de agents-agency (dl/dt/dd + ✕ rotatorio, ver
// ui/modal.tsx + globals.css .opera-modal-close) con los tokens del CRM. Las
// "anotaciones" viven en Booking.notes (texto libre, sin migración — ver decisiones
// de crm-citas-ux-agenda/proposal.md).
export function CitaDetalleModal({ cita, onClose, onSave, onIrAgenda }: {
  cita: CitaConNotas | null;
  onClose: () => void;
  onSave: (notes: string) => void;
  onIrAgenda: () => void;
}) {
  const [notes, setNotes] = useState('');

  useEffect(() => { setNotes(cita?.notes ?? ''); }, [cita]);

  if (!cita) return null;

  const campos: [string, string][] = [
    ['Cliente', cita.cliente],
    ['Servicio', cita.servicio],
    ['Profesional', cita.empleado || '—'],
    ['Fecha', cita.fecha],
    ['Hora', cita.hora],
    ['Estado', cita.estado],
  ];

  return (
    <Modal open title="Detalle de cita" onClose={onClose}
      footer={<>
        <Button variant="outline" onClick={onClose}>Cerrar</Button>
        <Button onClick={onIrAgenda}>Ir a agenda</Button>
      </>}>
      <dl className="divide-y divide-[var(--line)] text-sm">
        {campos.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[110px_1fr] gap-3 py-2">
            <dt className="text-[11px] font-bold uppercase tracking-wider text-[var(--acc)]">{label}</dt>
            <dd className="break-words whitespace-pre-wrap text-[var(--panel-text)]">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4">
        <label className="opera-label">Anotaciones</label>
        <textarea className="opera-control" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder="Añade una anotación sobre esta cita…" />
        <div className="mt-2 flex justify-end">
          <Button variant="outline" onClick={() => onSave(notes)}>Guardar anotación</Button>
        </div>
      </div>
    </Modal>
  );
}
