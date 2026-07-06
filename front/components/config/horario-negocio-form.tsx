'use client';
import { Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  type BusinessSchedule, type ScheduleMode, DIAS_SEMANA,
  emptySchedule, addGroup, removeGroup, setGroupDay, setGroupTramo,
  addGroupTramo, removeGroupTramo, setMode,
} from '@/lib/config/schedule';

// Editor del horario de apertura del negocio (paso "Datos" del onboarding).
// UX: toggle continuo/partido + grupos de días (checkboxes L M X J V S D) con
// sus tramos (<input type="time"> = teclado y ratón). Un día sin grupo = cerrado.
// Marcar un día en un grupo lo quita de los demás (last-wins, ver schedule.ts).
export function HorarioNegocioForm({ value, onChange }: {
  value?: BusinessSchedule;
  onChange: (next: BusinessSchedule) => void;
}) {
  const schedule = value ?? emptySchedule();
  const inputCls = 'rounded-lg border border-gray-300 px-2 py-1 text-sm';

  function switchMode(mode: ScheduleMode) {
    onChange(setMode(schedule, mode));
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="text-xs font-medium text-gray-500">Horario</label>
        {/* Toggle continuo/partido: segmented control accesible (radiogroup). */}
        <div role="radiogroup" aria-label="Tipo de horario" className="inline-flex rounded-lg border border-gray-300 p-0.5 text-xs">
          {([['continuo', 'Horario continuo'], ['partido', 'Horario partido']] as const).map(([m, label]) => (
            <button key={m} type="button" role="radio" aria-checked={schedule.mode === m}
              onClick={() => switchMode(m)}
              className={cn('rounded-md px-2.5 py-1 font-medium',
                schedule.mode === m ? 'bg-[var(--brand-primary)] text-white' : 'text-gray-500 hover:text-[var(--brand-primary)]')}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2 space-y-3">
        {schedule.groups.length === 0 && (
          <p className="text-xs text-gray-400">Sin horario definido: todos los días figuran como cerrados.</p>
        )}
        {schedule.groups.map((g, gi) => (
          <div key={gi} className="rounded-xl border border-gray-200 p-3">
            <div className="flex items-center justify-between gap-2">
              {/* Días del grupo. Marcar un día aquí lo desmarca de otros grupos. */}
              <div className="flex flex-wrap gap-1" role="group" aria-label={`Días del grupo ${gi + 1}`}>
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
              <button type="button" className="row-action danger" title="Quitar grupo" aria-label={`Quitar grupo ${gi + 1}`}
                onClick={() => onChange(removeGroup(schedule, gi))}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-2 space-y-1.5">
              {g.tramos.map((t, ti) => (
                <div key={ti} className="flex items-center gap-2">
                  <input type="time" className={inputCls} value={t.inicio} aria-label={`Inicio tramo ${ti + 1} (grupo ${gi + 1})`}
                    onChange={(e) => onChange(setGroupTramo(schedule, gi, ti, { inicio: e.target.value }))} />
                  <span className="text-gray-400">–</span>
                  <input type="time" className={inputCls} value={t.fin} aria-label={`Fin tramo ${ti + 1} (grupo ${gi + 1})`}
                    onChange={(e) => onChange(setGroupTramo(schedule, gi, ti, { fin: e.target.value }))} />
                  {schedule.mode === 'partido' && g.tramos.length > 2 && (
                    <button type="button" className="row-action danger" title="Quitar tramo" aria-label={`Quitar tramo ${ti + 1} (grupo ${gi + 1})`}
                      onClick={() => onChange(removeGroupTramo(schedule, gi, ti))}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
              {schedule.mode === 'partido' && (
                <button type="button" className="text-xs font-medium text-[var(--brand-primary)] hover:underline"
                  onClick={() => onChange(addGroupTramo(schedule, gi))}>
                  <Plus className="mr-0.5 inline h-3 w-3" /> Añadir tramo
                </button>
              )}
            </div>
          </div>
        ))}

        <button type="button" onClick={() => onChange(addGroup(schedule))}
          className="inline-flex items-center gap-1 rounded-xl border border-dashed border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-[var(--brand-primary)]">
          <Plus className="h-3.5 w-3.5" /> Añadir grupo de días
        </button>
        <p className="text-[11px] text-gray-400">
          Cada grupo aplica su horario a los días marcados. Un día solo puede estar en un grupo
          (al marcarlo se quita del anterior) y los días sin grupo se consideran cerrados.
        </p>
      </div>
    </div>
  );
}
