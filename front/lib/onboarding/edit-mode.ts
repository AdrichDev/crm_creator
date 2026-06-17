// Lógica pura del modo edición del onboarding (UC-1).
// El onboarding se reutiliza para EDITAR un proyecto existente: con `?projectId=`
// se pre-carga su config en vez de crear una nueva. Aquí viven las piezas puras
// (sin React) para poder testearlas sin montar el wizard.

import type { TenantConfig } from '@/lib/config/tenant-config';
import { emptyModules } from '@/lib/config/tenant-config';
import { emptyWorkerChips } from '@/lib/config/worker-chips';

/**
 * Prepara el draft inicial para EDITAR un proyecto.
 *
 * - Copia profunda de la config (no mutar el proyecto persistido hasta "Guardar").
 * - Fusiona el catálogo de módulos/chips por si la config es antigua y no tiene
 *   módulos nuevos (mismo patrón tolerante que `deserialize`): así aparecen en el
 *   grid sin romper, sin perder los valores ya elegidos.
 *
 * Quitar un módulo en el grid solo pone su flag a `false` (se OCULTA en el CRM);
 * no borra datos del proyecto en localStorage. El borrado físico de tablas queda
 * fuera de alcance (sería acción destructiva con aprobación humana).
 */
export function draftForEdit(config: TenantConfig): TenantConfig {
  const clone = structuredClone(config);
  return {
    ...clone,
    modules: { ...emptyModules(), ...clone.modules },
    workerChips: { ...emptyWorkerChips(), ...clone.workerChips },
  };
}
