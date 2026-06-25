# Tasks — crm-sidebar-usuario-real (Nivel 2)

## T0 — Exploración
- [ ] T0.1 Confirmar la fuente del usuario logado en el front CRM (`lib/api/me.ts`, ruta `/me`, o hook de auth). Campos disponibles: firstName, lastName, role, email.
- [ ] T0.2 Buscar todos los usos de `DEMO_USERS` (sidebar + ¿selector de rol?). Decidir borrar vs conservar.

## T1 — Usuario real en el pie
- [ ] T1.1 `sidebar.tsx`: reemplazar `const user = DEMO_USERS[role]` por el usuario real (cargado de la sesión). Nombre, rolLabel e iniciales del dato real. Fallback "Invitado"/sin sesión.
- [ ] T1.2 Si `DEMO_USERS` queda huérfano → eliminarlo de `roles.ts`. Si no, dejarlo solo donde se use.

## T2 — Sidebar fijo / main scroll
- [ ] T2.1 `app-shell.tsx`: `<aside>` fijo `sticky top-0 h-screen` (o `fixed` + offset del main); `<main>` `overflow-y-auto` a altura de viewport. Solo el main scrollea.
- [ ] T2.2 Verificar que el colapso del sidebar y el branding siguen OK con el nuevo layout.

## T3 — Tests
- [ ] T3.1 Test (front) del pie del sidebar con usuario mock → muestra nombre/iniciales reales, no demo.

## Verificación
- [ ] V.1 Logado como admin/trabajador/cliente → el pie muestra TU nombre y rol reales.
- [ ] V.2 Con contenido largo, el sidebar queda fijo y solo el main baja.
- [ ] V.3 Colapso del sidebar sigue funcionando. `tsc` + tests verde.

## Tras verde: gate Ruflo antes de commit.
