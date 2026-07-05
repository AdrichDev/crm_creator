'use client';
import { useMemo, useState } from 'react';
import { ModuleGuard } from '@/components/layout/module-guard';
import { useTerm } from '@/lib/tenant-config-context';
import { PageHeader, Stat, Table, Td, Badge } from '@/components/ui/primitives';
import { useCollection } from '@/lib/data/use-collection';
import { X } from 'lucide-react';
import { aggregateStats } from '@/lib/stats/aggregate';
import { eur } from '@/lib/utils/format';
import { BarChart } from '@/components/stats/bar-chart';
import { DonutChart } from '@/components/stats/donut-chart';
import {
  citas as citasSeed, facturas as facturasSeed, ventas as ventasSeed,
  clientes as clientesSeed, servicios as serviciosSeed, productos as productosSeed,
  type Cita, type Factura, type Venta, type Cliente, type Servicio, type Producto,
} from '@/lib/mock/data';

const DONUT_COLORS = ['var(--acc)', '#6aa8ff', '#2ed573', '#d68bff', '#ff9f43', '#ff6b78', '#00d2d3'];

export default function Page() {
  const term = useTerm('estadisticas', 'Estadísticas');

  // ── Colecciones del tenant (datos reales en localStorage) ──
  const { items: citas } = useCollection<Cita>('citas', citasSeed);
  const { items: facturas } = useCollection<Factura>('facturas', facturasSeed);
  const { items: ventas } = useCollection<Venta>('ventas', ventasSeed);
  const { items: clientes } = useCollection<Cliente>('clientes', clientesSeed);
  const { items: servicios } = useCollection<Servicio>('servicios', serviciosSeed);
  const { items: productos } = useCollection<Producto>('productos', productosSeed);

  const stats = useMemo(
    () => aggregateStats({ citas, facturas, ventas, clientes, servicios, productos }),
    [citas, facturas, ventas, clientes, servicios, productos],
  );

  // ── Drilldown por mes ──
  const [drillMonth, setDrillMonth] = useState<string | null>(null);
  const drill = useMemo(() => {
    if (!drillMonth) return null;
    const cs = citas.filter((c) => (c.fecha ?? '').slice(0, 7) === drillMonth);
    const fs = facturas.filter((f) => (f.fecha ?? '').slice(0, 7) === drillMonth);
    const vs = ventas.filter((v) => (v.fecha ?? '').slice(0, 7) === drillMonth);
    const ingresos = fs.filter((f) => f.estado === 'Pagada').reduce((a, f) => a + Number(f.total || 0), 0);
    return { cs, fs, vs, ingresos };
  }, [drillMonth, citas, facturas, ventas]);

  return (
    <ModuleGuard module="estadisticas">
      <PageHeader title={term} subtitle="Panel de indicadores del negocio." />

      <div className="space-y-6">
        {/* KPIs */}
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {stats.kpis.map((k) => <Stat key={k.label} label={k.label} value={k.value} accent={k.accent} />)}
        </div>

        {/* Actividad mensual (clic en barra => detalle) */}
        <BarChart
          title="Actividad mensual"
          subtitle="Citas, ventas y facturas por mes · clic en una columna para ver el detalle"
          data={stats.monthly}
          series={[
            { key: 'citas', label: 'Citas', color: 'var(--acc)' },
            { key: 'ventas', label: 'Ventas', color: '#6aa8ff' },
            { key: 'facturas', label: 'Facturas', color: '#2ed573' },
          ]}
          onBarClick={(_, month) => setDrillMonth(month ?? null)}
        />

        {/* Facturación por estado */}
        <BarChart
          title="Facturación por estado"
          subtitle="Importe (€) emitido por mes según el estado de la factura"
          data={stats.billing}
          series={[
            { key: 'Pagada', label: 'Pagada', color: '#2ed573' },
            { key: 'Pendiente', label: 'Pendiente', color: '#e5b53a' },
            { key: 'Anulada', label: 'Anulada', color: '#ff4757' },
          ]}
          formatValue={eur}
          onBarClick={(_, month) => setDrillMonth(month ?? null)}
        />

        {/* Panel de drilldown */}
        {drillMonth && drill && (
          <div className="panel">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-[var(--panel-text)]">Detalle de {drillMonth}</h2>
              <button className="row-action edit" onClick={() => setDrillMonth(null)} title="Cerrar"><X className="h-4 w-4" /></button>
            </div>
            <div className="mb-4 grid gap-4 sm:grid-cols-4">
              <Stat label="Citas" value={drill.cs.length} accent />
              <Stat label="Ventas" value={drill.vs.length} />
              <Stat label="Facturas" value={drill.fs.length} />
              <Stat label="Ingresos" value={eur(drill.ingresos)} accent />
            </div>
            {drill.cs.length > 0 && (
              <Table head={['Fecha', 'Cliente', 'Servicio', 'Estado']}>
                {drill.cs.map((c) => (
                  <tr key={c.id}>
                    <Td>{c.fecha}</Td>
                    <Td className="text-[var(--panel-text)]">{c.cliente}</Td>
                    <Td>{c.servicio}</Td>
                    <Td><Badge tone={c.estado === 'Confirmada' ? 'blue' : c.estado === 'Cancelada' ? 'red' : 'amber'}>{c.estado}</Badge></Td>
                  </tr>
                ))}
              </Table>
            )}
          </div>
        )}

        {/* Distribuciones */}
        <div className="grid gap-4 md:grid-cols-2">
          <DonutChart title="Servicios por categoría" data={stats.serviciosPorCategoria} colors={DONUT_COLORS} totalLabel="servicios" />
          <DonutChart title="Clientes por segmento" data={stats.clientesPorSegmento} colors={DONUT_COLORS} totalLabel="clientes" />
        </div>
      </div>
    </ModuleGuard>
  );
}
