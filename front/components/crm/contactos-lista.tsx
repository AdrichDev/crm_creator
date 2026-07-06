'use client';
import { Td, Badge, IconButton } from '@/components/ui/primitives';
import { Info, Pencil, Trash2 } from 'lucide-react';

// Tipos y constantes de la agenda de contactos (paridad Agents Agency, crm-operaos WU4).
export type ContactoTipo = 'lead' | 'prospecto';
export type ContactadoEstado = 'si' | 'no' | 'nc';

export interface ContactoRow {
  id: string;
  codigo: string;
  tipo: ContactoTipo;
  nombre: string;
  telefono: string | null;
  email: string | null;
  sector: string | null;
  direccion: string | null;
  // Dirección estructurada (crm-operaos 9.2). Opcionales: filas antiguas no los tienen.
  numero?: string | null;
  piso?: string | null;
  codigoPostal?: string | null;
  localidad?: string | null;
  peticion: string | null;
  contactado: ContactadoEstado;
  contactadoEn?: string | null;
  createdAt: string;
}

export interface ContactoForm {
  tipo: ContactoTipo;
  nombre: string;
  telefono: string;
  email: string;
  sector: string;
  direccion: string;
  numero: string;
  piso: string;
  codigoPostal: string;
  localidad: string;
}

export const EMPTY_FORM: ContactoForm = {
  tipo: 'prospecto', nombre: '', telefono: '', email: '', sector: '', direccion: '',
  numero: '', piso: '', codigoPostal: '', localidad: '',
};

// Semilla del modo generador (localStorage) — compartida entre /contactos y el
// widget "Contactos nuevos" del inicio. En modo API arranca vacío y trae datos reales.
export const CONTACTOS_SEED: ContactoRow[] = [
  { id: 'c-seed-1', codigo: 'pc-01', tipo: 'lead', nombre: 'Marta Ibáñez', telefono: '600111222', email: 'marta@example.com', sector: 'Retail', direccion: 'Calle Mayor 1', peticion: 'Solicita presupuesto', contactado: 'no', createdAt: new Date().toISOString() },
  { id: 'c-seed-2', codigo: 'pc-02', tipo: 'prospecto', nombre: 'Diego Serrano', telefono: '600333444', email: 'diego@example.com', sector: 'Hostelería', direccion: 'Av. del Sol 22', peticion: null, contactado: 'si', createdAt: new Date(Date.now() - 86400000).toISOString() },
];

// Ciclo del estado de contacto al pulsar el badge: NC → Sí → No → NC.
export const CONTACTADO_CYCLE: Record<ContactadoEstado, ContactadoEstado> = { nc: 'si', si: 'no', no: 'nc' };
export const CONTACTADO_LABELS: Record<ContactadoEstado, string> = { si: 'Sí', no: 'No', nc: 'NC' };
const CONTACTADO_TONE: Record<ContactadoEstado, 'green' | 'red' | 'gray'> = { si: 'green', no: 'red', nc: 'gray' };

export function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

/** Coincidencia de día calendario exacto entre un ISO datetime y un input `type="date"` (YYYY-MM-DD). */
export function isSameCalendarDay(iso: string, fecha: string): boolean {
  if (!fecha) return true;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const [y, m, day] = fecha.split('-').map(Number);
  return d.getFullYear() === y && d.getMonth() + 1 === m && d.getDate() === day;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export const CONTACTOS_HEAD = (selectionMode: boolean): string[] => [
  ...(selectionMode ? [''] : []),
  'Código', 'Tipo', 'Nombre', 'Teléfono', 'Email', 'Sector', 'Contactado', 'Fecha de alta', 'Acciones',
];

export interface ContactosListaProps {
  rows: ContactoRow[];
  puedeEditar: boolean;
  selectionMode: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onCycleContactado: (c: ContactoRow) => void;
  onInfo: (c: ContactoRow) => void;
  onEdit: (c: ContactoRow) => void;
  onDelete: (c: ContactoRow) => void;
}

export function ContactosLista({
  rows, puedeEditar, selectionMode, selectedIds,
  onToggleSelect, onCycleContactado, onInfo, onEdit, onDelete,
}: ContactosListaProps) {
  return (
    <>
      {rows.map((c) => {
        const isNewToday = c.contactado !== 'si' && isToday(c.createdAt);
        return (
          <tr key={c.id}>
            {selectionMode && (
              <Td className="text-center">
                <input
                  type="checkbox"
                  className="w-4 h-4 cursor-pointer accent-[var(--acc)]"
                  checked={selectedIds.has(c.id)}
                  onChange={() => onToggleSelect(c.id)}
                  aria-label={`Seleccionar ${c.nombre}`}
                />
              </Td>
            )}
            <Td className="font-mono text-xs text-[var(--acc)]">{c.codigo}</Td>
            <Td><Badge tone={c.tipo === 'lead' ? 'blue' : 'brand'}>{c.tipo === 'lead' ? 'Lead' : 'Prospecto'}</Badge></Td>
            <Td className="font-medium text-white">
              <span className="inline-flex items-center gap-2">
                {c.nombre}
                {isNewToday && (
                  <span
                    title="Nuevo hoy — pendiente de contactar"
                    className="grid h-[18px] w-[18px] place-items-center rounded-full bg-yellow-400 text-[10px] font-black leading-none text-black"
                  >N</span>
                )}
              </span>
            </Td>
            <Td>{c.telefono || '—'}</Td>
            <Td>{c.email || '—'}</Td>
            <Td>{c.sector || '—'}</Td>
            <Td className="text-center">
              <button
                type="button"
                onClick={() => puedeEditar && onCycleContactado(c)}
                disabled={!puedeEditar}
                title="Clic para cambiar el estado (Sí → No → NC)"
                className="cursor-pointer border-0 bg-transparent p-0 disabled:cursor-default"
              >
                <Badge tone={CONTACTADO_TONE[c.contactado] ?? 'gray'}>{CONTACTADO_LABELS[c.contactado] ?? 'NC'}</Badge>
              </button>
            </Td>
            <Td className="tabular-nums">{formatDateTime(c.createdAt)}</Td>
            <Td>
              <div className="flex items-center justify-end gap-2">
                <IconButton tone="view" title="Ver información" onClick={() => onInfo(c)}><Info className="h-4 w-4" /></IconButton>
                {puedeEditar && (
                  <>
                    <IconButton tone="edit" title="Editar" onClick={() => onEdit(c)}><Pencil className="h-4 w-4" /></IconButton>
                    <IconButton tone="delete" title="Eliminar" onClick={() => onDelete(c)}><Trash2 className="h-4 w-4" /></IconButton>
                  </>
                )}
              </div>
            </Td>
          </tr>
        );
      })}
    </>
  );
}
