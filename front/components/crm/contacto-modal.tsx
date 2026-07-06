'use client';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/primitives';
import type { ContactoForm, ContactoTipo } from './contactos-lista';

const inputClass =
  'w-full rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm text-white placeholder:text-[var(--panel-muted)]';
const labelClass = 'mb-1.5 block text-xs text-[var(--panel-muted)]';

export interface ContactoFormModalProps {
  open: boolean;
  editing: boolean;
  form: ContactoForm;
  setForm: (f: ContactoForm) => void;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSave: () => void;
}

/** Modal de alta / edición de contacto. Paridad de campos con Agents Agency (WU4). */
export function ContactoFormModal({ open, editing, form, setForm, saving, error, onClose, onSave }: ContactoFormModalProps) {
  return (
    <Modal
      open={open}
      title={editing ? 'Editar contacto' : 'Nuevo contacto'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={onSave} disabled={saving || !form.nombre.trim()}>
            {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear contacto'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="contacto-tipo">Tipo</label>
          <select
            id="contacto-tipo"
            className={inputClass}
            value={form.tipo}
            onChange={(e) => setForm({ ...form, tipo: e.target.value as ContactoTipo })}
          >
            <option value="prospecto">Prospecto</option>
            <option value="lead">Lead</option>
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="contacto-nombre">Nombre *</label>
          <input id="contacto-nombre" className={inputClass} value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
        </div>
        <div>
          <label className={labelClass} htmlFor="contacto-telefono">Teléfono</label>
          <input id="contacto-telefono" type="tel" className={inputClass} value={form.telefono}
            onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
        </div>
        <div>
          <label className={labelClass} htmlFor="contacto-email">Email</label>
          <input id="contacto-email" type="email" className={inputClass} value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div>
          <label className={labelClass} htmlFor="contacto-sector">Sector</label>
          <input id="contacto-sector" className={inputClass} value={form.sector}
            onChange={(e) => setForm({ ...form, sector: e.target.value })} />
        </div>
        {/* Dirección estructurada (crm-operaos 9.2): calle → número → piso → código postal. */}
        <div>
          <label className={labelClass} htmlFor="contacto-direccion">Dirección (calle)</label>
          <input id="contacto-direccion" className={inputClass} value={form.direccion}
            onChange={(e) => setForm({ ...form, direccion: e.target.value })} />
        </div>
        <div>
          <label className={labelClass} htmlFor="contacto-numero">Número</label>
          <input id="contacto-numero" className={inputClass} value={form.numero}
            onChange={(e) => setForm({ ...form, numero: e.target.value })} />
        </div>
        <div>
          <label className={labelClass} htmlFor="contacto-piso">Piso</label>
          <input id="contacto-piso" className={inputClass} value={form.piso}
            onChange={(e) => setForm({ ...form, piso: e.target.value })} />
        </div>
        <div>
          <label className={labelClass} htmlFor="contacto-cp">Código postal</label>
          <input id="contacto-cp" className={inputClass} value={form.codigoPostal}
            onChange={(e) => setForm({ ...form, codigoPostal: e.target.value })} />
        </div>
      </div>
      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
    </Modal>
  );
}
