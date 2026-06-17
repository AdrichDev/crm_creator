# Tasks — crm-gestion-usuarios-auth   (Nivel 4 — todas PENDING)

> Requiere aprobación humana (seguridad + migración) antes de Fase 2.

## Fase 1 — Diseño y aprobación
- [ ] 1.1 Aprobar política de contraseñas y caducidad de tokens con el humano.
- [ ] 1.2 Decidir transporte de email (n8n webhook + plantilla) → ver `crm-n8n-automations`.

## Fase 2 — Backend (Prisma + rutas)
- [ ] 2.1 Migración aditiva: `PasswordResetToken` (userId, tokenHash, expiresAt, usedAt). NO tocar `crm_project`/`tenants_registry`.
- [ ] 2.2 `POST /users` (admin): crea User+Membership, genera password, hashea, dispara email. RBAC admin.
- [ ] 2.3 `GET /users` (admin): lista usuarios del negocio SIN passwordHash.
- [ ] 2.4 `PATCH /users/:id` (admin): rol/estado. `DELETE /users/:id`.
- [ ] 2.5 `POST /auth/change-password` (auth): antigua+nueva, verifica y re-hashea.
- [ ] 2.6 `POST /auth/forgot-password`: genera token, email (respuesta neutra).
- [ ] 2.7 `POST /auth/reset-password`: valida token, fija nueva, invalida tokens.
- [ ] 2.8 Util `generatePassword()` seguro + política de validación compartida.

## Fase 3 — Frontend
- [ ] 3.1 Configuración → tab "Usuarios" (solo admin), look panel (`module-grid-panel` como referencia de estilo).
- [ ] 3.2 Modal "Nuevo usuario" (email, nombre, rol) + feedback de email enviado/reenviar.
- [ ] 3.3 Formulario "Cambiar contraseña" (antigua/nueva/repetir) en el menú de usuario.
- [ ] 3.4 Páginas "Olvidé mi contraseña" y "Restablecer" (con token de la URL).
- [ ] 3.5 Mapear `MemberRole` → rol front; sustituir progresivamente `DEMO_USERS` por sesión real.

## Fase 4 — Seguridad y tests
- [ ] 4.1 Tests: hashing, no fuga de passwordHash, RBAC, token un-solo-uso/expiración, respuesta neutra forgot.
- [ ] 4.2 Revisión `cybersec:blueteam-*` del flujo de credenciales.

## Verificación
- [ ] V.1 `npm test` verde (front+back). `tsc` limpio. `next build` OK.
- [ ] V.2 Prueba e2e: admin crea trabajador → email simulado → login → cambio pass → reset por email.
