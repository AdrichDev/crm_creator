'use client';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Icon } from '@/components/ui/icon';
import { activeDashboardWidgets, type WidgetId } from '@/lib/config/dashboard-widgets';
import { MODULE_MAP, type ModuleId } from '@/lib/config/modules';
import { AgendaWidget } from './widgets/agenda-widget';
import { KpisWidget } from './widgets/kpis-widget';
import { ProximosWidget } from './widgets/proximos-widget';
import { CategoriasWidget } from './widgets/categorias-widget';
import { ClientesNuevosWidget } from './widgets/clientes-nuevos-widget';
import { VentasHoyWidget } from './widgets/ventas-hoy-widget';
import { FacturacionWidget } from './widgets/facturacion-widget';
import { VacacionesWidget } from './widgets/vacaciones-widget';
import { OcupacionSemanaWidget } from './widgets/ocupacion-semana-widget';

function WidgetBody({ id }: { id: WidgetId }) {
  switch (id) {
    case 'agenda': return <AgendaWidget />;
    case 'kpis-hoy': return <KpisWidget />;
    case 'proximos-eventos': return <ProximosWidget />;
    case 'categorias': return <CategoriasWidget />;
    case 'clientes-nuevos': return <ClientesNuevosWidget />;
    case 'ventas-hoy': return <VentasHoyWidget />;
    case 'facturacion-pendiente': return <FacturacionWidget />;
    case 'vacaciones-pendientes': return <VacacionesWidget />;
    case 'ocupacion-semana': return <OcupacionSemanaWidget />;
  }
}

interface WidgetGridProps {
  selected: WidgetId[];
  modules: Record<ModuleId, boolean>;
}

/** Mosaico de widgets favoritos del inicio (estilo widget de móvil), tamaño fijo por catálogo. */
export function WidgetGrid({ selected, modules }: WidgetGridProps) {
  const widgets = activeDashboardWidgets(selected, modules);

  if (widgets.length === 0) {
    return (
      <div className="widget-empty">
        <Icon name="LayoutGrid" className="h-6 w-6 text-[var(--panel-muted)]" />
        <p className="text-sm text-[var(--panel-muted)]">Todavía no has elegido widgets para el inicio.</p>
        <Link href="/configuracion" className="text-sm text-[var(--acc)] hover:underline">
          Elegir widgets en Configuración →
        </Link>
      </div>
    );
  }

  return (
    <div className="widget-grid">
      {widgets.map((w) => {
        const href = w.dependsOn ? MODULE_MAP[w.dependsOn]?.href : undefined;
        return (
          <div key={w.id} className={`widget-tile widget-${w.size}`}>
            {href && (
              <Link href={href} className="widget-tile-open" title={`Abrir ${w.label}`} aria-label={`Abrir ${w.label}`}>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            )}
            <WidgetBody id={w.id} />
          </div>
        );
      })}
    </div>
  );
}
