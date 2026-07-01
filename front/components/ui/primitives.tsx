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

type Tone = 'gray' | 'green' | 'amber' | 'red' | 'blue' | 'brand';
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

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="panel">
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>{head.map((h, i) => <th key={h || i}>{h}</th>)}</tr>
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

/** Botón de acción con icono para celdas de tabla (ver/editar/eliminar). `danger` lo tematiza en rojo. */
export function IconButton({ title, onClick, danger, className, children }:
  { title: string; onClick?: () => void; danger?: boolean; className?: string; children: ReactNode }) {
  return (
    <button type="button" title={title} onClick={onClick}
      className={cn(ICON_BTN_BASE, danger && 'hover:!border-red-500/60 hover:!text-red-400', className)}>
      {children}
    </button>
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
