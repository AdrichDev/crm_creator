# Propuesta: Paleta dorada y correcciones UI consola + onboarding

## Cambio
`front-ui-paleta-dorada`

## Contexto
La consola de proyectos del creador_CRM (app/dashboard) y el onboarding presentan varios problemas de color y UX:

- Pestaña "Dashboard" tiene nombre incorrecto → debe llamarse "Proyecto".
- Las cards muestran el ID interno del proyecto (`crm-01`, etc.) → no debe aparecer en la vista de usuario.
- El onboarding usa azul forzado (`#2563eb`) en toda la paleta de acento, ignorando los tokens dorados de la plataforma (`--gold`).
- `VerticalPicker` y `ModuleToggleGrid` tienen azul hardcodeado (`#2563eb`) en los estados seleccionados → descompensado con el resto.
- El botón de cerrar sesión en la consola hace hover en el color de acento (dorado/variable) → debe ser rojo para indicar acción destructiva.
- En modo claro, el hover del botón "Siguiente" (`.btn-primary:hover`) usa `color: var(--panel-bg)` = `#f0f4f9` sobre fondo dorado claro → contraste insuficiente.
- En la pestaña "Exportar", el botón activo usa `var(--acc)` (dorado) → en modo oscuro debe usar paleta neutra (negro/gris/blanco).
- La sección "Carpeta destino" tiene un input de texto editable + botón "Buscar" innecesariamente complejo → simplificar a un único botón "Seleccionar carpeta" con el path mostrado inline.

## Intención
Unificar la paleta de la plataforma (dorado + negro) en todos los puntos de interacción del creador_CRM, corregir problemas de contraste en modo claro, y simplificar la UX de exportación.

## Alcance

### Archivos afectados
- `front/components/dashboard/dashboard-tabs.tsx`
- `front/components/dashboard/export-table.tsx`
- `front/app/dashboard/page.tsx`
- `front/app/globals.css`
- `front/components/config/vertical-picker.tsx`
- `front/components/config/module-toggle-grid.tsx`

### Fuera de alcance
- Lógica de exportación (`use-export-stream`, `export-progress.tsx`)
- Estilos del panel generado (`/panel/**`)
- Backend
