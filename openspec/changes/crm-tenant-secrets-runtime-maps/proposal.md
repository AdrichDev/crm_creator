# crm-tenant-secrets-runtime-maps

## Intención
Que guardar un secreto `FRONTEND_PUBLIC` en BD (p. ej. la clave de Google Maps) sea
**inmediatamente efectivo** en el panel CRM (`operaos-black.vercel.app`) sin necesidad de
recompilar/redesplegar el front en Vercel. Hoy `front/lib/maps/loader.ts` lee
`process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` — una variable `NEXT_PUBLIC_*` que Next.js hornea
en **build time**, no en runtime. Este change mueve esa lectura a un fetch runtime contra
`GET /tenant-config` (endpoint ya existente, `back/src/routes/tenant-config.ts`).

## Problema
Verificado en código:
- `front/lib/maps/loader.ts:9-11` (`googleMapsApiKey`) lee `process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
  de forma síncrona; `loadGoogleMaps` (líneas 13-24) lanza si no está presente.
- `front/components/comercial/mapa-clientes.tsx:41-44` llama `googleMapsApiKey()` de forma
  síncrona al montar y muestra el aviso `"Mapa no disponible: falta
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY."` si no hay valor.
- Síntoma real en producción: ese aviso aparece en `operaos-black.vercel.app` aunque el negocio
  YA tiene el secreto guardado en `TenantSecret` (BD) — porque Vercel hornea `NEXT_PUBLIC_*` en
  el momento del build del front, no en cada request, y el secreto se guardó después de ese build.
- `GET /tenant-config` (`back/src/routes/tenant-config.ts`) ya existe y ya sirve exactamente los
  secretos `scope=FRONTEND_PUBLIC` de un negocio vía `readPublicSecrets`
  (`back/src/lib/tenant-secrets/store.ts:70-83`) — pero con dos brechas que este change cierra
  (ver Decisiones):
  1. **Auth incompatible con el panel.** `GET /tenant-config` está montado ANTES del
     `authenticate` global (`back/src/routes/index.ts:57-59`) y solo resuelve `businessId` vía
     `resolveTenantApiKey` (`back/src/middleware/tenant-api-key.ts`) — un `Bearer` que debe ser un
     `TenantApiKey` real. Ese mecanismo está pensado para **apps exportadas** (ZIP/APK/EXE/IPA con
     `TENANT_API_KEY` horneado, ver `crm-export-runtime-config`). El panel CRM logueado
     (`operaos-black.vercel.app`) NO tiene un `TenantApiKey`: se autentica con sesión Supabase
     (`front/lib/api/client.ts:apiFetch`, Bearer = `getAccessToken()` + header `x-business-id` =
     `getActiveBusinessId()`), resuelta en el back por `authenticate`
     (`back/src/middleware/auth.ts`) contra `Membership`. Hoy, si el panel llamara a
     `GET /tenant-config` con su sesión normal, recibiría 401 `invalid_api_key` — el endpoint
     simplemente no resuelve `businessId` desde ningún sitio compatible con el panel.
  2. **Clave de indexación ambigua.** `readPublicSecrets` devuelve `Record<name, value>` indexado
     por `TenantSecret.name` (una etiqueta libre elegida por quien guarda el secreto, ver
     fixtures `mapaPublicKey`/`mapaKey` en los tests existentes) — NO por `envVarName`. El front no
     tiene forma fiable de saber qué clave de `publicSecrets` corresponde a
     `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` salvo por convención frágil de `name`. El propio backend ya
     resuelve esta ambigüedad para el caso build-time: `readBakeableSecrets`
     (`back/src/lib/tenant-secrets/store.ts:155-171`) devuelve pares `{ envVarName, value }` para
     los secretos `FRONTEND_PUBLIC` que además tienen `envVarName` asignado — es el mismo mecanismo
     que ya usan los 4 builders del exportador para hornear `.env.local`
     (`back/src/lib/export-builders/public-env-secrets.ts`). `GET /tenant-config` hoy NO expone
     esa vista indexada por `envVarName`, solo la indexada por `name`.
- El guardado de secretos YA funciona hoy en el lado operador: `POST /businesses/:id/secrets`
  (`back/src/routes/service-operator-tenant-keys.ts`) acepta `name`/`scope`/`value`/`envVarName` y
  valida `envVarName` contra `^NEXT_PUBLIC_[A-Z0-9_]+$`. No hay UI de operador ni de autoservicio
  de tenant sobre ese endpoint todavía — eso son los 2 changes hermanos (ver Dependencias).

