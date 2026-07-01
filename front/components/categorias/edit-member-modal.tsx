'use client';
import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/primitives';
import { ImageCell } from '@/components/ui/image-cell';
import { SPORT_POSITIONS, STAFF_ROLES, type DeporteType } from '@/lib/config/sport-positions';

export interface EditMemberTarget {
  id: string;
  isStaff: boolean;
  nombre: string;
  apellido?: string | null;
  imagenUrl?: string | null;
  posicion?: string | null;
  dorsal?: string | null;
  activoDesde?: string | null;
}

export interface EditMemberValues {
  posicion: string;
  dorsal: string;
  activoDesde: string;
}

function initiales(nombre: string, apellido?: string | null): string {
  return ((nombre[0] ?? '') + (apellido?.[0] ?? '')).toUpperCase() || '?';
}

/** Modal de edición de un miembro: foto, posición/rol, dorsal y fecha de alta. */
export function EditMemberModal({
  open,
  target,
  deporte,
  onSubmit,
  onUploaded,
  onClose,
}: {
  open: boolean;
  target: EditMemberTarget | null;
  deporte: DeporteType;
  onSubmit: (values: EditMemberValues) => void;
  onUploaded: (url: string) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState<EditMemberValues>({ posicion: '', dorsal: '', activoDesde: '' });

  useEffect(() => {
    if (!open || !target) return;
    setValues({
      posicion: target.posicion ?? '',
      dorsal: target.dorsal ?? '',
      activoDesde: target.activoDesde ? target.activoDesde.slice(0, 10) : '',
    });
  }, [open, target]);

  if (!target) return null;

  const positions = target.isStaff ? STAFF_ROLES : SPORT_POSITIONS[deporte];

  return (
    <Modal
      open={open}
      title="Editar miembro"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => onSubmit(values)}>Guardar</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <ImageCell
            kind={target.isStaff ? 'employee' : 'customer'}
            id={target.id}
            imagenUrl={target.imagenUrl}
            enabled
            shape="circle"
            size={64}
            initials={initiales(target.nombre, target.apellido)}
            onUploaded={onUploaded}
          />
          <p className="text-sm text-white">{target.nombre} {target.apellido ?? ''}</p>
        </div>

        <div className="opera-field">
          <label className="opera-label">{target.isStaff ? 'Rol de staff' : 'Posición'}</label>
          {positions ? (
            <select
              className="opera-control"
              value={values.posicion}
              onChange={(e) => setValues((v) => ({ ...v, posicion: e.target.value }))}
            >
              <option value="">— Sin asignar —</option>
              {positions.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              className="opera-control"
              value={values.posicion}
              onChange={(e) => setValues((v) => ({ ...v, posicion: e.target.value }))}
            />
          )}
        </div>

        {!target.isStaff && (
          <div className="opera-field">
            <label className="opera-label">Dorsal</label>
            <input
              type="text"
              className="opera-control"
              value={values.dorsal}
              onChange={(e) => setValues((v) => ({ ...v, dorsal: e.target.value }))}
            />
          </div>
        )}

        <div className="opera-field">
          <label className="opera-label">Fecha de alta</label>
          <input
            type="date"
            className="opera-control"
            value={values.activoDesde}
            onChange={(e) => setValues((v) => ({ ...v, activoDesde: e.target.value }))}
          />
        </div>
      </div>
    </Modal>
  );
}
