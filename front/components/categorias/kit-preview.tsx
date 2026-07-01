import type { DeporteType } from '@/lib/config/sport-positions';

interface Props {
  deporte: DeporteType;
  color: string;
  label: string;
}

// Silueta de equipación según el deporte. Simplificado a 3 familias de forma:
// camiseta de fútbol (mangas + cuello en V), camiseta de baloncesto (sin mangas,
// sisas profundas) y traje de una pieza (natación/halterofilia). El resto cae en
// la camiseta genérica.
function KitShape({ deporte, color }: { deporte: DeporteType; color: string }) {
  const stroke = 'rgba(0,0,0,0.35)';

  if (deporte === 'BALONCESTO') {
    return (
      <path
        d="M22 6 L42 6 L42 12 L54 18 L48 30 L42 26 L42 58 L22 58 L22 26 L16 30 L10 18 L22 12 Z"
        fill={color}
        stroke={stroke}
        strokeWidth={1.5}
      />
    );
  }

  if (deporte === 'NATACION' || deporte === 'HALTEROFILIA') {
    return (
      <path
        d="M24 6 L40 6 L40 14 L46 20 L46 50 Q46 58 38 58 L26 58 Q18 58 18 50 L18 20 L24 14 Z"
        fill={color}
        stroke={stroke}
        strokeWidth={1.5}
      />
    );
  }

  // Fútbol (11 / 7 / sala) y OTRO: camiseta con mangas y cuello en V.
  return (
    <path
      d="M22 6 L32 12 L42 6 L54 14 L48 26 L42 22 L42 58 L22 58 L22 22 L16 26 L10 14 Z"
      fill={color}
      stroke={stroke}
      strokeWidth={1.5}
    />
  );
}

/** Preview de equipación (local/visitante) coloreada según el deporte del equipo. */
export function KitPreview({ deporte, color, label }: Props) {
  return (
    <div className="flex flex-col items-center gap-1">
      <svg viewBox="0 0 64 64" className="h-16 w-16">
        <KitShape deporte={deporte} color={color} />
      </svg>
      <span className="text-xs text-[var(--panel-muted)]">{label}</span>
    </div>
  );
}
