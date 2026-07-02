# Tasks — crm-sidebar-usuario-real (Nivel 2)

## T0 — Exploración
- [x] T0.1 Fuente del usuario logado confirmada: `getAuthProfile()` (`lib/api/profile.ts` → `GET /auth/me`). Campos: firstName, lastName, phone, email. Rol vía `useRole()`.
- [x] T0.2 Usos de `DEMO_USERS`: sidebar (reemplazado), `panel/page.tsx`, `worker-chips.tsx`. Se CONSERVA (sigue usado en panel demo).

## T1 — Usuario real en el pie
- [x] T1.1 `sidebar.tsx`: `DEMO_USERS[role]` reemplazado por usuario real de sesión cuando `isApiEnabled()` (`getAuthProfile`). Nombre, iniciales (`initialsOf`) y rolLabel del dato real. **rolLabel = rol REAL de membresía** (`/auth/me` → `role`, mapeado con `roleFromMemberRole` → `ROLE_LABEL`), NO el selector "Ver como". `getAuthProfile` ahora expone `role`. Fallback "Invitado". En consola fuente demo (sin API) se mantiene el demo del rol.
- [x] T1.2 `DEMO_USERS` NO huérfano (panel + worker-chips) → se mantiene en `roles.ts`.

## T2 — Sidebar fijo / main scroll
- [x] T2.1 YA implementado en `globals.css`: `.opera-shell{height:100vh;overflow:hidden}`, `.opera-main{overflow-y:auto}`, `.opera-sidebar{flex-shrink:0}`. Solo el main scrollea.
- [x] T2.2 Colapso/branding intactos (sin cambios de layout).

## T3 — Tests
- [x] T3.1 `tests/sidebar-user.test.tsx`: render del pie con perfil mock → muestra nombre real ("Carlos Ruiz Pérez") e iniciales ("CR"), no el demo. Verde.

## Verificación
- [x] V.3 `tsc` limpio + 176 tests verde (suite completa front).
- [ ] V.1 Logado como admin/trabajador/cliente → el pie muestra TU nombre real. (manual con DB real) — PENDIENTE VERIFICACIÓN MANUAL DEL USUARIO.
- [ ] V.2 Con contenido largo, el sidebar queda fijo y solo el main baja. (manual visual — CSS ya presente) — PENDIENTE VERIFICACIÓN MANUAL DEL USUARIO.

## Tras verde: gate Ruflo antes de commit.
