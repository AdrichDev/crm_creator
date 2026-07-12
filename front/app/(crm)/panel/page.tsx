'use client';
import { useEffect, useState } from 'react';
import { useDialog } from '@/components/ui/dialog-provider';
import { getAuthProfile } from '@/lib/api/profile';
import { useTenantConfig, useTerm, useRole } from '@/lib/tenant-config-context';
import { DEMO_USERS } from '@/lib/config/roles';
import { Stat, Table, Td, Badge } from '@/components/ui/primitives';
import { useCollection } from '@/lib/data/use-collection';
import { citas as seedCitas, type Cita } from '@/lib/mock/data';
import { WorkerChips } from '@/components/panel/worker-chips';
import { WidgetGrid } from '@/components/panel/widget-grid';

export default function DashboardPage() {
  const { role } = useRole();
  return role === 'cliente' ? <ClienteDashboard /> : <PanelDashboard />;
}

function PanelDashboard() {
  const { config } = useTenantConfig();
  const { role } = useRole();
  const termCitas = useTerm('citas', 'Citas');

  // Saludo con el NOMBRE de la persona logueada (firstName de /auth/me), no el negocio.
  const [firstName, setFirstName] = useState('');
  useEffect(() => {
    let alive = true;
    getAuthProfile()
      .then((p) => { if (alive) setFirstName((p.firstName || '').trim().split(/\s+/)[0] || ''); })
      .catch(() => { /* API off: se queda el saludo sin nombre */ });
    return () => { alive = false; };
  }, []);

  return (
    <div className="panel-fill">
      <div className="panel-header">
        <div>
          <h1>Hola{firstName ? `, ${firstName}` : ''}</h1>
          <p className="subtitle">Resumen de tu actividad — agenda y próximas {termCitas.toLowerCase()}.</p>
        </div>
      </div>

      {/* Chips configurables (accesos rápidos) — solo en la vista del trabajador. */}
      {role === 'trabajador' && <WorkerChips />}

      <WidgetGrid selected={config.dashboardWidgets} modules={config.modules} />
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
