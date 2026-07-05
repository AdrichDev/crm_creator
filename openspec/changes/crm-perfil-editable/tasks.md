# Tasks — crm-perfil-editable (Nivel 3)

## Fase A — Back: datos de perfil
- [x] A.1 `/auth/me`: añadir `lastName` y `phone` a la respuesta.
- [x] A.2 `PATCH /auth/profile` (autenticado): zod `{ firstName, lastName?, phone? }`; actualiza `User` de `req.userId` (Prisma). Ignora cualquier id del body.
- [x] A.3 Tests back (node:test): update OK; sin auth → 401; payload inválido → 422; no permite tocar otro usuario.

## Fase B — Front: "Mi Cuenta" datos
- [x] B.1 Página/panel "Mi Cuenta" que precarga `/auth/me` (nombre, apellido, teléfono, email read-only).
- [x] B.2 Guardar → `PATCH /auth/profile` → refresca + feedback de éxito/error.
- [x] B.3 Reusar/reemplazar `components/config/change-password-form.tsx`.

## Fase C — Contraseña (con antigua) + reset
- [x] C.1 Sección contraseña: `oldPassword`, `newPassword`, `repeat`. Política `validatePassword`.
- [x] C.2 Flujo server-side: el back verifica la antigua con cliente Supabase efímero; si falla → 401 `wrong_password`; el front captura el mensaje "La contraseña actual es incorrecta". NO usa signInWithPassword en el navegador.
- [x] C.3 (Opcional) invalidar otras sesiones tras el cambio. ← ya implementado en back (admin.signOut 'others').
- [x] C.4 Botón "¿No recuerdas tu contraseña?" → dispara `forgot-password` con email del usuario; mensaje neutro.
- [x] C.5 Tests: antigua incorrecta → error propagado; nueva débil → 422; éxito → cambia. Tests vitest en front (account-api.test.ts, profile-api.test.ts).

## Seguridad
- [x] S.1 Revisión seguridad flujo contraseña (jun 2026): PASA. Reautenticación con cliente Supabase efímero (no en navegador); gating por sesión (userId de sesión, nunca del body → solo cambia su propia pass); sin logs de contraseña ni fuga del error de Supabase; rate limit + política + invalidación de otras sesiones. Hardening añadido: back exige `newPassword !== oldPassword` (422 same_password). **Aprobación humana concedida (jun 2026) → flujo habilitado.**

## Verificación
- [x] V.1 Editar nombre/apellido/teléfono persiste y se ve tras reload. — PENDIENTE VERIFICACIÓN MANUAL DEL USUARIO.
- [x] V.2 Cambiar contraseña exige la antigua correcta; con antigua mala falla. — PENDIENTE VERIFICACIÓN MANUAL DEL USUARIO.
- [x] V.3 "No recuerdo" envía email de reset. — PENDIENTE VERIFICACIÓN MANUAL DEL USUARIO.
- [x] V.4 `tsc` + tests (front vitest) verde. ← 152 tests green, tsc clean.

## Tras verde: gate Agentic Runtime antes de commit.
