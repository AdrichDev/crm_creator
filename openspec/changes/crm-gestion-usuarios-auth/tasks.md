# Tasks — crm-gestion-usuarios-auth   (Nivel 4 — todas PENDING)

> Requiere aprobación humana (seguridad + migración) antes de Fase 2.

## Fase 1 — Diseño y aprobación
- [ ] 1.1 Aprobar política de contraseñas y caducidad de tokens con el humano.
- [ ] 1.2 Decidir transporte de email (n8n webhook + plantilla) → ver `crm-n8n-automations`.

## Fase 2 — Backend (Prisma + rutas)
- [x] 2.1 Migración aditiva: `AuthToken` (userId, tokenHash, purpose, expiresAt, usedAt) + `User.passwordChangedAt`. NO toca `crm_project`/`tenants_registry`. (Sustituye a `PasswordResetToken` del diseño según correcciones del devil: invite + reset comparten tabla con `purpose`.)
- [x] 2.2 `POST /users` (admin): crea User+Membership status 'invited', genera TOKEN de invitación (no password en claro), emite `user.invited`. RBAC admin. Email ya-miembro→409; existente en otro negocio→enlaza sin tocar credenciales.
- [x] 2.3 `GET /users` (admin): lista usuarios del negocio SIN passwordHash (select explícito).
- [x] 2.4 `PATCH /users/:id` (rol/estado, guardas last_admin/owner). `DELETE /users/:id` (no self/owner, borra User si era el último membership). `POST /users/:id/resend-invite`.
- [x] 2.5 `POST /auth/change-password` (auth): antigua+nueva, verifica, re-hashea, sella passwordChangedAt (invalida JWT previos).
- [x] 2.6 `POST /auth/forgot-password`: genera token reset, emite evento, respuesta SIEMPRE neutra. Rate limited.
- [x] 2.7 `POST /auth/reset-password` + `POST /auth/set-password`: valida token (un solo uso, expiración), fija nueva, invalida los demás tokens. Rate limited.
- [x] 2.8 `lib/password.ts` (política ≥8 + generación de tokens) + `lib/rateLimit.ts` + `lib/automation/` (emit HMAC, idempotencia, retry, fallo suave).

## Fase 3 — Frontend
- [x] 3.1 Configuración → tab "Usuarios" (solo admin), look panel.
- [x] 3.2 Modal "Nuevo usuario" (email, nombre, rol) + feedback de email enviado/reenviar + desactivar.
- [x] 3.3 Formulario "Cambiar contraseña" (antigua/nueva/repetir) en el tab Usuarios.
- [x] 3.4 Páginas públicas `/set-password`, `/forgot-password`, `/reset-password` (con token de la URL).
- [x] 3.5 Mapear `MemberRole` → rol front (`frontRole` en `lib/api/users.ts`). (Sustitución de `DEMO_USERS` por sesión real: deuda futura, no rompe `useRole`.)

## Fase 4 — Seguridad y tests
- [x] 4.1 Tests: hashing/no fuga de passwordHash, RBAC, token un-solo-uso/expiración, respuesta neutra forgot, rate limit, invalidación de sesión (27 tests back, todos verde).
- [ ] 4.2 Revisión `cybersec:blueteam-*` del flujo de credenciales. (Pendiente: revisión independiente.)

## Verificación
- [x] V.1 `npm test` verde (front 67 + back 27). `tsc` limpio (front+back). `next build` OK.
- [x] V.2 Prueba e2e: admin crea trabajador (invitación) → set-password → login → cambio pass (invalida sesión) → reset por token. Cubierto por la suite e2e.
