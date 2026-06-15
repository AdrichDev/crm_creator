import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-2xl border border-gray-200 bg-white shadow-sm', className)}>{children}</div>;
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('p-5', className)}>{children}</div>;
}

export function Badge({ children, tone = 'gray' }: { children: ReactNode; tone?: 'gray' | 'green' | 'amber' | 'red' | 'blue' | 'brand' }) {
  const tones: Record<string, string> = {
    gray: 'bg-gray-100 text-gray-700',
    green: 'bg-green-100 text-green-700',
    amber: 'bg-amber-100 text-amber-800',
    red: 'bg-red-100 text-red-700',
    blue: 'bg-blue-100 text-blue-700',
    brand: 'bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]',
  };
  return <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', tones[tone])}>{children}</span>;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <Card>
      <CardBody className="p-4">
        <p className="text-sm text-gray-500">{label}</p>
        <p className="mt-1 font-display text-2xl font-semibold text-gray-900">{value}</p>
        {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
      </CardBody>
    </Card>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-semibold text-gray-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              {head.map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">{children}</tbody>
        </table>
      </div>
    </Card>
  );
}

export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn('px-4 py-3 text-gray-700', className)}>{children}</td>;
}

export function Button({ children, variant = 'primary', onClick, type = 'button', className, disabled }:
  { children: ReactNode; variant?: 'primary' | 'ghost' | 'outline'; onClick?: () => void; type?: 'button' | 'submit'; className?: string; disabled?: boolean }) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition disabled:opacity-50';
  const variants: Record<string, string> = {
    primary: 'bg-[var(--brand-primary)] text-white hover:opacity-90',
    outline: 'border border-gray-300 text-gray-700 hover:bg-gray-50',
    ghost: 'text-gray-600 hover:bg-gray-100',
  };
  return <button type={type} onClick={onClick} disabled={disabled} className={cn(base, variants[variant], className)}>{children}</button>;
}

export function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={() => onChange(!checked)}
      className={cn('relative h-6 w-11 rounded-full transition', checked ? 'bg-[var(--brand-primary)]' : 'bg-gray-300', disabled && 'opacity-50')}
      aria-pressed={checked}>
      <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white transition', checked ? 'left-[22px]' : 'left-0.5')} />
    </button>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <Card><CardBody className="py-16 text-center">
      <p className="text-gray-700 font-medium">{title}</p>
      {hint && <p className="mt-1 text-sm text-gray-400">{hint}</p>}
    </CardBody></Card>
  );
}

export function RowActions({ onEdit, onDelete }: { onEdit?: () => void; onDelete?: () => void }) {
  return (
    <div className="flex justify-end gap-1">
      {onEdit && <button onClick={onEdit} className="rounded-lg px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100">Editar</button>}
      {onDelete && <button onClick={onDelete} className="rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50">Eliminar</button>}
    </div>
  );
}
