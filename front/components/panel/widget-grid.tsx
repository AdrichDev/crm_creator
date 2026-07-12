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
import { ContactosNuevosWidget } from './widgets/contactos-nuevos-widget';
import { VisitasComercialWidget } from './widgets/visitas-comercial-widget';
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
    case 'contactos-nuevos': return <ContactosNuevosWidget />;
    case 'visitas-comercial': return <VisitasComercialWidget />;
    case 'ventas-hoy': return <VentasHoyWidget />;
    case 'facturacion-pendiente': return <FacturacionWidget />;
    case 'vacaciones-pendientes': return <VacacionesWidget />;
    case 'ocupacion-semana': return <OcupacionSemanaWidget />;
    default: return null; // accesos rápidos se renderizan como tile-enlace (abajo), no aquí
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
        // Atajo de acceso rápido: el tile entero enlaza al módulo (icono + nombre + descripción).
        if (w.kind === 'acceso' && href) {
          return (
            <Link
              key={w.id}
              href={href}
              title={`Abrir ${w.label}`}
              className={`widget-tile widget-${w.size} group flex items-center gap-3 no-underline`}
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/5 text-[var(--acc)]">
                <Icon name={w.icon} className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-white">{w.label}</span>
                <span className="block truncate text-xs text-[var(--panel-muted)]">{w.description}</span>
              </span>
              <ArrowUpRight className="h-4 w-4 shrink-0 text-[var(--panel-muted)] transition group-hover:text-[var(--acc)]" />
            </Link>
          );
        }
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
