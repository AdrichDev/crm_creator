# Validación — crm-perfil-editable

Historia: como usuario quiero editar mi nombre, apellido y teléfono, y cambiar mi contraseña (introduciendo la antigua, o pidiendo un reset si no la recuerdo), sin poder tocar los datos de otro usuario.

## Criterios de aceptación
- **AC1**: Puedo editar nombre/apellido/teléfono; persiste y se recarga correcto.
- **AC2**: Para cambiar la contraseña debo introducir la **antigua** correcta; si es incorrecta, no cambia y veo error.
- **AC3**: Existe "¿No recuerdas tu contraseña?" que envía email de reset (mensaje neutro).
- **AC4**: La nueva contraseña respeta la política (mín. 12, letra+número).
- **AC5**: El endpoint de perfil solo afecta a MI usuario (sesión); ignora ids del body.
- **AC6**: Ningún log imprime contraseñas. `tsc` + tests verde.

## Por tarea (Given-When-Then)
### A.2 — PATCH /auth/profile
- **Given** sesión válida, **When** PATCH con `{firstName:"Ana", phone:"600..."}`, **Then** 200 y `User` actualizado. _Test._
- **Given** sin token, **When** PATCH, **Then** 401. _Test._
- **Given** body con `id` de otro usuario, **When** PATCH, **Then** se ignora; solo cambia el de la sesión. _Test._
- **Given** `firstName` vacío, **When** PATCH, **Then** 422. _Test._

### C.2 — cambio de contraseña
- **Given** antigua incorrecta, **When** envío el cambio, **Then** error "contraseña actual incorrecta", no se cambia. _Test._
- **Given** antigua correcta + nueva válida, **When** envío, **Then** contraseña cambiada (login con la nueva funciona). _Manual/integración._
- **Given** nueva débil, **When** envío, **Then** 422 política. _Test._

### C.4 — reset
- **Given** clic en "No recuerdo", **When** se dispara, **Then** llega email de reset al usuario. _Manual._
