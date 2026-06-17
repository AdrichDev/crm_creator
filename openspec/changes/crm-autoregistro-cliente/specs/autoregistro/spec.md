# Spec — Auto-registro de cliente y verificación de email

## UC-1 — Auto-registro de cliente
**WHEN** un visitante del CRM abre "¿No tienes cuenta? Regístrate" e indica **nombre, correo, user y teléfono**
**THEN** se crea `User(status='pending')` + `Membership(role='CLIENT')` en el negocio del header `x-business-id`,
**sin** contraseña, se genera un token `verify_email` y se emite `email.verification_requested` (email con enlace).

- AC-1.1 Respuesta **siempre neutra** (200, "si el email es válido te enviaremos un enlace"); no revela si el email/usuario ya existe.
- AC-1.2 `email` único y normalizado (trim+lowercase). `username` único, 3–30 chars `[a-z0-9_]`.
- AC-1.3 **Nunca** se persiste ni se envía contraseña en claro; el usuario nace sin password utilizable.
- AC-1.4 Falta `x-business-id` → 400. El cliente queda ligado a ese negocio (multi-tenant).
- AC-1.5 Rate-limit por IP en el endpoint (anti-spam de registro/email).
- AC-1.6 El email de verificación va con branding del tenant + emoji (vía n8n), enlace `/verify-email?token=...`.

## UC-2 — Verificación de email + fijar contraseña
**WHEN** el cliente abre el enlace del email e introduce contraseña + repetición
**THEN** se consume el token `verify_email`, se fija `passwordHash`, `status='active'`, `emailVerifiedAt=now`.

- AC-2.1 Token de un solo uso, hasheado en BD (SHA-256), expira a los **7 días**; al usarse se invalidan los demás tokens del usuario.
- AC-2.2 Política de contraseña: ≥ 12 caracteres con al menos una letra y un dígito (`validatePassword`); nueva ≠ repetición → 422.
- AC-2.3 Token inválido/caducado → 400 `invalid_token`, sin cambios.
- AC-2.4 Tras verificar, el cliente puede loguear normalmente.

## UC-3 — Login bloqueado sin verificar
**WHEN** un cliente con cuenta `pending` (email no verificado) intenta loguear
**THEN** el login responde 403 `email_no_verificado` y no emite sesión.

- AC-3.1 Se mantiene el `bcrypt.compare` previo (hash dummy si no existe usuario) para no abrir oráculo de tiempo de enumeración.
- AC-3.2 Credenciales incorrectas → 401 `bad_credentials` (igual que hoy), independientemente del estado.

## UC-4 — Roles y visibilidad
**WHEN** un usuario entra al panel del CRM generado
**THEN** su vista se filtra por su rol de membership.

- AC-4.1 `MemberRole.ADMIN`/`OWNER` → rol front `admin`; `EMPLOYEE`/`MANAGER`/`RECEPTIONIST`/`PROFESSIONAL` → `trabajador`; `CLIENT` → `cliente`.
- AC-4.2 `cliente` **solo filtra vistas** (no puede crear/editar/eliminar lo que es de empleo/admin); el RBAC del back no le concede escritura de administración.
- AC-4.3 El selector "Ver como" de la consola fuente no se ve afectado (sigue siendo simulación local en el builder).

## UC-5 — Auth real (reemplazo de demo)
**WHEN** se usa el login/registro del CRM generado
**THEN** las operaciones pegan al backend real (JWT + Prisma); `demo-auth` (localStorage) queda eliminado.

- AC-5.1 Login OK → guarda `saas.token`, `saas.business.id` y rol; el gate de `app-shell` usa el token real.
- AC-5.2 Sin token → redirige a `/login`; con token → entra al panel.
- AC-5.3 No quedan referencias a `demo-auth` ni credenciales demo en el build generado.
