'use client';
import { useCollection, type WithId } from '@/lib/data/use-collection';
import { MODULE_MAP, type ModuleId } from '@/lib/config/modules';
import { servicios, empleados, fichajes, productos, pedidos, campanas } from '@/lib/mock/data';
import { WidgetShell } from './widget-shell';

type Row = WithId & Record<string, unknown>;

interface SummaryCfg {
  /** Clave de colección (useCollection) — misma que usa la página del módulo. */
  key: string;
  /** Seed mock (fallback local; en remoto arranca vacío y refresca del backend). */
  seed: Row[];
  /** Palabra para el contador ("12 servicios"). */
  unit: string;
  /** Campo a mostrar en la lista corta de ejemplos. */
  nameField: string;
}

// Resumen "glanceable" de cada módulo que no tiene widget de datos propio. Reusa
// la MISMA colección que la página del módulo (useCollection(key)), de modo que
// el contador queda sincronizado con los datos reales del backend/tenant.
const CONFIG: Partial<Record<ModuleId, SummaryCfg>> = {
  servicios: { key: 'servicios', seed: servicios as unknown as Row[], unit: 'servicios', nameField: 'nombre' },
  empleados: { key: 'empleados', seed: empleados as unknown as Row[], unit: 'empleados', nameField: 'nombre' },
  fichaje: { key: 'fichaje', seed: fichajes as unknown as Row[], unit: 'fichajes', nameField: 'empleado' },
  productos: { key: 'productos', seed: productos as unknown as Row[], unit: 'productos', nameField: 'nombre' },
  pedidos: { key: 'pedidos', seed: pedidos as unknown as Row[], unit: 'presupuestos', nameField: 'numero' },
  marketing: { key: 'marketing', seed: campanas as unknown as Row[], unit: 'campañas', nameField: 'nombre' },
};

const MAX_PREVIEW = 3;

export function ModuleSummaryWidget({ moduleId }: { moduleId: ModuleId }) {
  const mod = MODULE_MAP[moduleId];
  const cfg = CONFIG[moduleId];
  // Los hooks deben ejecutarse siempre → colección vacía si el módulo no está mapeado.
  const { items } = useCollection<Row>(cfg?.key ?? moduleId, cfg?.seed ?? []);

  if (!cfg) {
    return (
      <WidgetShell icon={mod.icon} label={mod.defaultLabel}>
        <p className="text-xs text-[var(--panel-muted)]">Sin datos.</p>
      </WidgetShell>
    );
  }

  const preview = items.slice(0, MAX_PREVIEW);
  const nameOf = (r: Row) => String(r[cfg.nameField] ?? '—');

  return (
    <WidgetShell icon={mod.icon} label={mod.defaultLabel}>
      <p className="text-2xl font-bold leading-none text-white">
        {items.length}
        <span className="ml-1 text-xs font-normal text-[var(--panel-muted)]">{cfg.unit}</span>
      </p>
      {preview.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {preview.map((r) => (
            <li key={String(r.id)} className="truncate text-xs text-[var(--panel-muted)]">
              {nameOf(r)}
            </li>
          ))}
        </ul>
      )}
    </WidgetShell>
  );
}
