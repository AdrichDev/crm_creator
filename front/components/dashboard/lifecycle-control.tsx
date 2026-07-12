'use client';
// Palanca del kill switch, lado operaOS (crm-tenant-lifecycle-gate WU5).
//
// Superficie de OPERADOR (no de tenant): vive bajo el carril (operador) y NO la
// gatea `tenantGate`. Sin lógica de negocio en el front — solo dispara
// `PUT .../lifecycle` con el estado destino elegido y refleja el estado actual +
// el histórico (`GET .../state-events`). El back valida el payload (400 si un
// GRACE no trae `graceUntil` futuro) y aplica los side-effects; aquí solo
// transportamos la intención del operador.
//
// - Switch verde/rojo: alterna ACTIVE ↔ SUSPENDED con un solo gesto (verde =
//   operativo, rojo = suspendido). Reactivar desde TERMINATED = poner el switch en
//   verde (→ ACTIVE): los datos siguen intactos, restauración instantánea.
// - Selector: fija GRACE (pide fecha de fin de gracia) / TERMINATED / ACTIVE.
import { useCallback, useEffect, useState } from 'react';
import {
  fetchBusinessStateEvents,
  setBusinessLifecycle,
  type LifecycleState,
  type SetLifecyclePayload,
  type TenantLifecycle,
  type TenantStateEvent,
} from '@/lib/api/operator';

const LABELS: Record<TenantLifecycle, string> = {
  ACTIVE: 'Operativo',
  GRACE: 'Periodo de gracia',
  SUSPENDED: 'Suspendido',
  TERMINATED: 'Cuenta cerrada',
};

const BADGE_CLASS: Record<TenantLifecycle, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-800',
  GRACE: 'bg-amber-100 text-amber-800',
  SUSPENDED: 'bg-red-100 text-red-800',
  TERMINATED: 'bg-neutral-200 text-neutral-700',
};

function formatDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Convierte un valor de `<input type="datetime-local">` (hora local) a ISO UTC. */
function localToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function LifecycleControl({ businessId }: { businessId: string }) {
  const [current, setCurrent] = useState<TenantLifecycle>('ACTIVE');
  const [detail, setDetail] = useState<LifecycleState | null>(null);
  const [events, setEvents] = useState<TenantStateEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Selector de estado manual (GRACE/TERMINATED/ACTIVE) + fecha de gracia.
  const [target, setTarget] = useState<TenantLifecycle>('GRACE');
  const [graceLocal, setGraceLocal] = useState('');

  const loadEvents = useCallback(async () => {
    const list = await fetchBusinessStateEvents(businessId).catch(() => [] as TenantStateEvent[]);
    setEvents(list);
    // El estado actual se deriva de la transición más reciente (o ACTIVE por
    // defecto: los negocios nacen operativos y sin histórico).
    if (list.length > 0) setCurrent(list[0].toState);
  }, [businessId]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const apply = useCallback(
    async (payload: SetLifecyclePayload) => {
      setBusy(true);
      setError(null);
      try {
        const next = await setBusinessLifecycle(businessId, payload);
        setDetail(next);
        setCurrent(next.lifecycle);
        await loadEvents();
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'No se pudo cambiar el estado del negocio';
        setError(msg);
      } finally {
        setBusy(false);
      }
    },
    [businessId, loadEvents],
  );

  // Switch verde/rojo: un gesto = ACTIVE ↔ SUSPENDED. Verde (checked) = operativo.
  const isOn = current === 'ACTIVE';
  const toggleSwitch = () => {
    void apply({ state: isOn ? 'SUSPENDED' : 'ACTIVE' });
  };

  const applySelector = () => {
    if (target === 'GRACE') {
      const iso = localToIso(graceLocal);
      if (!iso) {
        setError('Indica la fecha de fin del periodo de gracia.');
        return;
      }
      void apply({ state: 'GRACE', graceUntil: iso });
      return;
    }
    void apply({ state: target });
  };

  const graceUntil = formatDateTime(detail?.graceUntil);
  const suspendedAt = formatDateTime(detail?.suspendedAt);

  return (
    <section aria-labelledby="lifecycle-title" className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h2 id="lifecycle-title" className="text-lg font-semibold text-[var(--panel-text)]">
            Estado del servicio
          </h2>
          <p className="text-sm text-[var(--panel-muted)]">
            Enciende o apaga el acceso del negocio. Apagar corta el acceso sin borrar datos.
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${BADGE_CLASS[current]}`}>
          {LABELS[current]}
        </span>
      </header>

      {/* Switch verde/rojo (ACTIVE ↔ SUSPENDED). */}
      <div className="flex items-center gap-4 rounded-lg border border-[var(--line)] p-4">
        <button
          type="button"
          role="switch"
          aria-checked={isOn}
          aria-label="Servicio operativo"
          disabled={busy}
          onClick={toggleSwitch}
          className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors disabled:opacity-50 ${
            isOn ? 'bg-emerald-500' : 'bg-red-500'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
              isOn ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
        <span className="text-sm font-medium text-[var(--panel-text)]">
          {isOn ? 'Encendido (operativo)' : 'Apagado (suspendido)'}
        </span>
      </div>

      {/* Selector de estado manual: GRACE / TERMINATED / ACTIVE (reactivar). */}
      <div className="space-y-3 rounded-lg border border-[var(--line)] p-4">
        <p className="text-sm font-medium text-[var(--panel-text)]">Fijar otro estado</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-[var(--panel-muted)]">
            Estado destino
            <select
              aria-label="Estado destino"
              value={target}
              disabled={busy}
              onChange={(e) => setTarget(e.target.value as TenantLifecycle)}
              // bg sólido (--panel-card) para diferenciar el control del panel y opciones
              // legibles: sin esto, en modo oscuro el desplegable nativo pinta las <option>
              // con texto claro sobre fondo claro del UA y no se distinguen.
              className="rounded border border-[var(--line)] bg-[var(--panel-card)] px-2 py-1 text-sm text-[var(--panel-text)] [&>option]:bg-[var(--panel-card)] [&>option]:text-[var(--panel-text)]"
            >
              <option value="ACTIVE">Operativo (reactivar)</option>
              <option value="GRACE">Periodo de gracia</option>
              <option value="SUSPENDED">Suspendido</option>
              <option value="TERMINATED">Cerrar cuenta</option>
            </select>
          </label>
          {target === 'GRACE' && (
            <label className="flex flex-col gap-1 text-xs text-[var(--panel-muted)]">
              Fin del periodo de gracia
              <input
                type="datetime-local"
                aria-label="Fin del periodo de gracia"
                value={graceLocal}
                disabled={busy}
                onChange={(e) => setGraceLocal(e.target.value)}
                // bg sólido (--panel-card) para que el control se distinga del panel en modo oscuro.
                className="rounded border border-[var(--line)] bg-[var(--panel-card)] px-2 py-1 text-sm text-[var(--panel-text)]"
              />
            </label>
          )}
          <button
            type="button"
            onClick={applySelector}
            disabled={busy}
            className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Aplicar
          </button>
        </div>
        {target === 'TERMINATED' && (
          <p className="text-xs text-[var(--panel-muted)]">
            Cerrar la cuenta corta el acceso pero conserva los datos. Es reversible: reactivar
            restaura el servicio al instante.
          </p>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {(graceUntil || suspendedAt) && (
        <p className="text-xs text-[var(--panel-muted)]">
          {graceUntil && <>Gracia hasta el {graceUntil}. </>}
          {suspendedAt && <>Suspendido desde el {suspendedAt}.</>}
        </p>
      )}

      {/* Histórico de transiciones. */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-[var(--panel-text)]">Histórico</h3>
        {events.length === 0 ? (
          <p className="text-sm text-[var(--panel-muted)]">Sin transiciones registradas.</p>
        ) : (
          <ul className="divide-y divide-[var(--line)] text-sm">
            {events.map((ev, i) => (
              <li key={`${ev.createdAt}-${i}`} className="flex flex-wrap items-center gap-2 py-2">
                <span className="font-medium text-[var(--panel-text)]">
                  {LABELS[ev.fromState]} → {LABELS[ev.toState]}
                </span>
                <span className="text-[var(--panel-muted)]">·</span>
                <span className="text-[var(--panel-muted)]">{formatDateTime(ev.createdAt)}</span>
                <span className="text-[var(--panel-muted)]">·</span>
                <span className="text-[var(--panel-muted)]">{ev.actor}</span>
                {ev.reason && <span className="text-[var(--panel-muted)]">— {ev.reason}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
