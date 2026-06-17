'use client';
import { useMemo, useState } from 'react';
import { ModuleGuard } from '@/components/layout/module-guard';
import { useTenantConfig, useTerm } from '@/lib/tenant-config-context';
import { PageHeader, Stat, Table, Td, Card, CardBody, Button, Badge } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/modal';
import { ModelEffortPicker } from '@/components/ai/model-effort-picker';
import { useCollection } from '@/lib/data/use-collection';
import { generateWithAI, AiBlockedError } from '@/lib/ai/usage-client';
import { Sparkles, Info, X } from 'lucide-react';
import { aggregateStats } from '@/lib/stats/aggregate';
import { eur } from '@/lib/utils/format';
import { BarChart } from '@/components/stats/bar-chart';
import { DonutChart } from '@/components/stats/donut-chart';
import { StudyDetail } from '@/components/stats/study-detail';
import { StarRating } from '@/components/stats/star-rating';
import type { Estudio } from '@/lib/stats/study-types';
import {
  citas as citasSeed, facturas as facturasSeed, ventas as ventasSeed,
  clientes as clientesSeed, servicios as serviciosSeed, productos as productosSeed,
  type Cita, type Factura, type Venta, type Cliente, type Servicio, type Producto,
} from '@/lib/mock/data';

const DONUT_COLORS = ['var(--acc)', '#6aa8ff', '#2ed573', '#d68bff', '#ff9f43', '#ff6b78', '#00d2d3'];

type Tab = 'dashboard' | 'estudios';

export default function Page() {
  const term = useTerm('estadisticas', 'Estadísticas');
  const { config } = useTenantConfig();
  const clienteId = config.business.clienteId ?? null;

  const [tab, setTab] = useState<Tab>('dashboard');

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

  // ── Estudios de mercado (IA) ──
  const { items, create, update } = useCollection<Estudio>('estudios', []);
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('gpt-5.4');
  const [effort, setEffort] = useState('medium');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState<Estudio | null>(null);
  const ultimaFecha = items[0]?.fecha ?? '—';
  // El estudio mostrado en el detalle se lee siempre del store para que las
  // ediciones (secciones, rating, prospectos) se reflejen en vivo.
  const liveInfo = info ? items.find((e) => e.id === info.id) ?? info : null;

  async function generar() {
    setLoading(true); setError('');
    try {
      const out = await generateWithAI({ kind: 'market-study', clientId: clienteId, model, effort, prompt });
      create({
        titulo: prompt.trim() || 'Estudio de mercado',
        fecha: new Date().toISOString().slice(0, 10),
        modelo: out.usage?.model ?? model,
        tokens: out.usage?.tokens ?? 0,
        contenido: out.content,
      } as Omit<Estudio, 'id'>);
      setOpen(false); setPrompt('');
    } catch (e) {
      setError(e instanceof AiBlockedError ? e.message : (e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const tabCls = (t: Tab) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${tab === t
      ? 'text-[var(--acc)]'
      : 'text-[var(--panel-muted)] hover:text-[var(--panel-text)]'}`;
  const tabStyle = (t: Tab) => tab === t
    ? { background: 'color-mix(in srgb, var(--acc) 14%, transparent)', border: '1px solid color-mix(in srgb, var(--acc) 30%, transparent)' }
    : { border: '1px solid transparent' };

  return (
    <ModuleGuard module="estadisticas">
      <PageHeader title={term} subtitle="Panel de indicadores del negocio y estudios de mercado con IA."
        action={tab === 'estudios'
          ? <Button onClick={() => { setError(''); setOpen(true); }}><Sparkles className="h-4 w-4" /> Nuevo estudio con IA</Button>
          : undefined} />

      {/* Pestañas */}
      <div className="mb-6 flex gap-2">
        <button className={tabCls('dashboard')} style={tabStyle('dashboard')} onClick={() => setTab('dashboard')}>Dashboard</button>
        <button className={tabCls('estudios')} style={tabStyle('estudios')} onClick={() => setTab('estudios')}>Estudios de mercado</button>
      </div>

      {/* ════════ DASHBOARD ════════ */}
      {tab === 'dashboard' && (
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
      )}

      {/* ════════ ESTUDIOS DE MERCADO ════════ */}
      {tab === 'estudios' && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Stat label="Estudios" value={items.length} accent />
            <Stat label="Último estudio" value={ultimaFecha} />
          </div>

          {items.length === 0 ? (
            <Card><CardBody className="empty-state">Aún no hay estudios. Genera el primero con IA.</CardBody></Card>
          ) : (
            <Table head={['Estudio', 'Fecha', 'Modelo', 'Valoración', '']}>
              {items.map((e) => (
                <tr key={e.id}>
                  <Td className="font-medium text-[var(--panel-text)]">{e.titulo}</Td>
                  <Td>{e.fecha}</Td>
                  <Td><Badge tone="blue">{e.modelo}</Badge></Td>
                  <Td><StarRating value={e.rating ?? null} /></Td>
                  <Td>
                    <div className="flex justify-end">
                      <button className="row-action edit" title="Ver" onClick={() => setInfo(e)}><Info className="h-4 w-4" /></button>
                    </div>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      )}

      {/* Modal de generación */}
      <Modal open={open} title="Generar estudio de mercado con IA" onClose={() => { if (!loading) setOpen(false); }}
        footer={<>
          <Button variant="outline" onClick={() => setOpen(false)} >Cancelar</Button>
          <Button onClick={generar} disabled={loading}>{loading ? 'Generando…' : 'Generar'}</Button>
        </>}>
        <div className="space-y-4">
          <div className="opera-field">
            <label className="opera-label">Tema / instrucciones</label>
            <textarea className="opera-control" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)}
              placeholder="p. ej. Análisis de competencia y oportunidades para el negocio en su zona." />
          </div>
          <ModelEffortPicker model={model} effort={effort} onModel={setModel} onEffort={setEffort} />
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      </Modal>

      {/* Modal de detalle: estudio interactivo (secciones editables + valoración + prospección) */}
      <Modal open={!!info} title={liveInfo?.titulo ?? ''} onClose={() => setInfo(null)}
        footer={<Button variant="outline" onClick={() => setInfo(null)}>Cerrar</Button>}>
        {liveInfo && (
          <StudyDetail
            estudio={liveInfo}
            onPatch={(patch) => update(liveInfo.id, patch)}
          />
        )}
      </Modal>
    </ModuleGuard>
  );
}
