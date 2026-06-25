# Design — crm-cliente-solo-mi-cuenta

**Nivel Gru: 2** (sube a 3 si el back no tiene authz server-side de config).

## 0. Estado real (`lib/config/roles.ts`)
- `ROLE_MODULES.cliente = ['citas', 'servicios', 'productos', 'configuracion']`.
- `WRITE_EXCEPTIONS.cliente = ['configuracion']` (el cliente podía escribir config).
- `PANEL_TITLE.cliente = 'Mi Cuenta'` (el título ya existe).
- El panel `/configuracion` agrupa branding, módulos, usuarios (admin) + perfil.

## 1. Gating de módulos
- `ROLE_MODULES.cliente` → `['citas', 'servicios', 'productos', 'mi-cuenta']` (o equivalente que apunte a la página de perfil de `crm-perfil-editable`). Quitar `'configuracion'`.
- Quitar `WRITE_EXCEPTIONS.cliente` (sin config, no aplica).
- Definir el destino "Mi Cuenta" como módulo/ruta propia (ej. `/cuenta`) accesible a todos los roles, separada del panel admin `/configuracion`.

## 2. Guard de ruta (front)
- Middleware/guard: si `role === 'cliente'` y la ruta es `/configuracion` (o subrutas admin) → `redirect` a `/cuenta` (o home del cliente).
- Centralizar con el `moduleFromPath` + `moduleAllowedForRole` ya existentes: si el módulo de la ruta no está permitido para el rol → redirect.

## 3. Authz server-side — AUDITADO 2026-06-26: YA CUBIERTO ✅
- `back/src/routes/index.ts:38` monta `api.use(staffOnly)` como gate global: `projects` (=config del tenant), `users`, `dashboard`, etc. van DETRÁS → token CLIENT recibe **403**. `users.ts:13` además `requireRole('OWNER','ADMIN')`. Cierra el hallazgo F1/F2 del sec-review previo.
- El back valida por el rol REAL del membership del token, no por el selector simulado del front.
- **Conclusión**: NO hay escalada de privilegios. Este change es SOLO cosmético en front (ocultar Configuración + guard de ruta). **Nivel real: 1-2.** No requiere trabajo de authz back nuevo; solo un test de regresión que confirme el 403.

## 4. Seguridad
- BOLA/escalada: un cliente no debe leer/escribir config de su tenant. Probar con un token de cliente contra los endpoints admin → deben dar 403.

## 5. Plan
- A: `roles.ts` (quitar config de cliente, añadir mi-cuenta).
- B: guard de ruta `/configuracion` para cliente.
- C: verificar/añadir authz server-side en endpoints de config.
- D: tests (roles + guard + authz).
