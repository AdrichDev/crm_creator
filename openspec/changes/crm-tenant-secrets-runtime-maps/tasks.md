# Tareas — crm-tenant-secrets-runtime-maps

Alcance: cerrar la brecha build-time/runtime del secreto de Google Maps en el panel CRM
(`operaos-black.vercel.app`). Nivel 1-2. Sin migración (ninguna tabla nueva, `TenantSecret` ya
existe). Orden = por dependencia (auth dual en back → shape de respuesta en back → consumo async
en front → adaptación del componente → verificación). Sin WU bloqueadas: este change es
fundacional y no depende de otros changes para completarse end-to-end.

## WU1 — Auth dual en `GET /tenant-config` (back)
- [x] 1.1 `back/src/routes/tenant-config.ts` (o `tenant-api-key.ts`, según encaje en
  implementación): nueva función `resolveTenantConfigAuth` que intenta `TenantApiKey` (Bearer
  `tk_*`, comportamiento actual sin cambios) y, si no resuelve, cae a `authenticate` (sesión
  Supabase + `x-business-id` + `Membership`) fijando `req.tenantBusinessId = req.businessId`.
- [x] 1.2 Montar `resolveTenantConfigAuth` en `tenantConfigRouter.get('/')` en vez de
  `resolveTenantApiKey()` directo. `resolveTenantApiKey()` en `tenant-api-key.ts` queda intacto
  (se sigue usando donde ya se usaba, o se reexporta si conviene).
- [x] 1.3 Test `tenant-config.route.test.ts`: request sin `TenantApiKey` pero con sesión Supabase
  válida + `x-business-id` de un negocio con `Membership` → 200, `businessId` resuelto vía
  `authenticate` (fixture de `Membership`, no BD real).
- [x] 1.4 Test: request con `TenantApiKey` válida sigue funcionando exactamente igual que antes
  (regresión del comportamiento actual, sin fallback).
- [x] 1.5 Test: request sin `TenantApiKey` Y sin sesión Supabase válida → 401 (mismo código de
  error que produce `authenticate` hoy, no un código nuevo inventado).

## WU2 — Respuesta indexada por `envVarName` (back)
- [x] 2.1 `TenantConfigDeps` gana `readBakeableSecrets`; `defaultDeps` lo satisface con la función
  real ya existente en `back/src/lib/tenant-secrets/store.ts`.
- [x] 2.2 `tenantConfigHandler` construye `publicEnvSecrets: Record<envVarName, value>` a partir de
  `readBakeableSecrets(businessId)`; responde `{ flags, publicSecrets, publicEnvSecrets }`.
  `publicSecrets` (indexado por `name`) no cambia de forma.
- [x] 2.3 Test: negocio con un `FRONTEND_PUBLIC` con `envVarName='NEXT_PUBLIC_GOOGLE_MAPS_API_KEY'`
  → aparece en `publicEnvSecrets` con esa clave exacta Y en `publicSecrets` indexado por su `name`.
- [x] 2.4 Test: un `FRONTEND_PUBLIC` SIN `envVarName` aparece en `publicSecrets` pero NO en
  `publicEnvSecrets` (el filtro `envVarName IS NOT NULL` de `readBakeableSecrets` se respeta tal
  cual, sin relajarlo).
- [x] 2.5 Test (fuga cero, repetido con la superficie de auth ampliada de WU1): un
  `BACKEND_SECRET` del mismo negocio nunca aparece en `publicSecrets` NI en `publicEnvSecrets`,
  sea cual sea el camino de auth (`TenantApiKey` o sesión).

## WU3 — `front/lib/maps/loader.ts` async
- [x] 3.1 Nueva función `resolveGoogleMapsApiKey(): Promise<string | undefined>` que cachea en
  memoria de módulo (por carga de página) y, si no hay cache, llama
  `apiFetch<{ publicEnvSecrets: Record<string, string> }>('/tenant-config')` y extrae
  `publicEnvSecrets.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`. Cualquier error (red/401/500/campo ausente)
  se trata como "sin clave", sin relanzar detalle.
- [x] 3.2 `loadGoogleMaps()` pasa a `await resolveGoogleMapsApiKey()`; si no hay clave, lanza el
  MISMO mensaje que hoy: `'Falta NEXT_PUBLIC_GOOGLE_MAPS_API_KEY en la configuración del front'`.
  El flag `configured` se mantiene (idempotencia de `setOptions` dentro de la misma carga).
- [x] 3.3 Test unitario del loader (nuevo o ampliando el existente si lo hay): mock de `apiFetch`
  devolviendo `publicEnvSecrets` con la clave → `loadGoogleMaps()` resuelve y llama `setOptions`
  una sola vez aunque se invoque dos veces seguidas (cache de módulo).
- [x] 3.4 Test: mock de `apiFetch` sin la clave (o rechazando) → `loadGoogleMaps()` rechaza con el
  mensaje esperado, sin llamar `setOptions`.

## WU4 — `front/components/comercial/mapa-clientes.tsx` async-aware
- [x] 4.1 Estado de inicialización pasa a cubrir `loading` antes de decidir `ready`/`error` (el
  `useEffect` de montaje ya no decide síncronamente con `googleMapsApiKey()`).
- [x] 4.2 Mientras `loading`, el contenedor muestra un placeholder (no el mapa ni el mensaje de
  error) — hueco temporal nuevo que hoy no existe por ser síncrono.
- [x] 4.3 Si la resolución async falla o no hay clave, se muestra EXACTAMENTE el mismo texto que
  hoy: `"Mapa no disponible: falta NEXT_PUBLIC_GOOGLE_MAPS_API_KEY."`.
- [x] 4.4 Test `comercial-mapa-clientes.test.tsx`: ajustar mocks de `loader.ts` a funciones que
  devuelven promesas; nuevo caso cubriendo el estado `loading` (el mapa no se pinta hasta que la
  promesa resuelve) y el caso de fetch fallido (mismo mensaje de error que el caso "sin key" ya
  cubierto).

## Cierre
- [x] Z.1 `tsc` limpio en `back/` y en `front/`.
- [x] Z.2 Suite de `back/` y `front/` verde (WU1-WU4).
- [ ] Z.3 Verificación visual manual: negocio con `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` guardado en
  `TenantSecret` vía `POST /businesses/:id/secrets` (operator token, endpoint ya existente) → el
  mapa carga en `/comercial` del panel SIN redeploy de Vercel entre el guardado y la carga.
- [ ] Z.4 sdd-verify o `/code-review` antes de cualquier commit (preferencia registrada del
  usuario: siempre, no solo `tsc`/tests manuales).
- [ ] Z.5 Registrar en Engram la decisión de auth dual (`resolveTenantConfigAuth`) y el nuevo
  campo `publicEnvSecrets`, para que los 2 changes hermanos (panel operador, panel self-service)
  lo reutilicen sin redescubrirlo.
