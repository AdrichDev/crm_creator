# Design — crm-views-roles

## D1 — Tipo Views en tenant-config.ts
```ts
export interface BusinessViews {
  worker: boolean;  // vista empleados/trabajadores
  client: boolean;  // vista cliente final
}
// En TenantConfig añadir:
views?: BusinessViews;
// Helper default:
export const DEFAULT_VIEWS: BusinessViews = { worker: true, client: false };
```

## D2 — Módulos afectados (modules.ts)
Añadir `requiresWorkerView?: boolean`:
- `empleados` → `requiresWorkerView: true`
- `fichaje` → `requiresWorkerView: true`
- `vacaciones` → `requiresWorkerView: true`

## D3 — UI en ModuleToggleGrid
Nueva prop: `views: BusinessViews` + `onViewsChange: (v: BusinessViews) => void`  

Selector encima de la rejilla (3 chip-checkboxes):
```
[✓ Admin (siempre)] [✓/☐ Trabajador] [✓/☐ Cliente]
```
Estilo: pill con borde, check verde si activo, gris si no.

Al desactivar Trabajador → llama `onViewsChange` + llama `onToggle` para cada módulo requiresWorkerView para desactivarlo.

Un módulo con `requiresWorkerView && !views.worker`:
- `disabled` = true
- `opacity-40 cursor-not-allowed`
- Tooltip o `title="Requiere vista Trabajador"`

## D4 — Propagación en onboarding/page.tsx
```ts
const [views, setViews] = useState<BusinessViews>(() =>
  (editing?.config?.views as BusinessViews | undefined) ?? DEFAULT_VIEWS
);
function changeViews(v: BusinessViews) {
  if (!v.worker) {
    // desactivar módulos de personas
    MODULES.filter(m => m.requiresWorkerView).forEach(m => {
      if (draft.modules[m.id]) onToggle(m.id, false);
    });
  }
  setViews(v);
  setDraft(d => ({ ...d, views: v }));
}
```

## D5 — Archivos
| Archivo | Acción |
|---------|--------|
| `front/lib/config/modules.ts` | Añadir `requiresWorkerView?` |
| `front/lib/config/tenant-config.ts` | Añadir `BusinessViews`, `DEFAULT_VIEWS`, campo `views?` |
| `front/components/config/module-toggle-grid.tsx` | Selector vistas + disable lógica |
| `front/app/onboarding/page.tsx` | Estado `views`, prop `onViewsChange` |
