# crm-tenant-keys-freeform

## Intención
Sustituir el catálogo cerrado de 5 slots fijos (`back/src/lib/tenant-secrets/catalog.ts`) por un
modelo de key/value libre estilo Vercel/Render en el panel "BD, API y Keys": el operador/tenant añade
una fila con `key` (nombre de variable) + `value`, botón "Agregar", una a la vez. El scope
(`FRONTEND_PUBLIC` vs `BACKEND_SECRET`) se infiere automáticamente por el prefijo `NEXT_PUBLIC_`
(convención real de Next.js) — sin selector manual.

## Problema
Verificado en código: hoy solo se pueden guardar 5 nombres fijos (`OPENAI_API_KEY`, `GEMINI_API_KEY`,
`ANTHROPIC_API_KEY`, `GOOGLE_MAPS_API_KEY`, `DATABASE_URL`). El backend (`back/src/routes/tenant-keys.ts`
`upsertSecretHandler`) resuelve `scope`/`envVarName` EXCLUSIVAMENTE vía `findSecretSlot(req.params.name)`
del catálogo — cualquier nombre fuera de esos 5 devuelve 404 `unknown_secret`. Un tenant que necesita
guardar `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` (o cualquier otra credencial de
terceros) no tiene dónde hacerlo — confirmado en vivo con "Comercial Demo IA" (export falla con
"Supabase no configurado" porque no existe fila `TenantSecret` para esas claves y no hay UI para crearla).

## Alcance
- **Backend (`back/src/routes/tenant-keys.ts`):**
  - `upsertSecretHandler` deja de exigir `findSecretSlot` para nombres fuera del catálogo. Nombre
    validado con `/^[A-Z][A-Z0-9_]*$/` (mismo patrón que ya usa `public-env-secrets.ts` para
    `NEXT_PUBLIC_*`, generalizado a cualquier prefijo).
  - `scope` inferido: `name.startsWith('NEXT_PUBLIC_') → FRONTEND_PUBLIC`, si no `BACKEND_SECRET`.
    `envVarName = name` cuando es `FRONTEND_PUBLIC` (se hornea tal cual en el export); `null` si es
    `BACKEND_SECRET`.
  - Rechazo explícito si `name` colisiona con `BASE_ENV_VAR_NAMES` (`NEXT_PUBLIC_TENANT_JSON`,
    `NEXT_PUBLIC_API_URL`) — mismo guardarraíl que ya existe en `public-env-secrets.ts`.
  - `TENANT_SECRET_CATALOG` (5 slots) se conserva como lista de **sugerencias/presets** (label bonito,
    `provider` para `testProviderConnection`) — no como gate. `GET .../secrets` sigue devolviendo los 5
    presets + ahora también cualquier `TenantSecret` adicional que el tenant haya dado de alta libre.
  - `DELETE .../secrets/:name` y `POST .../secrets/:name/test` dejan de exigir `findSecretSlot`
    también (operan sobre cualquier `name` existente en BD para ese `businessId`); `test` solo aplica
    si el nombre coincide con un `provider` conocido del catálogo, si no, 400 "no probable".
- **Frontend (`front/components/config/tenant-keys-panel.tsx`):**
  - Las 5 tarjetas de preset se mantienen tal cual (mismo UX, mismos botones Guardar/Probar/Quitar).
  - Se añade sección nueva "Otras variables" con lista dinámica de filas `key` (input texto,
    validado en cliente con el mismo regex) + `value` (password-masked) + botón "Agregar" que apila una
    fila vacía nueva. Cada fila añadida ya usa `upsertSecret(businessId, key, value)` sobre el mismo
    endpoint generalizado.
- **Fuera de alcance:** cambio de modelo Prisma (ya es genérico, sin migración); UI de onboarding
  (usa el mismo `TenantKeysPanel`, hereda el cambio gratis); `testProviderConnection` (sigue solo
  cubriendo los 3 proveedores IA conocidos).

## Decisiones
- **Scope por prefijo, no por selector manual** (confirmado con el usuario): replica exactamente cómo
  Next.js ya decide en build qué env var es pública. Menos fricción, mismo mental model que Vercel.
  Trade-off aceptado: si el operador teclea mal el prefijo, el secreto cae en el scope equivocado —
  mitigado con validación de formato + preview del scope resultante en el front antes de guardar
  ("Esta variable será: Pública (va al bundle)" / "Secreta (solo backend)").
- **Catálogo fijo pasa de gate a preset.** No se borra: sigue siendo la única fuente de `provider` para
  `testProviderConnection` y da UX curada a los 5 casos más comunes; deja de ser la única vía posible.

## Riesgos
- **Ampliar la superficie de escritura de secretos de "5 nombres conocidos" a "cualquier nombre".**
  Mitigado por: regex de formato, colisión con `BASE_ENV_VAR_NAMES` bloqueada, cifrado AES-256-GCM
  igual que hoy, gate de membership `ADMIN`/`MANAGER` sin cambios, value nunca vuelve al front.
- **Un tenant podría crear una key `NEXT_PUBLIC_*` que choque en runtime con una variable que el propio
  export ya usa internamente** (además de las 2 ya bloqueadas) — a vigilar si `manifest-allowlist.ts`
  añade una tercera var base en el futuro; requiere mantener `BASE_ENV_VAR_NAMES` sincronizada.

## Dependencias
- `back/src/lib/tenant-secrets/catalog.ts`, `back/src/routes/tenant-keys.ts` (modificados, no
  reescritos).
- `back/src/lib/export-builders/public-env-secrets.ts` (sin cambios — ya consume cualquier
  `FRONTEND_PUBLIC` + `envVarName` no nulo, generalizarlo en el origen basta).
- `front/components/config/tenant-keys-panel.tsx`, `front/lib/api/tenant-keys.ts` (modificados).
- Hereda gate/membership de `crm-onboarding-tenant-keys` / `crm-tenant-keys-self-service` — no se toca.
