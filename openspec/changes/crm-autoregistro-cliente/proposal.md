# Proposal — Auto-registro de cliente + verificación de email

**Nivel Gru: 4 — Crítica.** Auth + seguridad + migración BD + dos dominios (front/back) + nuevo email.
**Estado: SPEC (aprobado el plan, pendiente implementación).**

## Contexto
El CRM generado autentica hoy con `demo-auth` (localStorage, sin BD). El admin ya da de alta
**admin/empleado** vía invitación (`user.invited` → set-password, ya cableado a n8n). **No existe**
auto-registro de clientes, ni verificación de email, ni persistencia de clientes en BD.

El admin **no** da de alta clientes: los clientes se **auto-registran** desde el CRM.

## Intención
1. Pantalla "¿No tienes cuenta? Regístrate" en el login del CRM generado.
2. Formulario de registro: **nombre, correo, user (username), teléfono** (sin contraseña).
3. Al registrarse → email de **verificación** (con branding + emoji, vía n8n ya operativo).
4. Al abrir el enlace → el cliente **elige su contraseña** → cuenta verificada y activa.
5. **Login real** contra el backend (JWT + Prisma). Reemplaza `demo-auth`.
6. Rol de vista **cliente** (solo filtrado de vistas, sin RBAC de escritura).

## Decisiones (acordadas con el usuario)
- **Contraseña**: el email lleva enlace de verificación; el cliente **fija su propia contraseña** al
  verificar. **Nunca** se envía contraseña en claro (coherente con el flujo invite existente).
- **Gating**: la cuenta queda `pending` y **no puede loguear** hasta verificar el email.
- **Auth front**: se **reemplaza** `demo-auth` por auth real contra BD.
- **Roles**: nivel empleo = `admin` + `empleado` (RBAC real); `cliente` = solo vistas.
  Mapeo front→back: `admin→ADMIN`, `trabajador→EMPLOYEE`, `cliente→CLIENT` (rol nuevo).
- **Login por email**; `username` es un handle único (no se usa para login por ahora).

## Alcance
- Migración Prisma aditiva (`User.username/phone/emailVerifiedAt`, `MemberRole.CLIENT`, `AuthTokenPurpose.verify_email`).
- Endpoints back: `POST /auth/register-client`, `POST /auth/verify-email`; `login` bloquea no verificados.
- Evento `email.verification_requested` + rama n8n + plantilla.
- Front: páginas `registro` y `verify-email`, login/app-shell reales, eliminación de `demo-auth`.

## Fuera de alcance
- Fases 2–5 de n8n (citas/factura/marketing/equipo).
- Login por username; aprobación manual de clientes por admin.
- Recuperación de contraseña del cliente (reusa `forgot-password` existente).

## Riesgos (ver devil-notes.md)
- Enumeración de cuentas en registro → respuesta neutra.
- Contraseña en claro (descartado).
- RBAC: que `cliente` no pueda escribir donde no debe.
