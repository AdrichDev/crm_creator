'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTenantConfig } from '@/lib/tenant-config-context';
import { DEMO_USERS } from '@/lib/config/roles';
import { activeWorkerChips, type WorkerChipId } from '@/lib/config/worker-chips';
import { Icon } from '@/components/ui/icon';
import { Card, CardBody, Badge } from '@/components/ui/primitives';
import { useCollection, type WithId } from '@/lib/data/use-collection';
import { citas as seedCitas, type Cita, ventas as seedVentas, type Venta, fichajes as seedFichajes, type Fichaje } from '@/lib/mock/data';
import { eur } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

// El trabajador demo (sin BD aún). Sus datos derivan de su nombre.
const YO = DEMO_USERS.trabajador.nombre;
const YO_NOMBRE = YO.split(' ')[0]; // las citas mock usan solo el nombre ("Sara")

const DISPONIBILIDAD: { id: WorkerEstado; label: string; tone: 'green' | 'amber' | 'red' }[] = [
  { id: 'disponible', label: 'Disponible', tone: 'green' },
  { id: 'ocupado', label: 'Ocupado', tone: 'amber' },
  { id: 'pausa', label: 'Pausa', tone: 'red' },
];
type WorkerEstado = 'disponible' | 'ocupado' | 'pausa';
const DISPONIBILIDAD_KEY = 'saas.worker.disponibilidad.v1';

interface Tarea extends WithId { texto: string; hecha: boolean; }
const tareasSeed: Tarea[] = [
  { id: 1, texto: 'Abrir caja y revisar agenda', hecha: false },
  { id: 2, texto: 'Reponer producto de cabina', hecha: false },
];

/** Fila de chips activos del dashboard del trabajador. */
export function WorkerChips() {
  const { config } = useTenantConfig();
  const chips = useMemo(() => activeWorkerChips(config.workerChips, config.modules), [config.workerChips, config.modules]);
  if (chips.length === 0) return null;

  return (
    <div className="mb-6">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--panel-muted)]">Accesos rápidos</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {chips.map((c) => <ChipCard key={c.id} id={c.id} label={c.label} icon={c.icon} />)}
      </div>
    </div>
  );
}

function ChipShell({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardBody className="flex items-start gap-3 p-4">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/5 text-[var(--acc)]">
          <Icon name={icon} className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white">{label}</p>
          <div className="mt-1">{children}</div>
        </div>
      </CardBody>
    </Card>
  );
}

function ChipCard({ id, label, icon }: { id: WorkerChipId; label: string; icon: string }) {
  switch (id) {
    case 'fichaje-rapido': return <FichajeChip label={label} icon={icon} />;
    case 'proxima-cita': return <ProximaCitaChip label={label} icon={icon} />;
    case 'mis-ventas-hoy': return <VentasChip label={label} icon={icon} />;
    case 'disponibilidad': return <DisponibilidadChip label={label} icon={icon} />;
    case 'pedir-ausencia': return <AusenciaChip label={label} icon={icon} />;
    case 'tareas-turno': return <TareasChip label={label} icon={icon} />;
    default: return null;
  }
}

function FichajeChip({ label, icon }: { label: string; icon: string }) {
  const { items } = useCollection<Fichaje>('fichajes', seedFichajes);
  const horas = items.filter((f) => f.empleado === YO).reduce((s, f) => s + (f.horas ?? 0), 0);
  return (
    <ChipShell icon={icon} label={label}>
      <p className="text-xs text-[var(--panel-muted)]">{horas > 0 ? `${horas.toFixed(1)} h registradas` : 'Sin fichaje hoy'}</p>
      <Link href="/fichaje" className="mt-1 inline-block text-xs text-[var(--acc)] hover:underline">Fichar entrada/salida →</Link>
    </ChipShell>
  );
}

