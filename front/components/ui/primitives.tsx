'use client';
import { useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useRole } from '@/lib/tenant-config-context';
import { canWrite, moduleFromPath } from '@/lib/config/roles';

/**
 * Hook personalizado para determinar si el usuario actual tiene permisos de escritura
 * en el módulo correspondiente a la ruta (URL) actual.
 *
 * Utiliza el pathname y el rol del contexto de configuración del tenant para verificar
 * la política de permisos mediante la función `canWrite`.
 *
 * @returns {boolean} `true` si el usuario tiene acceso de escritura (o si la ruta no tiene módulo asociado), `false` en caso contrario.
 */
export function useWriteAccess(): boolean {
  const pathname = usePathname();
  const { role } = useRole();
  const mod = moduleFromPath(pathname || '');
  if (!mod) return true;
  return canWrite(role, mod);
}

interface CardProps {
  children: ReactNode;
  className?: string;
}

/**
 * Componente contenedor básico con bordes redondeados, borde sutil y fondo oscuro.
 * Se utiliza para estructurar tarjetas físicas y bloques lógicos en los paneles del CRM.
 *
 * @param {CardProps} props - Propiedades del componente.
 */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-[10px] border border-white/5 bg-[var(--panel-card)]', className)}>{children}</div>;
}

/**
 * Componente contenedor interno para añadir padding estándar a las tarjetas (`Card`).
 *
 * @param {{ children: ReactNode; className?: string }} props - Propiedades del componente.
 */
export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('p-5', className)}>{children}</div>;
}

export type Tone = 'gray' | 'green' | 'amber' | 'red' | 'blue' | 'brand';

/**
 * Componente para mostrar etiquetas de estado de forma compacta y visual.
 * Mapea tonos de color semánticos a clases CSS específicas del tema.
 *
 * @param {{ children: ReactNode; tone?: Tone }} props - Propiedades del componente.
 */
export function Badge({ children, tone = 'gray' }: { children: ReactNode; tone?: Tone }) {
  const map: Record<Tone, string> = {
    gray: 'tone-gray', green: 'tone-green', amber: 'tone-amber',
    red: 'tone-red', blue: 'tone-blue', brand: 'tone-gold',
  };
  return <span className={cn('status-badge', map[tone])}>{children}</span>;
}

/**
 * Tarjeta de KPI/Estadísticas individuales.
 * Muestra un título (label), un valor destacado (value) y opcionalmente un texto secundario de ayuda (hint).
 *
 * @param {{ label: string; value: ReactNode; hint?: string; accent?: boolean }} props - Propiedades del componente.
 */
export function Stat({ label, value, hint, accent }: { label: string; value: ReactNode; hint?: string; accent?: boolean }) {
  return (
    <div className="kpi-card">
      <p className="label">{label}</p>
      <p className={cn('value', accent && 'accent')}>{value}</p>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

/**
 * Cabecera estándar para páginas del panel de control.
 * Muestra el título principal de la sección, un subtítulo descriptivo opcional
 * y un componente de acción (ej. un botón de crear) condicionado al acceso de escritura del usuario.
 *
 * @param {{ title: string; subtitle?: string; action?: ReactNode }} props - Propiedades del componente.
 */
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

/**
 * Componente Tabla de datos estructurada con soporte opcional de ordenación interactiva.
 * Genera la estructura HTML `<table>` clásica con estilos unificados del CRM.
 * Las celdas de cabecera que incluyen `sortKey` se renderizan como botones interactivos
 * para cambiar el orden de los datos.
 *
 * @param {{ head: TableHeadCell[]; children: ReactNode; sort?: TableSort }} props - Propiedades del componente.
 */
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

/**
 * Componente celda estándar de tabla (`<td>`), envoltorio directo con soporte de clases condicionales.
 *
 * @param {{ children: ReactNode; className?: string }} props - Propiedades del componente.
 */
export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn(className)}>{children}</td>;
}

/**
 * Componente Botón básico.
 * Soporta variantes preestablecidas: `primary` (acción principal), `outline` (secundario con borde)
 * y `ghost` (sin fondo ni borde, sutil).
 *
 * @param {{ children: ReactNode; variant?: 'primary' | 'ghost' | 'outline'; onClick?: () => void; type?: 'button' | 'submit'; className?: string; disabled?: boolean }} props - Propiedades del componente.
 */
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

