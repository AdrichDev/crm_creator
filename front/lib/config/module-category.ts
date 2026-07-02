// Categoría efectiva de un módulo dentro de un vertical. El override del
// vertical (`VerticalDef.moduleCategories`) manda; si no hay, cae a la
// categoría global del catálogo (`MODULES`). Permite recolocar un módulo
// (p. ej. `comercial` en "Esencial" para el vertical `comerciales`) sin
// duplicar el catálogo por vertical.
import { CATEGORY_LABEL, MODULE_MAP, type ModuleCategory, type ModuleDef, type ModuleId } from './modules';
import { VERTICAL_MAP, type VerticalId } from './verticals';

export function effectiveCategory(vertical: VerticalId, moduleId: ModuleId): ModuleCategory {
  return VERTICAL_MAP[vertical]?.moduleCategories?.[moduleId] ?? MODULE_MAP[moduleId].category;
}

export interface ModuleGroup {
  cat: ModuleCategory;
  items: ModuleDef[];
}

/**
 * Agrupa módulos por categoría efectiva, en el orden fijo de `CATEGORY_LABEL`
 * (Esencial → Operativa → Personas → Retail → Marketing); los grupos vacíos
 * no aparecen. Sin `vertical`, usa la categoría global de cada módulo.
 */
export function groupModules(modules: ModuleDef[], vertical?: VerticalId): ModuleGroup[] {
  const categoryOf = (m: ModuleDef) => (vertical ? effectiveCategory(vertical, m.id) : m.category);
  return (Object.keys(CATEGORY_LABEL) as ModuleCategory[])
    .map((cat) => ({ cat, items: modules.filter((m) => categoryOf(m) === cat) }))
    .filter((g) => g.items.length > 0);
}