function ProximaCitaChip({ label, icon }: { label: string; icon: string }) {
  const { items } = useCollection<Cita>('citas', seedCitas);
  const [now, setNow] = useState('');
  useEffect(() => { const d = new Date(); setNow(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`); }, []);
  const prox = items
    .filter((c) => c.empleado === YO_NOMBRE && c.estado !== 'Cancelada' && (!now || c.fecha >= now))
    .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora))[0];
  return (
    <ChipShell icon={icon} label={label}>
      {prox ? (
        <>
          <p className="text-xs text-white">{prox.hora} · {prox.cliente}</p>
          <p className="text-xs text-[var(--panel-muted)]">{prox.servicio} · {prox.fecha}</p>
          <Link href="/citas" className="mt-1 inline-block text-xs text-[var(--acc)] hover:underline">Ver agenda →</Link>
        </>
      ) : (
        <p className="text-xs text-[var(--panel-muted)]">Sin próximas citas</p>
      )}
    </ChipShell>
  );
}

function VentasChip({ label, icon }: { label: string; icon: string }) {
  const { items } = useCollection<Venta>('ventas', seedVentas);
  const [hoy, setHoy] = useState('');
  useEffect(() => { const d = new Date(); setHoy(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`); }, []);
  // Sin "vendedor" en el mock; el total del día es una aproximación demo.
  const total = items.filter((v) => !hoy || v.fecha === hoy).reduce((s, v) => s + (v.total ?? 0), 0);
  return (
    <ChipShell icon={icon} label={label}>
      <p className="text-lg font-semibold text-white">{eur(total)}</p>
      <Link href="/ventas" className="mt-1 inline-block text-xs text-[var(--acc)] hover:underline">Ver ventas →</Link>
    </ChipShell>
  );
}

function DisponibilidadChip({ label, icon }: { label: string; icon: string }) {
  const [estado, setEstado] = useState<WorkerEstado>('disponible');
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DISPONIBILIDAD_KEY);
      if (raw === 'disponible' || raw === 'ocupado' || raw === 'pausa') setEstado(raw);
    } catch { /* noop */ }
  }, []);
  function cambiar(e: WorkerEstado) {
    setEstado(e);
    try { localStorage.setItem(DISPONIBILIDAD_KEY, e); } catch { /* noop */ }
  }
  return (
    <ChipShell icon={icon} label={label}>
      <div className="flex flex-wrap gap-1">
        {DISPONIBILIDAD.map((d) => (
          <button key={d.id} type="button" onClick={() => cambiar(d.id)}
            className={cn('rounded-lg px-2 py-1 text-[11px] font-medium transition',
              estado === d.id ? 'text-white' : 'text-[var(--panel-muted)] hover:text-[var(--hover-text)]')}
            style={estado === d.id ? { background: 'color-mix(in srgb, var(--acc) 22%, transparent)' } : undefined}>
            {d.label}
          </button>
        ))}
      </div>
    </ChipShell>
  );
}

function AusenciaChip({ label, icon }: { label: string; icon: string }) {
  return (
    <ChipShell icon={icon} label={label}>
      <p className="text-xs text-[var(--panel-muted)]">Solicita vacaciones o ausencia.</p>
      <Link href="/vacaciones" className="mt-1 inline-block text-xs text-[var(--acc)] hover:underline">Pedir ausencia →</Link>
    </ChipShell>
  );
}

function TareasChip({ label, icon }: { label: string; icon: string }) {
  const { items, update } = useCollection<Tarea>('worker-tareas-turno', tareasSeed);
  const hechas = items.filter((t) => t.hecha).length;
  return (
    <ChipShell icon={icon} label={label}>
      <Badge tone={hechas === items.length ? 'green' : 'amber'}>{hechas}/{items.length}</Badge>
      <ul className="mt-2 space-y-1">
        {items.map((t) => (
          <li key={t.id}>
            <label className="flex items-center gap-2 text-xs text-[var(--panel-muted)]">
              <input type="checkbox" checked={t.hecha} onChange={(e) => update(t.id, { hecha: e.target.checked })} />
              <span className={cn(t.hecha && 'line-through')}>{t.texto}</span>
            </label>
          </li>
        ))}
      </ul>
    </ChipShell>
  );
}
