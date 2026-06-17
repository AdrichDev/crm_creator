# Tasks — crm-autoregistro-cliente   (Nivel 4)

> Requiere verificación e2e + revisión de seguridad. Decisiones en `proposal.md`/`design.md`.

## Fase A — BD (migración Prisma aditiva)
- [ ] A.1 `schema.prisma`: `User += username String? @unique, phone String?, emailVerifiedAt DateTime?`.
- [ ] A.2 `enum MemberRole += CLIENT`; `enum AuthTokenPurpose += verify_email`.
- [ ] A.3 `lib/password.ts`: `TOKEN_TTL_MS.verify_email = 7d`.
- [ ] A.4 Generar migración (recipe `migrate diff` sin DROP de tablas externas) + `prisma generate` (workaround EPERM Windows).

## Fase B — Back (endpoints + evento)
- [ ] B.1 `events.ts`: añadir `email.verification_requested` (payload con `verifyUrl`, `branding?`).
- [ ] B.2 `auth.ts`: `POST /auth/register-client` (rate-limit, x-business-id, crea pending+CLIENT, token verify_email, emit, respuesta neutra).
- [ ] B.3 `auth.ts`: generalizar `consumeTokenAndSetPassword` a `verify_email` (set pass + active + emailVerifiedAt) y `POST /auth/verify-email`.
- [ ] B.4 `auth.ts`: `login` bloquea `status != active` → 403 `email_no_verificado`.

## Fase C — n8n (email de verificación)
- [ ] C.1 `crm-automation-dispatcher.json`: rama `email.verification_requested` + nodo Email.
- [ ] C.2 `n8n/templates/email-verification.html` (emoji + branding + botón verificar).
- [ ] C.3 Desplegar (REST API) + activar.

## Fase D — Front (reemplaza demo-auth)
- [ ] D.1 `lib/api/account.ts`: `registerClient`, `verifyEmail`, `login` real (guarda token/business/rol).
- [ ] D.2 `app/login/page.tsx`: login real + enlace "Regístrate". Quita `demoLogin/DEMO_*`.
- [ ] D.3 `app/registro/page.tsx` (nuevo): form nombre/correo/user/teléfono.
- [ ] D.4 `app/verify-email/page.tsx` (nuevo): token URL → fijar contraseña (reusa UI set-password).
- [ ] D.5 `app-shell.tsx`: gate con token real; `tenant-config-context` fija rol desde membership.
- [ ] D.6 Eliminar `lib/auth/demo-auth.ts` + referencias.

## Verificación
- [ ] V.1 `tsc` limpio (back y front). Migración aplica, `prisma generate` ok.
- [ ] V.2 Test back (vitest): registro→pending, login pre-verify→403, verify→active, login ok, unicidad email/username, respuesta neutra.
- [ ] V.3 n8n e2e: email verificación entregado (ejecución `success`), firma inválida→401.
- [ ] V.4 Front: `npm test` + flujo manual registro→email→verify→login→panel vista cliente; demo-auth eliminado sin romper gate.
- [ ] V.5 Revisión seguridad: token un solo uso/expira, sin password en claro, RBAC cliente solo vistas, registro neutro.
