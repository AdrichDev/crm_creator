'use client';

// Valoración por estrellas. Adaptada a los tokens del CRM:
// estrella activa usa el color de acento (var(--acc)); vacía, el muted.
// En modo editable permite fijar el valor con clic.

interface StarRatingProps {
  value: number | null | undefined;
  max?: number;
  editable?: boolean;
  onChange?: (v: number) => void;
  size?: 'sm' | 'md';
}

export function StarRating({
  value,
  max = 5,
  editable = false,
  onChange,
  size = 'sm',
}: StarRatingProps) {
  const stars = Array.from({ length: max }, (_, i) => i + 1);
  const sizeCls = size === 'sm' ? 'text-sm' : 'text-base';
  const label = `Valoración: ${value ?? 'sin valorar'} de ${max}`;

  if (editable && onChange) {
    return (
      <span className={`inline-flex gap-0.5 ${sizeCls}`} aria-label={label}>
        {stars.map((s) => {
          const on = !!value && s <= value;
          return (
            <button
              key={s}
              type="button"
              onClick={() => onChange(s)}
              className="cursor-pointer transition-colors focus:outline-none"
              style={{ color: on ? 'var(--acc)' : 'var(--panel-muted)' }}
              aria-label={`${s} estrella${s !== 1 ? 's' : ''}`}
            >
              {on ? '★' : '☆'}
            </button>
          );
        })}
      </span>
    );
  }

  return (
    <span className={`inline-flex gap-0.5 ${sizeCls}`} aria-label={label}>
      {stars.map((s) => {
        const on = !!value && s <= value;
        return (
          <span key={s} style={{ color: on ? 'var(--acc)' : 'var(--panel-muted)' }}>
            {on ? '★' : '☆'}
          </span>
        );
      })}
    </span>
  );
}