## Decisiones
- **Auth dual en `GET /tenant-config`, reutilizando lo existente (sin sistema nuevo).** El
  handler pasa a aceptar DOS orígenes de request, sin inventar un tercer mecanismo de resolución
  de tenant:
  1. `Authorization: Bearer <TENANT_API_KEY>` → `resolveTenantApiKey` (comportamiento actual,
     apps exportadas).
  2. Si el Bearer no resuelve como `TenantApiKey` válida → fallback a sesión Supabase +
     `x-business-id`, exactamente el mismo mecanismo que ya usa `authenticate`
     (`back/src/middleware/auth.ts`) para el resto del panel. Mismo patrón "auth mixta dentro del
     propio router" ya usado por `/calendar` e `/integrations` (comentarios en
     `back/src/routes/index.ts:49-56`).
  El front del panel llama a `GET /tenant-config` con el MISMO cliente que ya usa para todo lo
  demás (`apiFetch('/tenant-config')`), sin lógica de auth nueva en el front.
- **Indexar también por `envVarName`.** El handler de `/tenant-config` gana un segundo campo,
  `publicEnvSecrets`, construido con `readBakeableSecrets` (ya existente, mismo filtro
  `scope=FRONTEND_PUBLIC AND envVarName IS NOT NULL`), indexado `Record<envVarName, value>`. El
  campo `publicSecrets` (indexado por `name`) se mantiene sin cambios para no romper contrato
  existente. `front/lib/maps/loader.ts` lee `publicEnvSecrets.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.
- **`front/lib/maps/loader.ts` pasa a async.** `loadGoogleMaps()` resuelve la clave con un fetch a
  `/tenant-config` (vía `apiFetch`, mismo cliente REST del resto del front) antes de llamar
  `setOptions`. Se cachea en memoria de módulo por carga de página (mismo alcance que hoy tiene el
  flag `configured`) — no se re-consulta en cada render.
- **Mensaje de error preservado.** Cualquier fallo en resolver la clave (secreto ausente en BD,
  fetch de red, 401/500 del back) desemboca en el MISMO texto que hoy:
  `"Mapa no disponible: falta NEXT_PUBLIC_GOOGLE_MAPS_API_KEY."`. Desde la perspectiva del
  usuario del panel, todas esas causas significan lo mismo: no hay mapa disponible ahora mismo.
- **Estado de carga nuevo.** `MapaClientes` (`front/components/comercial/mapa-clientes.tsx`) hoy
  decide síncronamente entre "sin key → error" y "con key → cargar". Al pasar a async, gana un
  estado intermedio (`loading`) mientras se resuelve el fetch, antes de decidir entre `error` y
  `ready`.

## Riesgos
- **Límite de un cambio de tenant activo dentro de la misma carga de página.** El SDK de Google
  Maps JS (`@googlemaps/js-api-loader`) no soporta reconfigurar la clave (`setOptions`) una vez
  cargado — el flag `configured` de `loader.ts` ya impone hoy ese límite. Cambiar de negocio activo
  (`x-business-id`) sin recargar la página seguirá sin recoger una clave distinta hasta un reload.
  No es una regresión (el build-time baked de hoy es fijo para TODO el deploy; esto al menos es
  por negocio activo en cada carga de página) — se documenta como límite aceptado, no se resuelve
  en este change.
- **Latencia añadida al primer render del mapa.** Un fetch de red se interpone antes de poder
  cargar el SDK de Maps. Mitigación: el fetch a `/tenant-config` es liviano (JSON pequeño) y ya lo
  paga el resto del panel en cada carga (`/auth/me`, `/settings`, etc.); se documenta, no se
  optimiza con cache-busting adicional en este change.
- **Superficie de auth del router `/tenant-config` crece.** Añadir un segundo camino de auth
  (sesión) a un router pensado originalmente para apps externas con `TenantApiKey` aumenta la
  superficie a revisar. Mitigación: reutiliza `authenticate` TAL CUAL (sin duplicar lógica de
  verificación de token ni de resolución de `Membership`), y el filtro de scope
  (`FRONTEND_PUBLIC` únicamente) sigue siendo el mismo cortafuegos ya probado — ningún
  `BACKEND_SECRET` se vuelve alcanzable por ninguno de los dos caminos de auth.

## Dependencias / changes hermanos
Este es el change **fundacional** de un conjunto de 3: sin que el guardado de un secreto sea
visible en runtime (este change), los otros dos no tienen forma de verificarse en vivo:
- **Panel operador de secretos por tenant** (futuro, no creado aquí): UI sobre
  `POST/GET /businesses/:id/secrets` (`service-operator-tenant-keys.ts`, ya existe a nivel de API)
  para que el operador de plataforma gestione secretos `FRONTEND_PUBLIC`/`BACKEND_SECRET` por
  negocio sin curl/Postman.
- **Panel self-service de tenant** (futuro, no creado aquí): superficie equivalente pero
  autogestionada por el propio tenant (staff `ADMIN`/`MANAGER`), acotada a los secretos que se
  decida exponer a autoservicio.

Ninguno de los dos se crea ni se detalla en este proposal — solo se referencian porque ambos
DEPENDEN de que este change exista para que guardar un secreto tenga efecto visible sin redeploy.
