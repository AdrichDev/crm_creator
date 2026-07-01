'use client';
import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/primitives';
import { KitPreview } from './kit-preview';
import { DEPORTE_LABELS, type DeporteType } from '@/lib/config/sport-positions';

export interface TeamModalValues {
  nombre: string;
  deporte: DeporteType;
  temporada: string;
  descripcion: string;
  color: string;
  colorVisitante: string;
}

const DEPORTE_ENTRIES = Object.entries(DEPORTE_LABELS) as [DeporteType, string][];
const DEFAULT_HOME = '#1b431c';
const DEFAULT_AWAY = '#ffffff';

export function TeamModal({
  open,
  initial,
  onSubmit,
  onClose,
}: {
  open: boolean;
  initial: TeamModalValues | null;
  onSubmit: (values: TeamModalValues) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState<TeamModalValues>({
    nombre: '',
    deporte: 'OTRO',
    temporada: '',
    descripcion: '',
    color: DEFAULT_HOME,
    colorVisitante: DEFAULT_AWAY,
  });

  useEffect(() => {
    if (!open) return;
    setValues(
      initial ?? {
        nombre: '',
        deporte: 'OTRO',
        temporada: '',
        descripcion: '',
        color: DEFAULT_HOME,
        colorVisitante: DEFAULT_AWAY,
      },
    );
  }, [open, initial]);

  function set<K extends keyof TeamModalValues>(key: K, val: TeamModalValues[K]) {
    setValues((v) => ({ ...v, [key]: val }));
  }

  return (
    <Modal
      open={open}
      title={initial ? 'Editar equipo' : 'Nuevo equipo'}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => onSubmit(values)} disabled={!values.nombre.trim()}>Guardar</Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="opera-field">
          <label className="opera-label">Nombre del equipo *</label>
          <input
            className="opera-control"
            value={values.nombre}
            onChange={(e) => set('nombre', e.target.value)}
          />
        </div>

        <div className="opera-field">
          <label className="opera-label">Deporte</label>
          <select
            className="opera-control"
            value={values.deporte}
            onChange={(e) => set('deporte', e.target.value as DeporteType)}
          >
            {DEPORTE_ENTRIES.map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>

        <div className="opera-field">
          <label className="opera-label">Temporada (ej. 2024-25)</label>
          <input
            className="opera-control"
            value={values.temporada}
            onChange={(e) => set('temporada', e.target.value)}
          />
        </div>

        <div className="opera-field">
          <label className="opera-label">Descripción</label>
          <textarea
            className="opera-control"
            rows={3}
            value={values.descripcion}
            onChange={(e) => set('descripcion', e.target.value)}
          />
        </div>

        <div className="opera-field">
          <label className="opera-label">Equipación</label>
          <div className="flex items-center gap-6 rounded-lg bg-white/5 p-3">
            <div className="flex flex-col items-center gap-2">
              <KitPreview deporte={values.deporte} color={values.color} label="Local" />
              <input
                type="color"
                value={values.color}
                onChange={(e) => set('color', e.target.value)}
                className="h-8 w-12 rounded border border-white/20"
              />
            </div>
            <div className="flex flex-col items-center gap-2">
              <KitPreview deporte={values.deporte} color={values.colorVisitante} label="Visitante" />
              <input
                type="color"
                value={values.colorVisitante}
                onChange={(e) => set('colorVisitante', e.target.value)}
                className="h-8 w-12 rounded border border-white/20"
              />
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
