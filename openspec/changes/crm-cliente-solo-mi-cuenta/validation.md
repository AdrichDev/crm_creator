# Validación — crm-cliente-solo-mi-cuenta

Historia: como cliente quiero ver solo mi vista normal (mis citas, catálogo) y "Mi Cuenta" para editar mi perfil — nunca el panel de configuración admin (branding/módulos/usuarios).

## Criterios de aceptación
- **AC1**: El rol cliente NO ve el módulo Configuración admin en el sidebar.
- **AC2**: El cliente ve "Mi Cuenta" y puede editar su perfil ahí.
- **AC3**: Un cliente que navega a `/configuracion` por URL es redirigido (no accede).
- **AC4**: Los endpoints de config rechazan (403) a un token de cliente (authz server-side).
- **AC5**: Admin y trabajador no cambian su acceso. `tsc` + tests verde.

## Por tarea (Given-When-Then)
### A — roles
- **Given** rol cliente, **When** `moduleAllowedForRole('cliente','configuracion')`, **Then** `false`. _Test._
- **Given** rol cliente, **When** se construye el sidebar, **Then** no aparece Configuración; aparece "Mi Cuenta". _Test._

### B — guard
- **Given** sesión cliente, **When** va a `/configuracion`, **Then** redirige a `/cuenta`/home. _Test/manual._
- **Given** sesión admin, **When** va a `/configuracion`, **Then** entra normal. _Manual._

### C — authz back
- **Given** token de cliente, **When** llama un endpoint admin de config, **Then** 403. _Test._
