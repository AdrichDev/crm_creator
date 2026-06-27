# Proposal — Sidebar con usuario real + layout fijo (crm-sidebar-usuario-real)

**Nivel Gru: 2 — Medium.** Front, 1-2 dominios (UI + sesión). Reversible.

## Contexto
Dos problemas en el sidebar del CRM (`front/components/layout/sidebar.tsx` + `front/components/layout/app-shell.tsx`):
1. El pie del sidebar muestra `DEMO_USERS[role]` (datos demo hardcodeados en `lib/config/roles.ts`), NO el usuario logado real. agents-agency muestra el usuario real (`useAuthUser()`).
2. El sidebar **scrollea con la página**. Debe ser **fijo** y que solo el `main` baje, como en agents-agency (sidebar `min-h-screen` fijo, contenido con su propio scroll).

## Intención
- Pie del sidebar = **usuario logado real** (nombre, iniciales, rol) desde la sesión, no demo.
- Sidebar **fijo** a la altura de viewport; solo el `main` scrollea.

## Alcance
- `front/components/layout/sidebar.tsx`: sustituir `DEMO_USERS[role]` por el usuario real (firstName/lastName/role) desde la fuente de sesión existente (`/me` vía `lib/api/me.ts` o el hook de auth del CRM). Iniciales calculadas del nombre real. Fallback "Invitado" sin sesión.
- `front/components/layout/app-shell.tsx`: layout flex donde el `<aside>` es `sticky top-0 h-screen` (o equivalente) y el `<main>` tiene `overflow-y-auto` a altura de viewport. Solo el main scrollea.
- Limpiar `DEMO_USERS` de `lib/config/roles.ts` si queda sin uso (o marcar deprecado si lo usa algo más — verificar).

## Fuera de alcance
- Editar los datos del usuario (eso es `crm-perfil-editable`).
- Rediseño visual del sidebar más allá de fijar layout + dato real.

## Riesgos
- `DEMO_USERS` puede usarse en más sitios (ej. selector "iniciar sesión como"). Verificar antes de borrar; si se usa, dejarlo solo donde aplique.
- Diferencias de CSS (`opera-sidebar`) → revisar que el sticky no rompa el branding/colapso existente.
