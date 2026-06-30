# Proposal — crm-views-roles

**Change:** `crm-views-roles` · Nivel 2 · Front + config JSON

## Intent
Añadir un selector de "vistas" por negocio en el paso Módulos del onboarding.  
Las vistas definen qué tipos de usuario acceden al CRM:
- **Admin** — siempre activa (operador del negocio)
- **Trabajador** — opcional; si se desactiva, los módulos de personal quedan bloqueados
- **Cliente** — opcional; habilita acceso de cliente final (reservas, facturas)

Si no se activa "Trabajador", los módulos `empleados`, `fichaje`, `vacaciones` se deshabilitan automáticamente (no seleccionables).

## Scope
| Área | Acción |
|------|--------|
| `front/lib/config/modules.ts` | Añadir `requiresWorkerView?: boolean` a `ModuleDef` + marcar módulos de personas |
| `front/lib/config/tenant-config.ts` | Añadir `views: { worker: boolean; client: boolean }` al tipo config |
| `front/components/config/module-toggle-grid.tsx` | Añadir selector de vistas + deshabilitar módulos bloqueados |
| `front/app/onboarding/page.tsx` | Propagar estado de vistas hacia el grid |

## Constraints
- Sin cambios en Prisma ni en BD (las vistas se almacenan en el JSON de `BusinessSetting`).
- Admin siempre habilitada (no editable).
- Si Trabajador se desactiva: los módulos de personas se auto-desactivan en `draft.modules`.
- Todos los tests deben pasar.
