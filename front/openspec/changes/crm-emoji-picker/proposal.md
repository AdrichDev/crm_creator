# Proposal — crm-emoji-picker

**Change:** `crm-emoji-picker` · Nivel 1 · Front-only

## Intent
Reemplazar el `<input maxLength={4}>` de emoji del menú de módulos por un desplegable visual tipo WhatsApp (paleta de emojis con categorías, búsqueda, recientes).

## Scope
| Área | Acción |
|------|--------|
| `front/components/ui/emoji-picker.tsx` | Nuevo — wrapper de `@emoji-mart/react` |
| `front/components/config/module-toggle-grid.tsx` | Modificar — sustituir input por EmojiPicker |
| `package.json` (front) | Añadir `@emoji-mart/react`, `@emoji-mart/data` |

## Constraints
- Sin cambios en BD ni en back.
- El picker se cierra al seleccionar o pulsar fuera.
- El emoji seleccionado sigue almacenándose en `emojis[m.id]` (misma interfaz).
- SSR-safe: `@emoji-mart/react` es client-only, marcar `'use client'`.
- El popover usa el mismo patrón z-30 / overlay blur ya establecido en el proyecto.
