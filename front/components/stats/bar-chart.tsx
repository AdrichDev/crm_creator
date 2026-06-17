'use client';
import {
  ResponsiveContainer, BarChart as RBarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from 'recharts';

export interface BarSeries { key: string; label: string; color: string; }
export interface BarDatum { label: string; month?: string; [k: string]: number | string | undefined; }

interface Props<T extends { label: string; month?: string }> {
  data: T[];
  series: BarSeries[];
  title: string;
  subtitle?: string;
  formatValue?: (n: number) => string;
  onBarClick?: (label: string, month?: string) => void;
}

interface TooltipPayload { name?: string; value?: number; color?: string; }

// Gráfica de barras agrupadas con recharts, re-tematizada con los tokens del panel.
// Clic en una columna => drilldown (igual que el panel de agents-agency).
export function BarChart<T extends { label: string; month?: string }>({ data, series, title, subtitle, formatValue, onBarClick }: Props<T>) {
  const fmt = formatValue ?? ((n: number) => String(n));

  function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayload[]; label?: string }) {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-lg border border-white/10 bg-[var(--panel-bg)] px-3 py-2 text-xs shadow-lg">
        <p className="mb-1 font-semibold text-[var(--panel-text)]">{label}</p>
        {payload.map((p, i) => (
          <p key={i} className="flex items-center gap-1.5 text-[var(--panel-muted)]">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: p.color }} />
            {p.name}: <span className="text-[var(--panel-text)]">{fmt(Number(p.value ?? 0))}</span>
          </p>
        ))}
      </div>
    );
  }

  function handleClick(state: { activeLabel?: string | number; activePayload?: { payload?: BarDatum }[] }) {
    if (!onBarClick || state?.activeLabel == null) return;
    const month = state.activePayload?.[0]?.payload?.month;
    onBarClick(String(state.activeLabel), typeof month === 'string' ? month : undefined);
  }

  return (
    <div className="panel">
      <div className="mb-3">
        <h2 className="text-base font-semibold text-[var(--panel-text)]">{title}</h2>
        {subtitle && <p className="text-xs text-[var(--panel-muted)]">{subtitle}</p>}
      </div>
      <div style={{ width: '100%', height: 300 }}>
        <ResponsiveContainer>
          <RBarChart data={data} onClick={handleClick} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: 'var(--panel-muted)', fontSize: 12 }} axisLine={{ stroke: 'var(--line)' }} tickLine={false} />
            <YAxis tick={{ fill: 'var(--panel-muted)', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => fmt(Number(v))} width={48} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <Legend wrapperStyle={{ fontSize: 12, color: 'var(--panel-muted)' }} />
            {series.map((s) => (
              <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[3, 3, 0, 0]}
                cursor={onBarClick ? 'pointer' : 'default'} />
            ))}
          </RBarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
