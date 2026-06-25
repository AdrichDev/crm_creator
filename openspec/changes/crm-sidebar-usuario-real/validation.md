# Validación — crm-sidebar-usuario-real

Historia: como usuario logado quiero ver MIS datos reales en el pie del sidebar, y que el sidebar quede fijo mientras solo el contenido principal scrollea.

## Criterios de aceptación
- **AC1**: El pie del sidebar muestra el nombre, iniciales y rol del usuario logado real (no `DEMO_USERS`).
- **AC2**: Sin sesión → fallback claro ("Invitado"/sin sesión), sin romper.
- **AC3**: El sidebar permanece fijo en viewport; solo el `main` scrollea con contenido largo.
- **AC4**: El colapso del sidebar y el branding siguen funcionando.
- **AC5**: `tsc` limpio, tests front verdes.

## Por tarea (Given-When-Then)
### T1 — usuario real
- **Given** sesión con firstName="Ana", lastName="García", role="admin", **When** render sidebar, **Then** pie muestra "Ana", iniciales "AG", rol "Administrador". _Test mock._
- **Given** sin sesión, **When** render, **Then** muestra fallback sin error. _Test._

### T2 — layout
- **Given** una página con contenido más alto que el viewport, **When** se scrollea, **Then** el `<aside>` no se mueve y el `<main>` sí. _Manual._
- **Given** clic en colapsar, **When** colapsa, **Then** layout sigue correcto. _Manual._
