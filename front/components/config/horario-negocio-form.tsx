'use client';
import { Check, Pencil, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  type BusinessSchedule, type ScheduleGroup, type ScheduleMode, DIAS_SEMANA,
  emptySchedule, normalizeSchedule, addGroup, removeGroup, setGroupDay, setGroupTramo,
  addGroupTramo, removeGroupTramo, setGroupMode, setGroupAccepted,
} from '@/lib/config/schedule';

// Editor del horario de apertura del negocio. Reutilizable (presentacional):
// recibe `value` + `onChange`; cada host (onboarding, configuración) cablea su
// propia persistencia. UX: cada GRUPO de días elige su propio tipo (continuo =
// intensiva / partido = partida) de forma INDEPENDIENTE — cambiar el tipo de un
// grupo nunca toca a otro. Botón "Aceptar" confirma el grupo y lo colapsa a un
// resumen (con "Editar" para reabrirlo). Un día sin grupo = cerrado.

/** Etiqueta de los días marcados de un grupo, en orden visual (L M X J V S D). */
function diasLabel(group: ScheduleGroup): string {
  const labels = DIAS_SEMANA.filter((d) => group.dias.includes(d.value)).map((d) => d.title);
  return labels.length ? labels.join(', ') : 'Sin días';
}

/** Resumen de tramos "09:00–14:00, 16:00–20:00" de un grupo. */
function tramosLabel(group: ScheduleGroup): string {
  const valid = group.tramos.filter((t) => t.inicio && t.fin);
  return valid.length ? valid.map((t) => `${t.inicio}–${t.fin}`).join(', ') : 'Sin horas';
}

export function HorarioNegocioForm({ value, onChange }: {
  value?: BusinessSchedule;
  onChange: (next: BusinessSchedule) => void;
}) {
  // Normaliza defensivamente: tolera la forma antigua (mode global) si llega sin migrar.
  const schedule = normalizeSchedule(value ?? emptySchedule());
  const inputCls = 'rounded-lg border border-gray-300 px-2 py-1 text-sm';

  return (
    <div>
      <label className="text-xs font-medium text-gray-500">Horario</label>

      <div className="mt-2 space-y-3">
        {schedule.groups.length === 0 && (
          <p className="text-xs text-gray-400">Sin horario definido: todos los días figuran como cerrados.</p>
        )}
        {schedule.groups.map((g, gi) => (
          g.aceptado ? (
            // Grupo aceptado: resumen compacto (días + horas) con botón "Editar".
            <div key={gi} className="flex items-center justify-between gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
              <div className="min-w-0 text-sm">
                <p className="font-medium text-gray-800">{diasLabel(g)}</p>
                <p className="text-xs text-gray-500">
                  {g.mode === 'partido' ? 'Partido' : 'Continuo'} · {tramosLabel(g)}
                </p>
              </div>
              <button type="button" className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:border-[var(--brand-primary)]"
                aria-label={`Editar grupo ${gi + 1}`}
                onClick={() => onChange(setGroupAccepted(schedule, gi, false))}>
                <Pencil className="h-3.5 w-3.5" /> Editar
              </button>
            </div>
          ) : (
            <div key={gi} className="rounded-xl border border-gray-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                {/* Toggle continuo/partido POR GRUPO (segmented control accesible). */}
                <div role="radiogroup" aria-label={`Tipo de horario (grupo ${gi + 1})`} className="inline-flex rounded-lg border border-gray-300 p-0.5 text-xs">
                  {([['continuo', 'Horario continuo'], ['partido', 'Horario partido']] as const).map(([m, label]) => (
                    <button key={m} type="button" role="radio" aria-checked={g.mode === m}
                      aria-label={`${label} (grupo ${gi + 1})`}
                      onClick={() => onChange(setGroupMode(schedule, gi, m as ScheduleMode))}
                      className={cn('rounded-md px-2.5 py-1 font-medium',
                        g.mode === m ? 'bg-[var(--brand-primary)] text-white' : 'text-gray-500 hover:text-[var(--brand-primary)]')}>
                      {label}
                    </button>
                  ))}
                </div>
                <button type="button" className="row-action danger" title="Quitar grupo" aria-label={`Quitar grupo ${gi + 1}`}
                  onClick={() => onChange(removeGroup(schedule, gi))}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {/* Días del grupo. Marcar un día aquí lo desmarca de otros grupos. */}
              <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label={`Días del grupo ${gi + 1}`}>
                {DIAS_SEMANA.map((d) => {
                  const checked = g.dias.includes(d.value);
                  return (
                    <label key={d.value} title={d.title}
                      className={cn('grid h-7 w-7 cursor-pointer select-none place-items-center rounded-full text-xs font-semibold',
                        checked ? 'bg-[var(--brand-primary)] text-white' : 'border border-gray-300 text-gray-500 hover:border-[var(--brand-primary)]')}>
                      <input type="checkbox" className="sr-only" checked={checked}
                        aria-label={`${d.title} (grupo ${gi + 1})`}
                        onChange={(e) => onChange(setGroupDay(schedule, gi, d.value, e.target.checked))} />
                      {d.label}
                    </label>
                  );
                })}
              </div>

              <div className="mt-2 space-y-1.5">
                {g.tramos.map((t, ti) => (
                  <div key={ti} className="flex items-center gap-2">
                    <input type="time" className={inputCls} value={t.inicio} aria-label={`Inicio tramo ${ti + 1} (grupo ${gi + 1})`}
                      onChange={(e) => onChange(setGroupTramo(schedule, gi, ti, { inicio: e.target.value }))} />
                    <span className="text-gray-400">–</span>
                    <input type="time" className={inputCls} value={t.fin} aria-label={`Fin tramo ${ti + 1} (grupo ${gi + 1})`}
                      onChange={(e) => onChange(setGroupTramo(schedule, gi, ti, { fin: e.target.value }))} />
                    {g.mode === 'partido' && g.tramos.length > 2 && (
                      <button type="button" className="row-action danger" title="Quitar tramo" aria-label={`Quitar tramo ${ti + 1} (grupo ${gi + 1})`}
                        onClick={() => onChange(removeGroupTramo(schedule, gi, ti))}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
                {g.mode === 'partido' && (
                  <button type="button" className="text-xs font-medium text-[var(--brand-primary)] hover:underline"
                    onClick={() => onChange(addGroupTramo(schedule, gi))}>
                    <Plus className="mr-0.5 inline h-3 w-3" /> Añadir tramo
                  </button>
                )}
              </div>

              {/* Aceptar: confirma y colapsa el grupo. No bloquea el guardado. */}
              <div className="mt-3 flex justify-end">
                <button type="button" className="inline-flex items-center gap-1 rounded-lg bg-[var(--brand-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                  aria-label={`Aceptar grupo ${gi + 1}`}
                  onClick={() => onChange(setGroupAccepted(schedule, gi, true))}>
                  <Check className="h-3.5 w-3.5" /> Aceptar
                </button>
              </div>
            </div>
          )
        ))}

        <button type="button" onClick={() => onChange(addGroup(schedule))}
          className="inline-flex items-center gap-1 rounded-xl border border-dashed border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-[var(--brand-primary)]">
          <Plus className="h-3.5 w-3.5" /> Añadir grupo de días
        </button>
        <p className="text-[11px] text-gray-400">
          Cada grupo aplica su horario a los días marcados y elige su propio tipo (continuo o partido).
          Un día solo puede estar en un grupo (al marcarlo se quita del anterior) y los días sin grupo
          se consideran cerrados.
        </p>
      </div>
    </div>
  );
}
