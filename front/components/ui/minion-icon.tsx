import { useId } from 'react';

// Icono de marca del asistente "Minion" de OperaOS / 3A Estudio. Interpretación
// geométrica propia (cápsula amarilla + goggle monocular + peto azul), NO es un
// calco del diseño registrado de terceros. SVG inline para poder usarlo en el
// chip flotante y en headers sin dependencias externas.
export function MinionIcon({ className }: { className?: string }) {
  // clipPath con id único por instancia: el icono puede montarse varias veces
  // en la misma página (chip + header) sin colisión de ids en el DOM.
  const clipId = useId();
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={clipId}>
          <rect x="6.5" y="2" width="11" height="20" rx="5.5" />
        </clipPath>
      </defs>
      {/* Cabeza: cápsula amarilla */}
      <rect x="6.5" y="2" width="11" height="20" rx="5.5" fill="#FFE033" />
      <g clipPath={`url(#${clipId})`}>
        {/* Peto azul denim */}
        <rect x="6.5" y="16.5" width="11" height="5.5" fill="#3B5BA5" />
        {/* Correa del goggle */}
        <rect x="6.5" y="8" width="11" height="1.8" fill="#3F3F3F" />
      </g>
      {/* Goggle monocular: marco plateado + borde negro */}
      <circle cx="12" cy="8.9" r="3.5" fill="#C7C7C7" stroke="#2B2B2B" strokeWidth="0.9" />
      <circle cx="12" cy="8.9" r="2.3" fill="#FFFFFF" />
      <circle cx="12" cy="8.9" r="1.15" fill="#6B4F2A" />
      <circle cx="12" cy="8.9" r="0.5" fill="#1F1F1F" />
      {/* Sonrisa */}
      <path d="M10.2 13.6q1.8 1.5 3.6 0" fill="none" stroke="#1F1F1F" strokeWidth="0.85" strokeLinecap="round" />
    </svg>
  );
}