export type IconButtonTone = 'view' | 'edit' | 'delete';
const ICON_BTN_TONE: Record<IconButtonTone, string> = {
  view: 'border-[rgba(234,179,8,0.4)] bg-[rgba(234,179,8,0.1)] text-[#facc15] hover:bg-[rgba(234,179,8,0.2)]',
  edit: 'border-[rgba(6,182,212,0.4)] bg-[rgba(6,182,212,0.1)] text-[#00f0ff] hover:bg-[rgba(6,182,212,0.2)]',
  delete: 'border-[rgba(239,68,68,0.4)] bg-[rgba(239,68,68,0.1)] text-[#f87171] hover:bg-[rgba(239,68,68,0.2)]',
};

/**
 * Botón con icono, ideal para celdas de acción en tablas.
 * Soporta tonos específicos (`view`, `edit`, `delete`) alineados con la UI del CRM de `agents-agency`
 * para dar un feedback de color coherente.
 *
 * @param {{ title: string; ariaLabel?: string; onClick?: () => void; danger?: boolean; tone?: IconButtonTone; className?: string; children: ReactNode }} props - Propiedades del componente.
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

// Chip neutro cuando el estado no tiene color asignado en `colors`.
const CHIP_NEUTRAL = 'bg-white/10 text-white';
const optionColor = (chip?: string): string =>
  chip?.split(' ').find((c) => c.startsWith('text-')) ?? 'text-white';

/**
 * Selector de estado renderizado con aspecto de CHIP de color interactivo.
 * Se utiliza de forma unificada en el CRM (ej. en listados de Presupuestos y Facturas).
 * Permite interceptar el cambio de estado mediante un callback de confirmación `onBeforeChange`
 * (si este resuelve `false`, el selector revierte su valor automáticamente).
 *
 * @param {{ value: string; options: readonly string[]; onChange: (v: string) => void; onBeforeChange?: (next: string) => boolean | Promise<boolean>; colors?: Record<string, string>; disabled?: boolean; title?: string; ariaLabel?: string }} props - Propiedades del componente.
 */
export function EstadoSelect({ value, options, onChange, onBeforeChange, colors, disabled, title, ariaLabel = 'Estado' }:
  {
    value: string; options: readonly string[]; onChange: (v: string) => void;
    onBeforeChange?: (next: string) => boolean | Promise<boolean>;
    colors?: Record<string, string>;
    disabled?: boolean; title?: string; ariaLabel?: string;
  }) {
  const [nonce, setNonce] = useState(0);
  const chip = colors?.[value] ?? CHIP_NEUTRAL;

  async function handleChange(next: string) {
    if (next === value) return;
    if (onBeforeChange) {
      const ok = await onBeforeChange(next);
      if (!ok) { setNonce((n) => n + 1); return; } // cancelado → revierte el chip al valor real
    }
    onChange(next);
  }

  return (
    <select
      key={nonce}
      className={cn(
        'estado-chip appearance-none rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider cursor-pointer text-center outline-none disabled:cursor-default disabled:opacity-70',
        chip,
      )}
      style={{ textAlignLast: 'center' }}
      value={value}
      title={title}
      aria-label={ariaLabel}
      disabled={disabled}
      onChange={(e) => handleChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o} value={o} className={cn('bg-[#0b0c10]', optionColor(colors?.[o]))}>
          {o.toUpperCase()}
        </option>
      ))}
    </select>
  );
}

/**
 * Componente interruptor (Toggle / Switch) visual.
 * Muestra el estado activo en el color de acento y ofrece transiciones de deslizamiento suaves.
 *
 * @param {{ checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }} props - Propiedades del componente.
 */
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

/**
 * Componente reutilizable para indicar estados vacíos o sin resultados en listas y paneles.
 *
 * @param {{ title: string; hint?: string }} props - Propiedades del componente.
 */
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

/**
 * Componente para renderizar botones rápidos de Editar/Eliminar en el extremo derecho de una fila.
 * La visibilidad de estas acciones está controlada internamente mediante el hook `useWriteAccess()`.
 *
 * @param {{ onEdit?: () => void; onDelete?: () => void }} props - Propiedades del componente.
 */
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
