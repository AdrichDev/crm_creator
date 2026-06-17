'use client';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';

export interface Slice { name: string; value: number; }

interface Props {
  title: string;
  data: Slice[];
  colors: string[];
  totalLabel?: string;
}

interface TooltipPayload { name?: string; value?: number; payload?: { fill?: string } }

// Donut con recharts, re-tematizado con los tokens del panel.
export function DonutChart({ title, data, colors, totalLabel }: Props) {
  const total = data.reduce((a, d) => a + d.value, 0);

  function CustomTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
    if (!active || !payload?.length) return null;
    const p = payload[0];
    const pct = total > 0 ? Math.round((Number(p.value ?? 0) / total) * 100) : 0;
    return (
      <div className="rounded-lg border border-white/10 bg-[var(--panel-bg)] px-3 py-2 text-xs shadow-lg">
        <span className="flex items-center gap-1.5 text-[var(--panel-text)]">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: p.payload?.fill }} />
          {p.name}: <span className="font-semibold">{p.value}</span> ({pct}%)
        </span>
      </div>
    );
  }

  return (
    <div className="panel">
      <h2 className="mb-3 text-base font-semibold text-[var(--panel-text)]">{title}</h2>
      {total === 0 ? (
        <p className="empty-state">Sin datos</p>
      ) : (
        <div className="flex items-center gap-4">
          <div style={{ width: 160, height: 160 }} className="relative shrink-0">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" innerRadius={50} outerRadius={75} paddingAngle={2} stroke="none">
                  {data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-bold text-[var(--panel-text)]">{total}</span>
              {totalLabel && <span className="text-[10px] uppercase tracking-wide text-[var(--panel-muted)]">{totalLabel}</span>}
            </div>
          </div>
          <ul className="min-w-0 flex-1 space-y-1.5">
            {data.map((d, i) => (
              <li key={d.name} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-center gap-1.5 text-[var(--panel-muted)]">
                  <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: colors[i % colors.length] }} />
                  <span className="truncate">{d.name}</span>
                </span>
                <span className="shrink-0 font-medium text-[var(--panel-text)]">{d.value}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
