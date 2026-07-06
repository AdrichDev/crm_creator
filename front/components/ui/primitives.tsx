'use client';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useRole } from '@/lib/tenant-config-context';
import { canWrite, moduleFromPath } from '@/lib/config/roles';

/**
 * ¿El perfil activo puede escribir en el módulo de la ruta actual?
 * Oculta de forma centralizada los botones de crear/editar/eliminar.
 */
export function useWriteAccess(): boolean {
  const pathname = usePathname();
  const { role } = useRole();
  const mod = moduleFromPath(pathname || '');
  if (!mod) return true;
  return canWrite(role, mod);
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-[10px] border border-white/5 bg-[var(--panel-card)]', className)}>{children}</div>;
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('p-5', className)}>{children}</div>;
}

export type Tone = 'gray' | 'green' | 'amber' | 'red' | 'blue' | 'brand';
export function Badge({ children, tone = 'gray' }: { children: ReactNode; tone?: Tone }) {
  const map: Record<Tone, string> = {
    gray: 'tone-gray', green: 'tone-green', amber: 'tone-amber',
    red: 'tone-red', blue: 'tone-blue', brand: 'tone-gold',
  };
  return <span className={cn('status-badge', map[tone])}>{children}</span>;
}

export function Stat({ label, value, hint, accent }: { label: string; value: ReactNode; hint?: string; accent?: boolean }) {
  return (
    <div className="kpi-card">
      <p className="label">{label}</p>
      <p className={cn('value', accent && 'accent')}>{value}</p>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  const canW = useWriteAccess();
  return (
    <div className="panel-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="subtitle">{subtitle}</p>}
      </div>
      {canW && action}
    </div>
  );
}

// Cabecera de tabla: texto plano (no ordenable) o descriptor con `sortKey` (ordenable).
export type TableHeadCell = string | { label: string; sortKey: string };

// Estado de ordenación controlado por la página que renderiza la tabla.
export interface TableSort {
  key: string;
  dir: 'asc' | 'desc';
  onSort: (key: string) => void;
}

export function Table({ head, children, sort }: { head: TableHeadCell[]; children: ReactNode; sort?: TableSort }) {
  return (
    <div className="panel">
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              {head.map((h, i) => {
                const label = typeof h === 'string' ? h : h.label;
                const sortKey = typeof h === 'string' ? undefined : h.sortKey;
                // Columna ordenable: cabecera clicable con indicador de dirección.
                if (sort && sortKey) {
                  const active = sort.key === sortKey;
                  const ariaSort = active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
                  return (
                    <th key={label || i} aria-sort={ariaSort}>
                      <button type="button" onClick={() => sort.onSort(sortKey)}
                        aria-label={`Ordenar por ${label}`}
                        style={{ font: 'inherit', color: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit' }}
                        className="inline-flex items-center gap-1 border-0 bg-transparent p-0 cursor-pointer select-none hover:text-[var(--acc)]">
                        <span>{label}</span>
                        <span aria-hidden="true" className={cn('text-[10px]', active ? 'text-[var(--acc)]' : 'opacity-40')}>
                          {active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </button>
                    </th>
                  );
                }
                return <th key={label || i}>{label}</th>;
              })}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}

export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn(className)}>{children}</td>;
}

export function Button({ children, variant = 'primary', onClick, type = 'button', className, disabled }:
  { children: ReactNode; variant?: 'primary' | 'ghost' | 'outline'; onClick?: () => void; type?: 'button' | 'submit'; className?: string; disabled?: boolean }) {
  const variants: Record<string, string> = {
    primary: 'btn btn-primary',
    outline: 'btn btn-outline',
    ghost: 'btn btn-ghost',
  };
  return <button type={type} onClick={onClick} disabled={disabled} className={cn(variants[variant], className)}>{children}</button>;
}

const ICON_BTN_BASE = 'inline-grid place-items-center w-8 h-8 rounded-lg border border-white/10 text-[var(--panel-muted)] transition hover:text-[var(--acc)] hover:border-[var(--acc)]';

/** Tonos persistentes (no solo en hover) paridad con agents-agency icon-btn-info/edit/delete. */
export type IconButtonTone = 'view' | 'edit' | 'delete';
const ICON_BTN_TONE: Record<IconButtonTone, string> = {
  view: 'border-[rgba(234,179,8,0.4)] bg-[rgba(234,179,8,0.1)] text-[#facc15] hover:bg-[rgba(234,179,8,0.2)]',
  edit: 'border-[rgba(6,182,212,0.4)] bg-[rgba(6,182,212,0.1)] text-[#00f0ff] hover:bg-[rgba(6,182,212,0.2)]',
  delete: 'border-[rgba(239,68,68,0.4)] bg-[rgba(239,68,68,0.1)] text-[#f87171] hover:bg-[rgba(239,68,68,0.2)]',
};

/**
 * Botón de acción con icono para celdas de tabla (ver/editar/eliminar).
 * `tone` aplica los colores persistentes de agents-agency (view/edit/delete). Sin `tone`,
 * mantiene el estilo gris neutro de siempre; `danger` sigue disponible para ese caso legacy.
 */
export function IconButton({ title, ariaLabel, onClick, danger, tone, className, children }:
  { title: string; ariaLabel?: string; onClick?: () => void; danger?: boolean; tone?: IconButtonTone; className?: string; children: ReactNode }) {
  const base = tone ? 'inline-grid place-items-center w-8 h-8 rounded-lg border transition' : ICON_BTN_BASE;
  return (
    <button type="button" title={title} aria-label={ariaLabel} onClick={onClick}
      className={cn(base, tone ? ICON_BTN_TONE[tone] : danger && 'hover:!border-red-500/60 hover:!text-red-400', className)}>
      {children}
    </button>
  );
}

/**
 * Selector de estado compartido por Presupuestos y Facturas (crm 5a). Un `<select>` nativo con
 * el mismo estilo que el resto de controles (`opera-control`) cuyas opciones se muestran en
 * MAYÚSCULAS. `value` conserva el literal REAL almacenado (p. ej. `'generada'` | `'Pendiente'`)
 * y `onChange` emite ese literal para llamar a los endpoints de estado existentes
 * (PUT /pedidos/:id/status | PUT /invoices/:id/status). `disabled` deja el estado visible pero
 * no editable (rol sin escritura). Reutilizado en ambas pantallas: una sola pieza de UI.
 */
export function EstadoSelect({ value, options, onChange, disabled, title, ariaLabel = 'Estado' }:
  { value: string; options: readonly string[]; onChange: (v: string) => void; disabled?: boolean; title?: string; ariaLabel?: string }) {
  return (
    <select
      className="opera-control uppercase w-auto min-w-[9rem] cursor-pointer disabled:cursor-default disabled:opacity-70"
      value={value}
      title={title}
      aria-label={ariaLabel}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o} value={o}>{o.toUpperCase()}</option>
      ))}
    </select>
  );
}

export function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={() => onChange(!checked)}
      className={cn('relative h-6 w-11 rounded-full transition', disabled && 'opacity-50')}
      style={{ background: checked ? 'var(--acc)' : 'color-mix(in srgb, var(--panel-text) 22%, transparent)' }}
      aria-pressed={checked}>
      <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white transition', checked ? 'left-[22px]' : 'left-0.5')} />
    </button>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="panel">
      <div className="empty-state">
        <p className="font-medium text-white">{title}</p>
        {hint && <p className="mt-1 text-sm">{hint}</p>}
      </div>
    </div>
  );
}

export function RowActions({ onEdit, onDelete }: { onEdit?: () => void; onDelete?: () => void }) {
  const canW = useWriteAccess();
  if (!canW) return null;
  return (
    <div className="flex justify-end gap-1">
      {onEdit && <button onClick={onEdit} className="row-action edit">Editar</button>}
      {onDelete && <button onClick={onDelete} className="row-action danger">Eliminar</button>}
    </div>
  );
}
