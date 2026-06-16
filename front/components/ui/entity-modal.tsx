'use client';
import { useEffect, useState } from 'react';
import { Modal } from './modal';
import { Button } from './primitives';

export type FieldType = 'text' | 'number' | 'email' | 'date' | 'time' | 'select' | 'textarea';
export interface Field {
  name: string;
  label: string;
  type?: FieldType;
  options?: string[];
  required?: boolean;
  placeholder?: string;
  step?: string;
}

type Values = Record<string, string | number>;

export function EntityModal({ open, title, fields, initial, onSubmit, onClose }: {
  open: boolean;
  title: string;
  fields: Field[];
  initial?: Values | null;
  onSubmit: (values: Values) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Values>({});

  useEffect(() => {
    if (!open) return;
    const base: Values = {};
    for (const f of fields) base[f.name] = initial?.[f.name] ?? (f.type === 'number' ? 0 : '');
    setValues(base);
  }, [open, initial, fields]);

  function set(name: string, raw: string, type?: FieldType) {
    setValues((v) => ({ ...v, [name]: type === 'number' ? (raw === '' ? '' : Number(raw)) : raw }));
  }

  function submit() {
    for (const f of fields) {
      if (f.required && (values[f.name] === '' || values[f.name] === undefined)) {
        alert(`Completa el campo "${f.label}"`);
        return;
      }
    }
    onSubmit(values);
  }

  return (
    <Modal open={open} title={title} onClose={onClose}
      footer={<>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button onClick={submit}>Guardar</Button>
      </>}>
      <div className="space-y-3">
        {fields.map((f) => (
          <div key={f.name} className="opera-field">
            <label className="opera-label">{f.label}{f.required && ' *'}</label>
            {f.type === 'select' ? (
              <select value={String(values[f.name] ?? '')} onChange={(e) => set(f.name, e.target.value)}
                className="opera-control">
                <option value="">—</option>
                {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : f.type === 'textarea' ? (
              <textarea value={String(values[f.name] ?? '')} onChange={(e) => set(f.name, e.target.value)} rows={3}
                placeholder={f.placeholder} className="opera-control" />
            ) : (
              <input type={f.type ?? 'text'} step={f.step} value={String(values[f.name] ?? '')}
                placeholder={f.placeholder} onChange={(e) => set(f.name, e.target.value, f.type)}
                className="opera-control" />
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}
