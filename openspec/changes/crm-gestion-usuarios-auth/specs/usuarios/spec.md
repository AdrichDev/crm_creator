# Spec — Usuarios y credenciales

## UC-1 — Admin crea usuario
**WHEN** un admin abre Configuración → Usuarios → "Nuevo usuario" e indica email, nombre y rol (Admin|Trabajador)
**THEN** se crea `User` + `Membership` (role `ADMIN`|`EMPLOYEE`) en el negocio activo, con contraseña generada y hasheada (bcrypt).

- AC-1.1 Email único por usuario; si ya existe → 409 sin filtrar datos.
- AC-1.2 Contraseña generada ≥ 12 chars, aleatoria segura; nunca se persiste en claro.
- AC-1.3 Tras crear, se dispara email con la contraseña en claro (n8n). Si el email falla, el usuario queda creado y el admin ve aviso "reenviar".
- AC-1.4 Solo `role=admin` puede crear/editar/eliminar usuarios (RBAC back + UI oculta para trabajador/cliente).
- AC-1.5 La API de listado NUNCA devuelve `passwordHash`.

## UC-2 — Cambio de contraseña (logueado)
**WHEN** un usuario (admin o trabajador) introduce contraseña antigua + nueva + repetición
**THEN** si la antigua verifica y la nueva cumple política y coincide con la repetición, se re-hashea y guarda.

- AC-2.1 Antigua incorrecta → 401, sin cambiar nada.
- AC-2.2 Nueva ≠ repetición → error de validación cliente y servidor.
- AC-2.3 Política mínima: ≥ 8 chars (configurable). Rechaza si == antigua.

## UC-3 — Recuperación por email
**WHEN** un usuario pide "olvidé mi contraseña" con su email
**THEN** se genera un `PasswordResetToken` (un solo uso, expira ~30 min) y se envía enlace por email (n8n).

- AC-3.1 Respuesta SIEMPRE neutra ("si el email existe, enviaremos instrucciones") — no revela si el email está registrado.
- AC-3.2 Token hasheado en BD; el enlace lleva el token en claro. Un solo uso; se invalida al usarse o expirar.
- AC-3.3 Al fijar nueva contraseña con token válido → re-hash y se invalidan otros tokens del usuario.

## UC-4 — Roles y visibilidad
- AC-4.1 `MemberRole.ADMIN`/`OWNER` → rol front `admin`; `EMPLOYEE`/otros → `trabajador`.
- AC-4.2 La gestión de usuarios solo es visible/operable por admin.
