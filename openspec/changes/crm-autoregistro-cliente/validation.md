# Validación — crm-autoregistro-cliente

Historia: como **cliente de un negocio** quiero auto-registrarme desde el login del CRM
(nombre, correo, usuario, teléfono) y verificar mi email eligiendo yo mismo la contraseña,
para acceder con una cuenta real (no demo) que solo ve mis vistas de cliente.

## Criterios de aceptación (AC)
- **AC1:** existe "¿No tienes cuenta? Regístrate" en el login; el formulario pide nombre,
  correo, username y teléfono, sin contraseña.
- **AC2:** al registrarse, la cuenta queda `pending` con rol `CLIENT` y se emite el evento
  `email.verification_requested`; la respuesta es neutra (no revela si el email ya existía).
- **AC3:** una cuenta no verificada NO puede loguear (login → 403 `email_no_verificado`).
- **AC4:** el enlace de verificación deja al cliente fijar su propia contraseña; nunca se
  envía contraseña en claro. El token es de un solo uso y expira (7 días).
- **AC5:** el login es real (JWT + Prisma); `demo-auth` queda eliminado sin romper el gate.
- **AC6 (seguridad RBAC):** el rol `CLIENT` no puede leer ni borrar PII de staff
  (customers/dashboard/bookings/packages); los endpoints de staff quedan `staffOnly`
  (deny-by-default) y el cliente solo accede a `/me/*`.

## Por tarea (Given-When-Then + test)
- **A.1-A.4 migración** → Given migración aditiva aplicada, When `prisma migrate status`,
  Then columnas nuevas nullable, `MemberRole.CLIENT` y `verify_email` presentes, sin DROP de
  tablas externas. Test: schema + `migrate status`.
- **B.2 register-client** → Given POST `/auth/register-client` con business, When se procesa,
  Then usuario `pending`+`CLIENT`, token `verify_email`, emit, respuesta neutra. Test:
  `auth-client-register.e2e`.
- **B.4 login gating** → Given cuenta no verificada, When login, Then 403
  `email_no_verificado`. Test: e2e.
- **B.3 verify-email** → Given token válido, When POST `/auth/verify-email`, Then cuenta
  `active` + `emailVerifiedAt` + contraseña fijada; token reusado → falla. Test: e2e.
- **C n8n** → Given evento firmado, When llega al dispatcher, Then email de verificación
  enviado (ejecución `success`); firma manipulada → 401. Test: e2e real n8n.
- **D front** → Given `demo-auth` eliminado, When se navega login/registro/verify, Then
  gate real sin referencias a demo. Test: front `npm test`.
- **RBAC (sec-review)** → Given sesión CLIENT, When GET/DELETE de endpoints staff, Then 403
  (guard `staffOnly`); `/me/*` scoped. Test: regresión RBAC.

> Regla del repo: una tarea está DONE solo cuando su test está verde. Sin spec → no code.

## Estado (2026-06-17) — IMPLEMENTADO Y VERIFICADO
- `tsc` limpio (back+front); migración aplica; `prisma generate` ok (workaround EPERM). ✓
- Back: 6 tests nuevos (`auth-client-register.e2e`: pending, login pre-verify→403,
  verify→active+login, unicidad email/username, 400 sin business, respuesta neutra);
  43 existentes siguen verdes. ✓
- Front: `npm test` 67 verdes; `demo-auth` eliminado sin romper gate. ✓
- n8n e2e: email de verificación entregado (`success`); firma inválida → 401. ✓
- Seguridad (`sec-review.md`): hallazgo CRÍTICO F1/F2 (CLIENT leía/borraba toda la PII) →
  CERRADO con `staffOnly` deny-by-default + router `/me` scoped + test de regresión.
  Veredicto APTO-CON-FIXES. ✓
- PENDIENTE no bloqueante: cablear front CLIENT a `/me/*` (cubierto por [[crm-portal-cliente]])
  y completar matriz EMPLOYEE/ADMIN (F3).
