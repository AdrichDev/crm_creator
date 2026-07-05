'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { buildMonthCells, buildWeekCells, buildDayCell, type CalCell } from '@/lib/utils/calendar';
import { DOW, DOW_FULL, MESES, MESES_ABBR } from '@/lib/config/constants';
import { dateStr } from '@/lib/utils/format';

// Gramática visual reusable de la Agenda (mes/semana/día), extraída de
// AgendaWidget (crm-operaos-agenda-contactos-fichaje-telegram WU1). AgendaWidget
// y /citas consumen este mismo componente para no divergir en la vista; cada
// consumidor controla sus propios datos y el contenido de cada tarjeta
// (`renderCard`), la grilla solo resuelve navegación mes/semana/día y layout.
export type AgendaVista = 'mes' | 'semana' | 'dia';
export const AGENDA_VISTAS: { id: AgendaVista; label: string }[] = [
  { id: 'mes', label: 'Mes' },
  { id: 'semana', label: 'Semana' },
  { id: 'dia', label: 'Día' },
];

export interface AgendaItem {
  fecha: string; // 'YYYY-MM-DD'
  hora: string;  // 'HH:mm'
}

function parseFecha(fecha: string): Date {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const HORA_MIN_DEFECTO = 7;
const HORA_MAX_DEFECTO = 22;

/** Franja horaria a mostrar en vista día: 07–22h, ampliada si hay eventos fuera de rango. */
function buildHoras(eventos: AgendaItem[]): number[] {
  let min = HORA_MIN_DEFECTO;
  let max = HORA_MAX_DEFECTO;
  for (const e of eventos) {
    const h = parseInt(e.hora.slice(0, 2), 10);
    if (Number.isNaN(h)) continue;
    if (h < min) min = h;
    if (h > max) max = h;
  }
  const horas: number[] = [];
  for (let h = min; h <= max; h++) horas.push(h);
  return horas;
}

function periodoLabel(vista: AgendaVista, cursor: Date, semana: CalCell[]): string {
  if (vista === 'mes') return `${MESES[cursor.getMonth()]} ${cursor.getFullYear()}`;
  if (vista === 'dia') {
    const wd = DOW_FULL[(cursor.getDay() + 6) % 7];
    return `${wd} ${cursor.getDate()} de ${MESES[cursor.getMonth()]}`;
  }
  const ini = parseFecha(semana[0].date);
  const fin = parseFecha(semana[6].date);
  const mismaMes = ini.getMonth() === fin.getMonth();
  return mismaMes
    ? `${ini.getDate()}–${fin.getDate()} ${MESES_ABBR[ini.getMonth()]} ${fin.getFullYear()}`
    : `${ini.getDate()} ${MESES_ABBR[ini.getMonth()]} – ${fin.getDate()} ${MESES_ABBR[fin.getMonth()]} ${fin.getFullYear()}`;
}

export interface AgendaGridProps<T extends AgendaItem> {
  items: T[];
  /** Mensaje cuando el día seleccionado no tiene eventos (término sectorial: citas/reservas/clases). */
  emptyLabel: string;
  getKey: (item: T) => string | number;
  /** Tarjeta completa del evento; `compact` indica vista semana/día (paridad con AgendaWidget). */
  renderCard: (item: T, ctx: { compact: boolean }) => ReactNode;
  /** Solo para tests: fija la fecha inicial en vez de `new Date()`. */
  initialDate?: Date;
  onSelectedChange?: (fecha: string) => void;
}

export function AgendaGrid<T extends AgendaItem>({
  items, emptyLabel, getKey, renderCard, initialDate, onSelectedChange,
}: AgendaGridProps<T>) {
  const [vista, setVista] = useState<AgendaVista>('mes');
  const [cursor, setCursor] = useState<Date | null>(null);
  const [selected, setSelected] = useState<string>('');

  // Fechas SOLO en cliente (evita mismatch de hidratación con el servidor).
  useEffect(() => {
    const hoy = initialDate ?? new Date();
    setCursor(hoy);
    setSelected(dateStr(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const porDia = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of items) map.set(it.fecha, (map.get(it.fecha) ?? 0) + 1);
    return map;
  }, [items]);

  if (!cursor) return <p className="empty-state">Cargando agenda…</p>;

  const semanaCells = buildWeekCells(cursor);
  const cells: (CalCell | null)[] =
    vista === 'mes' ? buildMonthCells(cursor.getFullYear(), cursor.getMonth())
    : vista === 'semana' ? semanaCells
    : [buildDayCell(cursor)];

  function cambiarVista(v: AgendaVista) {
    // Recentra el periodo en el día seleccionado al cambiar de vista (no se pierde la selección).
    setCursor(selected ? parseFecha(selected) : new Date());
    setVista(v);
  }

  function navegar(delta: number) {
    setCursor((c) => {
      const next = new Date(c ?? new Date());
      if (vista === 'mes') next.setMonth(next.getMonth() + delta);
      else if (vista === 'semana') next.setDate(next.getDate() + delta * 7);
      else next.setDate(next.getDate() + delta);
      return next;
    });
  }

  function seleccionar(date: string) {
    setSelected(date);
    onSelectedChange?.(date);
  }

  const hoyStr = dateStr(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const eventosDelDia = items
    .filter((it) => it.fecha === selected)
    .sort((a, b) => a.hora.localeCompare(b.hora));

  return (
    <div className="agenda-widget">
      <div className="agenda-widget-head">
        <div className="agenda-widget-nav">
          <button type="button" className="btn btn-outline btn-sm" onClick={() => navegar(-1)}>&lt;</button>
          <span className="capitalize">{periodoLabel(vista, cursor, semanaCells)}</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => navegar(1)}>&gt;</button>
          <div className="agenda-widget-views">
            {AGENDA_VISTAS.map((v) => (
              <button
                key={v.id}
                type="button"
                className={`btn btn-sm ${vista === v.id ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => cambiarVista(v.id)}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {vista === 'mes' && (
        <>
          <div className="calendar-grid-header">{DOW.map((d) => <div key={d}>{d}</div>)}</div>
          <div className="calendar-days calendar-days-mes">
            {cells.map((cell, i) => {
              if (!cell) return <div key={`e${i}`} className="calendar-day empty" />;
              const n = porDia.get(cell.date) ?? 0;
              const cls = ['calendar-day'];
              if (cell.date === selected) cls.push('active');
              if (cell.date === hoyStr) cls.push('today');
              return (
                <div key={cell.date} className={cls.join(' ')} onClick={() => seleccionar(cell.date)}>
                  <span>{cell.d}</span>
                  {n > 0 && <span className="appointment-dot" />}
                </div>
              );
            })}
          </div>

          <div className="agenda-widget-day-list">
            {eventosDelDia.length === 0
              ? <p className="empty-state">{emptyLabel}</p>
              : eventosDelDia.map((it) => <div key={getKey(it)}>{renderCard(it, { compact: false })}</div>)}
          </div>
        </>
      )}

      {vista === 'semana' && (
        <div className="agenda-week-grid">
          {semanaCells.map((cell) => {
            const delDia = items
              .filter((it) => it.fecha === cell.date)
              .sort((a, b) => a.hora.localeCompare(b.hora));
            const cls = ['agenda-week-col'];
            if (cell.date === selected) cls.push('active');
            if (cell.date === hoyStr) cls.push('today');
            const dow = (parseFecha(cell.date).getDay() + 6) % 7;
            return (
              <div key={cell.date} className={cls.join(' ')} onClick={() => seleccionar(cell.date)}>
                <div className="agenda-week-col-head">
                  <span className="dow">{DOW[dow]}</span>
                  <span className="d">{cell.d}</span>
                </div>
                <div className="agenda-week-col-body">
                  {delDia.map((it) => <div key={getKey(it)}>{renderCard(it, { compact: true })}</div>)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {vista === 'dia' && (
        <div className="agenda-hour-grid">
          {buildHoras(eventosDelDia).map((h) => {
            const enEstaHora = eventosDelDia.filter((it) => parseInt(it.hora.slice(0, 2), 10) === h);
            return (
              <div key={h} className="agenda-hour-row">
                <div className="agenda-hour-label">{String(h).padStart(2, '0')}:00</div>
                <div className="agenda-hour-slot">
                  {enEstaHora.map((it) => <div key={getKey(it)}>{renderCard(it, { compact: true })}</div>)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
