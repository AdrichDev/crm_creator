'use client';
import { useEffect, useMemo, useState } from 'react';
import { useDialog } from '@/components/ui/dialog-provider';
import { useTenantConfig, useTerm, useRole } from '@/lib/tenant-config-context';
import { moduleAllowedForRole, DEMO_USERS } from '@/lib/config/roles';
import { Stat, Table, Td, Badge } from '@/components/ui/primitives';
import { useCollection } from '@/lib/data/use-collection';
import { citas as seedCitas, type Cita, clientes as seedClientes } from '@/lib/mock/data';
import { DOW, DOW_FULL, MESES } from '@/lib/config/constants';
import { pad, dateStr } from '@/lib/utils/format';
import { WorkerChips } from '@/components/panel/worker-chips';

const estadoTone = (s: string) => s === 'Completada' ? '#6aa8ff' : s === 'Cancelada' ? '#ff4757' : 'var(--acc)';

export default function DashboardPage() {
  const { role } = useRole();
  return role === 'cliente' ? <ClienteDashboard /> : <PanelDashboard />;
}

function PanelDashboard() {
  const { config } = useTenantConfig();
  const { role } = useRole();
  const termCitas = useTerm('citas', 'Citas');
  const { items } = useCollection<Cita>('citas', seedCitas);

  // Fechas SOLO en cliente (evita mismatch de hidratación con el servidor).
  const [mounted, setMounted] = useState(false);
  const [cursor, setCursor] = useState({ y: 2026, m: 5 });
  const [selected, setSelected] = useState('');
  const [todayStr, setTodayStr] = useState('');

  useEffect(() => {
    const d = new Date();
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
    const ts = dateStr(d.getFullYear(), d.getMonth(), d.getDate());
    setSelected(ts); setTodayStr(ts); setMounted(true);
  }, []);

  const porDia = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of items) map.set(c.fecha, (map.get(c.fecha) ?? 0) + 1);
    return map;
  }, [items]);

  const monthLabel = `${MESES[cursor.m]} ${cursor.y}`;
  const firstWeekday = (new Date(cursor.y, cursor.m, 1).getDay() + 6) % 7; // lunes=0
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();

  const cells: ({ d: number; date: string } | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push({ d, date: dateStr(cursor.y, cursor.m, d) });

  const citasDelDia = items.filter((c) => c.fecha === selected).sort((a, b) => a.hora.localeCompare(b.hora));

  function cambiarMes(delta: number) {
    setCursor((c) => {
      const nm = c.m + delta;
      return { y: c.y + Math.floor(nm / 12), m: ((nm % 12) + 12) % 12 };
    });
  }

  function labelDia(fecha: string) {
    const dt = new Date(fecha + 'T00:00:00');
    const wd = DOW_FULL[(dt.getDay() + 6) % 7];
    return `${wd} ${dt.getDate()} de ${MESES[dt.getMonth()]}`;
  }

  const showClientes = moduleAllowedForRole(role, 'clientes') && config.modules.clientes;
  const kpis = [
    { label: `${termCitas} totales`, value: items.length, accent: true },
    { label: 'Confirmadas', value: items.filter((c) => c.estado === 'Confirmada').length },
    { label: 'Pendientes', value: items.filter((c) => c.estado === 'Pendiente').length },
    ...(showClientes ? [{ label: 'Clientes', value: seedClientes.length }] : []),
  ];

  return (
    <div>
      <div className="panel-header">
        <div>
          <h1>Hola, {config.business.name}</h1>
          <p className="subtitle">Resumen de tu actividad — agenda y próximas {termCitas.toLowerCase()}.</p>
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => <Stat key={k.label} label={k.label} value={k.value} accent={k.accent} />)}
      </div>

      {/* Chips configurables (accesos rápidos) — solo en la vista del trabajador. */}
      {role === 'trabajador' && <WorkerChips />}

      <div className="panel">
        <div className="panel-header"><h2>Agenda</h2></div>

        {!mounted ? (
          <p className="empty-state">Cargando agenda…</p>
        ) : (
          <div className="calendar-layout">
            {/* Calendario mensual */}
            <div className="calendar-container">
              <div className="calendar-header">
                <button className="btn btn-outline btn-sm" onClick={() => cambiarMes(-1)}>&lt;</button>
                <h3>{monthLabel}</h3>
                <button className="btn btn-outline btn-sm" onClick={() => cambiarMes(1)}>&gt;</button>
              </div>
              <div className="calendar-grid-header">{DOW.map((d) => <div key={d}>{d}</div>)}</div>
              <div className="calendar-days">
                {cells.map((cell, i) => {
                  if (!cell) return <div key={`e${i}`} className="calendar-day empty" />;
                  const n = porDia.get(cell.date) ?? 0;
                  const cls = ['calendar-day'];
                  if (cell.date === selected) cls.push('active');
                  if (cell.date === todayStr) cls.push('today');
                  return (
                    <div key={cell.date} className={cls.join(' ')} onClick={() => setSelected(cell.date)}>
                      <span>{cell.d}</span>
                      {n > 0 && <span className="appointment-dot" />}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Citas del día */}
            <div className="day-appointments-panel">
              <h3 className="capitalize">{selected ? labelDia(selected) : 'Selecciona un día'}</h3>
              <div className="appointments-list">
                {citasDelDia.length === 0
                  ? <p className="empty-state">No hay {termCitas.toLowerCase()} para este día.</p>
                  : citasDelDia.map((c) => (
                    <div key={c.id} className="appointment-card" style={{ borderLeftColor: estadoTone(c.estado) }}>
                      <div className="time">{c.hora}</div>
                      <div className="client">{c.cliente}</div>
                      <div className="meta">{c.servicio} · {c.empleado} · {c.estado}</div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Dashboard de CLIENTE — clon de "Mis Citas" de JorjotasBarber.
// Sin columna "Cliente" (todas las citas son suyas); stats + tabla + anular.
// ───────────────────────────────────────────────────────────────────────────
function ClienteDashboard() {
  const { config } = useTenantConfig();
  const termCitas = useTerm('citas', 'Citas');
  const { items, update } = useCollection<Cita>('citas', seedCitas);
  const yo = DEMO_USERS.cliente.nombre;
  const dialog = useDialog();

  const mias = items
    .filter((c) => c.cliente === yo)
    .sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora));
  const pendientes = mias.filter((c) => c.estado === 'Confirmada' || c.estado === 'Pendiente').length;
  const completadas = mias.filter((c) => c.estado === 'Completada').length;

  const tone = (s: string) =>
    s === 'Confirmada' ? 'blue' : s === 'Completada' ? 'green' : s === 'Cancelada' ? 'red' : 'amber';

  async function anular(c: Cita) {
    const ok = await dialog.confirm({ message: '¿Anular esta reserva?', danger: true });
    if (ok) update(c.id, { estado: 'Cancelada' });
  }

  return (
    <div>
      <div className="panel-header">
        <div>
          <h1>Hola, {DEMO_USERS.cliente.nombre.split(' ')[0]}</h1>
          <p className="subtitle">Tus {termCitas.toLowerCase()} programadas en {config.business.name}.</p>
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label={`${termCitas} pendientes`} value={pendientes} accent />
        <Stat label={`${termCitas} completadas`} value={completadas} />
        <Stat label="Total" value={mias.length} />
      </div>

      <div className="panel">
        <div className="panel-header"><h2>Mis {termCitas.toLowerCase()} programadas</h2></div>
        {mias.length === 0 ? (
          <p className="empty-state">No tienes {termCitas.toLowerCase()} todavía.</p>
        ) : (
          <Table head={['Fecha y hora', 'Servicio', 'Profesional', 'Estado', '']}>
            {mias.map((c) => {
              const cancelable = c.estado === 'Confirmada' || c.estado === 'Pendiente';
              return (
                <tr key={c.id}>
                  <Td className="font-medium text-[var(--panel-text)]">{c.fecha} · {c.hora}</Td>
                  <Td>{c.servicio}</Td>
                  <Td>{c.empleado}</Td>
                  <Td><Badge tone={tone(c.estado)}>{c.estado}</Badge></Td>
                  <Td>
                    <div className="flex justify-end">
                      {cancelable && (
                        <button className="row-action danger" onClick={() => void anular(c)}>Anular</button>
                      )}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
      </div>
    </div>
  );
}
