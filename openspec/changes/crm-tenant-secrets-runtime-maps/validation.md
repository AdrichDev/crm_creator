# Validación — crm-tenant-secrets-runtime-maps

Historia: como **staff de un negocio** que usa el módulo Comercial del panel
(`operaos-black.vercel.app`), quiero que el mapa de clientes cargue en cuanto la plataforma tiene
guardada la clave de Google Maps del negocio, sin depender de que alguien recompile y redespliegue
el front, para no quedarme con "Mapa no disponible" indefinidamente tras configurar el secreto.

## Criterios de aceptación (AC)
- **AC1 (auth dual sin romper lo existente):** `GET /tenant-config` sigue aceptando
  `Authorization: Bearer <TENANT_API_KEY>` exactamente como hoy (apps exportadas); además acepta
  sesión Supabase + `x-business-id` (panel logueado) resolviendo `businessId` vía `Membership`,
  sin invalidar ninguno de los dos caminos.
- **AC2 (`publicEnvSecrets` correcto):** la respuesta de `/tenant-config` incluye
  `publicEnvSecrets: Record<envVarName, value>` para los secretos `FRONTEND_PUBLIC` que tienen
  `envVarName` asignado; `publicSecrets` (indexado por `name`) no cambia de forma.
- **AC3 (fuga cero, superficie ampliada):** ningún `BACKEND_SECRET` es alcanzable en
  `publicSecrets` ni en `publicEnvSecrets`, sea cual sea el camino de auth usado (`TenantApiKey` o
  sesión). Un negocio nunca ve secretos de otro negocio.
- **AC4 (mensaje de error preservado):** si no hay clave resoluble (ausente en BD, fetch falla,
  401/500 del back), `MapaClientes` muestra EXACTAMENTE
  `"Mapa no disponible: falta NEXT_PUBLIC_GOOGLE_MAPS_API_KEY."` — mismo texto que hoy, sin
  distinguir causa.
- **AC5 (estado de carga):** mientras se resuelve el fetch de la clave, `MapaClientes` no muestra
  ni el mapa ni el mensaje de error — hay un estado `loading` explícito.
- **AC6 (efectivo sin rebuild):** guardar un secreto `FRONTEND_PUBLIC`/`envVarName` nuevo en
  `TenantSecret` (vía el endpoint de operador ya existente) es visible en la siguiente carga de
  `/tenant-config` desde el panel, sin ningún build/deploy de Vercel de por medio.

## Por tarea (Given-When-Then + test)
- **WU1** Auth dual → Given un request sin `TenantApiKey` válida pero con un access token Supabase
  válido y `x-business-id` de un negocio con `Membership` del usuario, When `GET /tenant-config`,
  Then responde 200 con `businessId` resuelto vía `authenticate` (no vía `TenantApiKey`). Test:
  `tenant-config.route.test.ts`, caso nuevo de fallback a sesión + regresión del caso
  `TenantApiKey` existente + caso 401 sin ninguno de los dos.
- **WU2** `publicEnvSecrets` → Given un negocio con un `FRONTEND_PUBLIC`
  (`envVarName='NEXT_PUBLIC_GOOGLE_MAPS_API_KEY'`) y otro `FRONTEND_PUBLIC` sin `envVarName`, When
  `GET /tenant-config`, Then `publicEnvSecrets` solo contiene el primero (indexado por
  `envVarName`) y `publicSecrets` contiene ambos (indexado por `name`, sin cambios). Test:
  `tenant-config.route.test.ts`, caso nuevo.
- **WU3** Loader async → Given `apiFetch('/tenant-config')` mockeado devolviendo
  `publicEnvSecrets.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, When `loadGoogleMaps()` se llama dos veces
  seguidas, Then resuelve una sola llamada real a `apiFetch` (cache de módulo) y `setOptions` se
  llama una única vez. Test: suite del loader (nueva o ampliada), caso éxito + caso fetch
  fallido/campo ausente → rechaza con el mensaje esperado.
- **WU4** `MapaClientes` async-aware → Given el mock del loader como promesa pendiente, When el
  componente monta, Then se muestra el placeholder de `loading` (ni mapa ni error) hasta que la
  promesa resuelve; si resuelve sin clave o rechaza, se muestra el mismo texto de error de
  siempre. Test: `comercial-mapa-clientes.test.tsx`, casos ampliados (loading + fetch fallido).

> Regla del repo: una tarea está DONE solo cuando su test está verde. Sin spec → no code.

## Estado
IMPLEMENTADO (WU1-WU4 verdes) — sdd-verify PASA (0 CRITICAL; auth dual fail-closed y fuga-cero
confirmados por código + tests: back 10/10, front 12/12, tsc limpio). Pendiente solo cierre:
Z.3 (smoke visual en vivo, manual del usuario) y `sdd-archive`. No dependía de otros changes para
completarse end-to-end (`/tenant-config` ya existía; ambas decisiones de diseño son extensiones
locales). Los 2 changes hermanos (`crm-onboarding-tenant-keys`, `crm-tenant-keys-self-service`)
dependen de este para que el guardado de Maps sea verificable en vivo sin rebuild.
