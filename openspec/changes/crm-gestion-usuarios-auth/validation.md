# Validación — crm-gestion-usuarios-auth

Historia: como **admin de un negocio** quiero crear usuarios (admin/trabajador) con
credenciales seguras enviadas por email, y como **usuario** quiero cambiar mi contraseña y
recuperarla si la olvido, sin que nadie vea ni el hash ni el token por API.

## Criterios de aceptación (AC)
- **AC1:** el admin crea usuarios (email+nombre+rol); se crea User+Membership `invited` y se
  emite `user.invited` (token de invitación, NO contraseña en claro). RBAC solo admin.
- **AC2:** `GET /users` lista los usuarios del negocio SIN `passwordHash` (select explícito).
- **AC3:** `PATCH/DELETE /users/:id` respetan guardas `last_admin`/self; `resend-invite` existe.
- **AC4:** cambio de contraseña (`/auth/change-password`) verifica la antigua, valida fuerza,
  re-hashea y sella `passwordChangedAt` (invalida JWT previos).
- **AC5:** `/auth/forgot-password` responde SIEMPRE neutro y está rate-limited; el reset usa
  token de un solo uso con expiración (30 min).
- **AC6:** política de contraseña ≥12 chars con variedad (≥1 letra y ≥1 dígito), espejada en front.
- **AC7:** nunca se expone `passwordHash` ni el token por endpoint de lectura.

## Por tarea (Given-When-Then + test)
- **2.1 migración** → Given migración aditiva `AuthToken`+`User.passwordChangedAt`, When
  aplica, Then no toca `crm_project`/`tenants_registry`. Test: schema.
- **2.2 crear usuario** → Given admin, When POST `/users`, Then User+Membership `invited`+emit;
  email ya-miembro → 409; existente en otro negocio → enlaza sin tocar credenciales. Test: e2e.
- **2.3 listar** → Given admin, When GET `/users`, Then sin `passwordHash`. Test: e2e.
- **2.5 change-password** → Given antigua correcta+nueva válida, When POST, Then re-hash +
  `passwordChangedAt` (sesiones previas invalidadas). Test: e2e.
- **2.6 forgot** → Given cualquier email, When POST `/auth/forgot-password`, Then respuesta
  neutra + rate limit. Test: e2e.
- **2.7 reset/set** → Given token válido, When POST, Then nueva contraseña + resto de tokens
  invalidados; token reusado/expirado → falla. Test: e2e.
- **4.1 no-fuga** → Given cualquier lectura, When se serializa, Then sin `passwordHash`. Test.

> Regla del repo: una tarea está DONE solo cuando su test está verde. Sin spec → no code.

## Estado (2026-06-17) — IMPLEMENTADO Y VERIFICADO
- `npm test` verde: front 67 + back 27; `tsc` limpio (front+back); `next build` OK. ✓
- Política endurecida: ≥12 + variedad en `lib/password.ts` (`too_short|needs_variety`),
  espejo front, TTL invite 7d / reset 30 min. ✓
- Revisión `cybersec:blueteam-coordinator` (2026-06-17): VEREDICTO APROBADO-CON-NOTAS,
  0 crítico/alto. 2 MEDIA corregidas + detección (normalización email trim+lowercase → e2e
  casing; oráculo de timing en login → `DUMMY_PASSWORD_HASH` → test H5; back 43/43). ✓
- 2 BAJA diferidas (no bloquean): rate-limit en memoria → Redis al escalar multi-réplica;
  `trust proxy` documentar nº de proxies. Migración email→citext = gate humano si se decide
  unicidad case-insensitive a nivel BD.
- e2e (V.2): admin crea trabajador (invitación) → set-password → login → cambio pass (invalida
  sesión) → reset por token. Cubierto por la suite e2e. ✓
