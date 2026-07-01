# Spec — Inicio configurable con widgets favoritos + agenda multi-vista

## Requisitos

### Requisito: Catálogo y selección de widgets (máx. 6)

El sistema DEBE ofrecer un catálogo de widgets de inicio (`DASHBOARD_WIDGETS`). El
admin PUEDE seleccionar como favoritos hasta **6** widgets simultáneos, ni uno más.
Un widget con `dependsOn` un módulo desactivado NO DEBE poder seleccionarse ni
renderizarse aunque estuviera previamente activo.

#### Escenario W-S1 — Seleccionar widgets hasta el límite

- DADO un admin en Configuración → "Widgets del inicio" con 0 widgets activos
- CUANDO marca 6 widgets del catálogo
- ENTONCES los 6 quedan activos y el resto de checkboxes del catálogo se deshabilitan

#### Escenario W-S2 — Intentar superar el límite

- DADO un admin con 6 widgets ya activos
- CUANDO intenta marcar un 7º widget
- ENTONCES el checkbox del 7º está deshabilitado y no se puede marcar (sin diálogo de error)

#### Escenario W-S3 — Widget sin módulo dependiente

- DADO el widget `ventas-hoy` (`dependsOn: 'ventas'`) activo en config
- CUANDO el admin desactiva el módulo `ventas` en Configuración
- ENTONCES `ventas-hoy` deja de renderizarse en `/panel` aunque siga marcado como favorito

---

### Requisito: Grid de mosaico en `/panel`

`/panel` (vista admin/trabajador) DEBE renderizar únicamente los widgets activos
(`activeDashboardWidgets`) en un grid de mosaico con tamaños `sm` (1×1), `md` (2×1) y
`lg` (2×2) fijos por catálogo. Si no hay ningún widget activo, DEBE mostrar un empty
state con enlace directo a Configuración (no una pantalla en blanco).

#### Escenario W-S4 — Grid con widgets activos

- DADO un negocio con `dashboardWidgets = ['agenda', 'kpis-hoy', 'proximos-eventos']`
- CUANDO el admin abre `/panel`
- ENTONCES ve 3 fichas: Agenda en tamaño grande (2×2) y las otras dos en su tamaño de catálogo

#### Escenario W-S5 — Sin widgets seleccionados

- DADO un negocio con `dashboardWidgets = []`
- CUANDO el admin abre `/panel`
- ENTONCES ve un mensaje de estado vacío con un enlace a "Configuración" para elegir widgets

---

### Requisito: Widget Agenda con vistas mes/semana/día

El widget `agenda` DEBE ofrecer tres vistas intercambiables: **mes**, **semana** y
**día**. Cambiar de vista NO DEBE perder el día seleccionado (si estaba seleccionado
el 15, al pasar a vista semana esa semana DEBE incluir el día 15 ya marcado). Las
citas mostradas DEBEN usar el término resuelto por vertical (`useTerm('citas', ...)`),
sin texto literal "Citas" hardcodeado en el widget.

#### Escenario W-S6 — Vista mes (comportamiento ya existente)

- DADO el widget Agenda en vista mes
- CUANDO hay 2 citas el día 15
- ENTONCES la celda del día 15 muestra un indicador (punto) de eventos

#### Escenario W-S7 — Cambiar a vista semana conserva selección

- DADO el día 15 seleccionado en vista mes
- CUANDO el admin cambia a vista semana
- ENTONCES la semana mostrada contiene el día 15, marcado como seleccionado

#### Escenario W-S8 — Vista día lista eventos por hora

- DADO la vista día con fecha seleccionada con 3 citas a distintas horas
- CUANDO se renderiza
- ENTONCES las 3 citas aparecen ordenadas por hora ascendente

#### Escenario W-S9 — Término dinámico por vertical

- DADO un negocio vertical `centro-deportivo` (`terminology.citas = 'Entrenamientos'`)
- CUANDO se abre el widget Agenda
- ENTONCES los textos del widget usan "Entrenamientos", no "Citas"

---

### Requisito: Persistencia y migración de configuración existente

`TenantConfig.dashboardWidgets` DEBE persistirse en localStorage igual que el resto
de la config del tenant. Una config ya guardada SIN este campo (clientes existentes)
DEBE recibir un default por vertical al cargar, no un array vacío ni un crash.

#### Escenario W-S10 — Config antigua sin el campo

- DADO un `TenantConfig` en localStorage guardado antes de este cambio (sin `dashboardWidgets`)
- CUANDO la app lo carga
- ENTONCES `dashboardWidgets` queda poblado con el default del vertical del negocio, no `undefined`

#### Escenario W-S11 — Config corrupta con más de 6

- DADO un `TenantConfig` con `dashboardWidgets` de 9 elementos (editado a mano o de una versión rota)
- CUANDO la app lo carga
- ENTONCES solo se activan los primeros 6
