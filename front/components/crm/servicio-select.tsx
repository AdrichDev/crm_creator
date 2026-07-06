'use client';

// Selector de Servicio seccionado (crm-citas-servicio-seccionado): un <select> nativo
// con <optgroup>s que reparte el catálogo real del negocio (GET /services → crm.servicio)
// en dos secciones. Reutilizado por NuevaCitaModal (alta) y por el editor de citas
// (EntityModal). Toda opción SIEMPRE lleva un serviceId real → no rompe el contrato de
// POST/PATCH /bookings (que valida serviceId contra una fila de crm.servicio).

/** Forma mínima de un servicio que necesita el selector (subset de crm.servicio). */
export interface ServiceOpt {
  id: string;
  nombre: string;
  precio?: number | string;
  duracion?: number;
  reservableOnline?: boolean;
  requiereProfesional?: boolean;
  categoria?: string | null;
}

export interface ServicioGroups {
  /** Catálogo comercial real (productos/servicios con tarifa, reservables online). */
  tarifas: ServiceOpt[];
  /** Tareas y reuniones comerciales (sembradas con reservableOnline=false, precio 0). */
  tareas: ServiceOpt[];
}

/**
 * Reparte los servicios en dos secciones. Criterio: las tareas/reuniones comerciales
 * (Visita comercial, Llamada de seguimiento, Reunión, Demostración, Presentación de
 * presupuesto) se siembran como crm.servicio con `reservableOnline=false` y `precio=0`
 * (ver back/src/scripts/seed-citas-comercial-demo-live.ts). El catálogo real
 * (interiorismo/paisajismo, etc.) usa el valor por defecto `reservableOnline=true` o
 * tiene tarifa. Señal primaria: `reservableOnline === false` → "Tareas y reuniones".
 * El precio 0 refuerza la clasificación pero no la decide (un servicio real puede ser
 * gratuito y seguir siendo reservable).
 */
export function groupServices(services: ServiceOpt[]): ServicioGroups {
  const tarifas: ServiceOpt[] = [];
  const tareas: ServiceOpt[] = [];
  for (const s of services) {
    const esTarea = s.reservableOnline === false && Number(s.precio ?? 0) === 0;
    (esTarea ? tareas : tarifas).push(s);
  }
  return { tarifas, tareas };
}

export function ServicioSelect({
  services,
  value,
  onChange,
  className,
  currentLabel,
  placeholder = 'Selecciona servicio…',
}: {
  services: ServiceOpt[];
  value: string;
  onChange: (serviceId: string) => void;
  className?: string;
  /** Etiqueta del servicio ya seleccionado si aún no está en `services` (edición). */
  currentLabel?: string;
  placeholder?: string;
}) {
  const { tarifas, tareas } = groupServices(services);
  // Si el valor actual no está en la lista cargada (p. ej. edición con el catálogo aún
  // sin resolver), se incluye como opción suelta para no descartar la selección previa.
  const known = services.some((s) => s.id === value);

  return (
    <select className={className} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {!known && value ? <option value={value}>{currentLabel ?? value}</option> : null}
      {tarifas.length > 0 && (
        <optgroup label="Servicios y tarifas">
          {tarifas.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </optgroup>
      )}
      {tareas.length > 0 && (
        <optgroup label="Tareas y reuniones">
          {tareas.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </optgroup>
      )}
    </select>
  );
}
