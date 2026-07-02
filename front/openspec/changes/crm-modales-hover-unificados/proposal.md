# Proposal: Modales unificados + hovers con color secundario theme-aware

## Intent

Los modales del CRM no comparten un único visual: la mayoría usa el componente base
`Modal` (`components/ui/modal.tsx`, clases `opera-modal-*`: borde dorado `--acc`,
header con título uppercase, botón cerrar rotatorio), pero tres modales de creación
(`nueva-cita-modal`, `nueva-clase-modal`, `nueva-entrenamiento-modal`) y el
`dialog-provider` (confirm/alert) montan su propio overlay ad-hoc
(`rounded-2xl bg-[var(--panel-bg,#fff)]`, sin borde ni header opera).

Además los hovers no siguen el color secundario de marca (`--brand-secondary` /
`--acc-light`) y fallan por tema:
- En modo claro: `--acc-light` (#e5c158) no se redefine → hovers amarillo pálido casi
  invisibles sobre fondo lino; además hay `hover:text-white`, `hover:bg-white/5`.
- En modo oscuro: hovers neutros casi negros (`rgba(255,255,255,0.02-0.05)` apenas
  perceptibles) y utilidades gray claras (`hover:bg-gray-50`, `hover:text-gray-800`,
  `hover:border-gray-300/400`) que rompen el tema.

Regla de negocio pedida: todo hover usa el color secundario, adaptado al tema —
en claro nunca blanco/claro invisible, en oscuro nunca negro/oscuro.

## Scope

### In Scope

1. **Tokens de hover theme-aware** en `app/globals.css`:
   - `:root` (oscuro): `--hover-bg: color-mix(in srgb, var(--acc-light) 14%, transparent);`
     `--hover-text: var(--acc-light);` `--hover-border: var(--acc-light);`
   - `:root[data-theme="light"]`: secundario profundo legible sobre lino
     (`--hover-text: #8a6516; --hover-bg: color-mix(in srgb, #8a6516 10%, transparent);
     --hover-border: #8a6516;` — mismo dorado oscuro ya usado por data-table/onboarding claro).
2. **Migrar hovers neutros a tokens**:
   - `globals.css`: `.row-action.edit:hover`, `.equipo-card:hover`,
     `.data-table tr:hover td` (oscuro), `.widget-tile-open:hover` (color #fff),
     `.opera-sidebar-links a:hover`, `.btn-*:hover` que usen blancos/negros directos.
   - Tailwind en componentes: `hover:text-white`, `hover:bg-white/5`,
     `hover:bg-gray-50`, `hover:text-gray-600/800/900`, `hover:border-gray-300/400`
     → `hover:text-[var(--hover-text)]`, `hover:bg-[var(--hover-bg)]`,
     `hover:border-[var(--hover-border)]`.
   - Excepción explícita: hovers semánticos se mantienen (danger rojo, approve verde,
     estados azul/emerald/orange con significado propio).
3. **Modales con contraste garantizado** (decisión usuario 02/07/2026: las modales
   "nueva-*" CONSERVAN su estilo propio, no se migran al chasis opera):
   - `nueva-cita-modal.tsx`, `nueva-clase-modal.tsx`, `nueva-entrenamiento-modal.tsx`
     → mantener su visual actual, pero con borde theme-aware: en modo oscuro borde
     blanco/claro (contraste sobre backdrop negro); en modo claro borde oscuro/cálido.
     Nunca un borde que se funda con el fondo.
   - `dialog-provider.tsx` → panel interno con clases `opera-modal-*`.
4. **Blur de fondo universal en modales**: todo backdrop de modal aplica un blur
   pequeño (`backdrop-filter: blur(4px)`), en claro y oscuro — opera-modal (ya lo
   tiene), modales "nueva-*", dialog-provider y cualquier otro overlay modal.
5. **Paridad crear/editar cita en carga de horas**: el modal de edición de citas
   (`app/(crm)/citas/page.tsx`, hoy `EntityModal` con `type: 'time'` plano) debe
   cargar las horas igual que `NuevaCitaModal`: chips de slots vía
   `GET /bookings/slots` (`HoraChips`) con fallback a `<input type="time">` si la
   API falla o no está habilitada.

### Out of Scope

- `client-combobox.tsx` y `emoji-picker.tsx` (popovers/dropdowns, no modales).
- `export-progress.tsx` (overlay de progreso, no modal de interacción).
- Rediseño del componente base `Modal` (ya es el canon; no se toca su API).
- Backend. Cambio 100% front.

## Approach

Un solo sistema: tokens CSS por tema + sustitución mecánica de utilidades ofensoras +
migración de 3 modales y dialog-provider al componente base. Sin librerías nuevas.

## Level

Nivel 2 (Medium): ~12 archivos front, 1 dominio (UI), reversible. SDD Light.
