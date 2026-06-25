# Proposal — Cliente solo ve "Mi Cuenta" (crm-cliente-solo-mi-cuenta)

**Nivel Gru: 2 — Medium.** Authorization (rol). Front (gating) + verificación de que el back no expone config a cliente.

## Contexto
`lib/config/roles.ts` da al rol `cliente` el módulo `'configuracion'` (línea 36) con `WRITE_EXCEPTIONS.cliente = ['configuracion']`. Por eso el cliente entra al panel de Configuración (branding, módulos, usuarios) — que es de admin. El usuario quiere que el cliente **solo vea su cuenta (perfil) + su vista normal** (sus citas, catálogo), nunca la configuración admin.

## Intención
- El rol `cliente` **no ve ni accede** al panel de Configuración admin (branding/módulos/usuarios).
- El cliente conserva: sus citas (`/me/bookings`), catálogo (servicios/productos, solo lectura) y **"Mi Cuenta"** (editar su perfil — de `crm-perfil-editable`).

## Alcance
- `lib/config/roles.ts`: quitar `'configuracion'` de `ROLE_MODULES.cliente`; quitar `WRITE_EXCEPTIONS.cliente`. Añadir acceso al módulo/ruta "Mi Cuenta" para todos (o al menos cliente).
- Guard de ruta: si un `cliente` navega a `/configuracion` (o subrutas admin) → redirigir a su "Mi Cuenta" o a su home. Defensa en front; verificar que el back tampoco deja a un cliente escribir config.
- Sidebar: para cliente, el pie/título ya muestra "Mi Cuenta" (PANEL_TITLE.cliente = 'Mi Cuenta'); asegurar que el ítem de navegación lleva al perfil, no al panel admin.

## Fuera de alcance
- La página "Mi Cuenta" en sí (la aporta `crm-perfil-editable`).

## Dependencias
- **Depende de `crm-perfil-editable`** (la página de perfil que el cliente verá).

## Riesgos
- Gating solo en front = no es seguridad real. Verificar que los endpoints de config (branding/módulos/usuarios) rechazan a un cliente en el back (authz server-side). Si no, añadirlo (puede escalar a Nivel 3).
