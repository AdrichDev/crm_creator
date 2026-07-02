'use client';
import { VERTICALS, type VerticalId } from '@/lib/config/verticals';
import { cn } from '@/lib/utils';

export function VerticalPicker({ value, onChange }: { value: VerticalId | null; onChange: (v: VerticalId) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {VERTICALS.map((v) => {
        const selected = v.id === value;
        return (
          <button key={v.id} type="button" onClick={() => onChange(v.id)}
            className={cn('rounded-2xl border p-4 text-left transition',
              selected ? 'border-[var(--gold)] ring-2 ring-[var(--gold)]/30' : 'border-gray-200 bg-white hover:border-gray-300')}
            style={selected ? { backgroundColor: 'color-mix(in srgb, var(--gold) 14%, var(--panel-card))' } : undefined}>
            <div className="text-2xl">{v.emoji}</div>
            <p className="mt-2 font-medium text-gray-900">{v.label}</p>
            <p className="mt-0.5 text-xs text-gray-500">{v.tagline}</p>
          </button>
        );
      })}
    </div>
  );
}
