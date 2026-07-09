# Diseño técnico — crm-tenant-secrets-runtime-maps

## 1. Decisión clave 1 — auth dual en `GET /tenant-config`

**Mecanismo de resolución de tenant elegido: reutilizar los DOS que ya existen en el repo, en
cascada, sin crear un tercero.**

Hoy el router (`back/src/routes/tenant-config.ts`) solo monta:
```ts
tenantConfigRouter.get('/', resolveTenantApiKey(), (req, res) => tenantConfigHandler(defaultDeps, req, res));
```
`resolveTenantApiKey()` (`back/src/middleware/tenant-api-key.ts`) exige un `Bearer` que sea el
token en claro de una `TenantApiKey` — el mecanismo de las apps exportadas
(`crm-export-runtime-config`). El panel CRM logueado nunca tiene una `TenantApiKey`: su Bearer es
un access token de Supabase, verificado por `authenticate` (`back/src/middleware/auth.ts`), que
resuelve `businessId` contra `Membership` usando el header `x-business-id` (o el primer membership
si no llega). Este es el MISMO mecanismo que ya resuelve el tenant activo en TODO el resto del
panel (`front/lib/api/client.ts:apiFetch`, `front/lib/auth/session.ts:getActiveBusinessId`).

Cambio propuesto — nueva función `resolveTenantConfigAuth` en `back/src/routes/tenant-config.ts`
(o en `tenant-api-key.ts`, a decidir en implementación por dónde encaje mejor sin duplicar
imports), que compone ambos middlewares:

```ts
export function resolveTenantConfigAuth(
  apiKeyDb: TenantApiKeyDb = prisma,
) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (token) {
      const key = await apiKeyDb.tenantApiKey.findUnique({
        where: { tokenHash: hashApiKeyToken(token) },
        select: { id: true, businessId: true, revokedAt: true },
      });
      if (key && key.revokedAt == null) {
        req.tenantBusinessId = key.businessId;
        void apiKeyDb.tenantApiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
        return next();
      }
    }
    // Fallback: sesión Supabase + Membership (mismo camino que `authenticate`).
    return authenticate(req, res, (err?: unknown) => {
      if (err) return; // authenticate ya respondió (401/403/500)
      req.tenantBusinessId = req.businessId;
      next();
    });
  };
}
```

Puntos de diseño explícitos:
- **No se duplica lógica de verificación de token ni de `Membership`.** Se llama `authenticate`
  TAL CUAL como fallback — es la misma función que usa el resto del router protegido
  (`back/src/routes/index.ts:62`). Si `authenticate` responde 401/403/500 directamente (porque no
  hay token Supabase válido tampoco), esa respuesta ya sale de la request; no hay branch adicional
  que reimplemente esa semántica.
- **Orden de intento: `TenantApiKey` primero.** Un token de sesión Supabase NUNCA tiene el prefijo
  `tk_` de un `TenantApiKey` (`generateApiKeyToken`, `tenant-api-key.ts:31-36`) — el lookup por
  hash simplemente no encuentra fila y cae al fallback sin ambigüedad. No hay caso donde un token
  válido para un mecanismo sea malinterpretado por el otro.
- **`resolveTenantApiKey()` original queda intacto** (no se toca `tenant-api-key.ts`) — sigue
  usándose donde ya se usa (queda como implementación de referencia del primer branch, si se
  decide reexportar en vez de reimplementar el fetch inline, a definir en implementación).
- **El filtro `scope=FRONTEND_PUBLIC` no cambia.** Ninguno de los dos caminos de auth otorga acceso
  a `BACKEND_SECRET` — ambos terminan fijando `req.tenantBusinessId`, y el handler sigue llamando
  exclusivamente `readPublicSecrets`/`readBakeableSecrets` (ver §2), que filtran por scope en el
  WHERE de Prisma, no en la app.

## 2. Decisión clave 2 — indexar la respuesta también por `envVarName`

`readPublicSecrets` (usado hoy por el handler) indexa por `TenantSecret.name`, una etiqueta libre
sin convención fija (ver fixtures `mapaPublicKey`/`mapaKey` en los tests existentes de
`tenant-config.route.test.ts` y `tenant-secrets.store.test.ts`). El front no puede depender de
adivinar qué `name` corresponde a `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.

El repo YA resuelve esta ambigüedad para el caso build-time: `readBakeableSecrets`
(`back/src/lib/tenant-secrets/store.ts:155-171`) selecciona `FRONTEND_PUBLIC AND envVarName IS
NOT NULL` y devuelve `{ envVarName, value }[]` — es el mismo helper que usan los 4 builders del
exportador (`back/src/lib/export-builders/public-env-secrets.ts`) para hornear `.env.local` en las
apps exportadas. Este change reutiliza el MISMO helper para el caso runtime, sin crear una query
nueva:

`back/src/routes/tenant-config.ts`:
```ts
export interface TenantConfigDeps {
  readPublicSecrets(businessId: string): Promise<Record<string, string>>;
  readBakeableSecrets(businessId: string): Promise<Array<{ envVarName: string; value: string }>>;
}

export async function tenantConfigHandler(deps: TenantConfigDeps, req: AuthedRequest, res: Response) {
  // ...(igual que hoy hasta resolver businessId)...
  const [publicSecrets, bakeable] = await Promise.all([
    deps.readPublicSecrets(businessId),
    deps.readBakeableSecrets(businessId),
  ]);
  const publicEnvSecrets: Record<string, string> = {};
  for (const { envVarName, value } of bakeable) publicEnvSecrets[envVarName] = value;
  res.json({ flags: {}, publicSecrets, publicEnvSecrets });
}
```
- `publicSecrets` (indexado por `name`) se mantiene SIN CAMBIOS — contrato existente, cualquier
  consumidor futuro que ya dependa de esta forma no se rompe.
- `publicEnvSecrets` es el campo NUEVO que consume `front/lib/maps/loader.ts`:
  `publicEnvSecrets.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.
- Ambos campos comparten el mismo cortafuegos de scope (`FRONTEND_PUBLIC`) — `readBakeableSecrets`
  además exige `envVarName IS NOT NULL` en el WHERE, así que un `FRONTEND_PUBLIC` sin `envVarName`
  simplemente no aparece en `publicEnvSecrets` (aparece solo en `publicSecrets`, igual que hoy).

## 3. Cambios en el front

### `front/lib/maps/loader.ts`
- `googleMapsApiKey()` (síncrona, lee `process.env`) se retira como fuente de verdad para el
  panel; se sustituye por una función async `resolveGoogleMapsApiKey()` que:
  1. Si ya se resolvió en esta carga de página (cache de módulo), devuelve el valor cacheado
     (o `undefined` si ya se supo que no hay clave — para no reintentar en bucle en cada montaje
     del componente).
  2. Si no, llama `apiFetch<{ publicEnvSecrets: Record<string, string> }>('/tenant-config')`
     (mismo cliente REST que el resto del front, `front/lib/api/client.ts` — Bearer + 
     `x-business-id` ya resueltos ahí) y extrae `publicEnvSecrets.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.
  3. Cualquier error (red, 401, 500, campo ausente) se trata igual: no hay clave disponible ahora
     mismo. No se relanza con detalle — el componente decide el mensaje (ver AC de
     `validation.md`).
- `loadGoogleMaps()` pasa a `await resolveGoogleMapsApiKey()` antes de `setOptions`; si no hay
  clave, lanza `new Error('Falta NEXT_PUBLIC_GOOGLE_MAPS_API_KEY en la configuración del front')`
  — MISMO mensaje que hoy (línea 16 actual), para no romper ningún caller que dependa del texto.
- El flag `configured` se mantiene: si ya se llamó `setOptions` con éxito, una segunda llamada a
  `loadGoogleMaps()` en la misma carga de página no vuelve a resolver la clave ni a llamar
  `setOptions`.

### `front/components/comercial/mapa-clientes.tsx`
- El `useEffect` de inicialización (líneas 39-66) pasa de una decisión síncrona
  (`if (!googleMapsApiKey())`) a un flujo async: estado nuevo `status: 'loading' | 'ready' |
  'error'` (sustituye el par booleano `ready`/`error` actual, o se añade un tercer estado
  `loading` inicial antes de decidir entre los otros dos — a definir en implementación cuál
  refactor es más chico).
- Mientras `status === 'loading'`, el contenedor muestra un placeholder simple (spinner o texto
  breve) en vez de nada — hoy, al ser síncrono, no hay hueco temporal que cubrir.
- El mensaje de error final, si `resolveGoogleMapsApiKey()`/`loadGoogleMaps()` no resuelven clave,
  es EXACTAMENTE el mismo string ya existente:
  `"Mapa no disponible: falta NEXT_PUBLIC_GOOGLE_MAPS_API_KEY."` — el componente no necesita saber
  SI la causa fue "sin fila en BD" o "fetch falló"; ambas convergen al mismo mensaje.

## 4. Archivos afectados

| Archivo | Cambio |
|---|---|
| `back/src/routes/tenant-config.ts` | Nueva auth dual (`resolveTenantConfigAuth`), `TenantConfigDeps` gana `readBakeableSecrets`, respuesta gana `publicEnvSecrets`. |
| `back/src/middleware/tenant-api-key.ts` | Sin cambios de comportamiento; posible export adicional si `resolveTenantConfigAuth` se implementa ahí en vez de en `tenant-config.ts` (a decidir en implementación). |
| `front/lib/maps/loader.ts` | `googleMapsApiKey()` → `resolveGoogleMapsApiKey()` async vía `apiFetch('/tenant-config')`; `loadGoogleMaps()` await la resolución antes de `setOptions`. |
| `front/components/comercial/mapa-clientes.tsx` | Estado `loading` nuevo antes de decidir `ready`/`error`; mensaje de error preservado. |
| `back/src/routes/__tests__/tenant-config.route.test.ts` | Ampliar: fixtures de auth dual + `publicEnvSecrets`. |
| `front/tests/comercial-mapa-clientes.test.tsx` | Ajustar mocks del loader a async; cubrir estado `loading`. |

## 5. Data flow
Panel logueado (`operaos-black.vercel.app`) → `MapaClientes` monta → `loadGoogleMaps()` →
`resolveGoogleMapsApiKey()` → `apiFetch('/tenant-config')` (Bearer sesión Supabase +
`x-business-id`) → `back/src/routes/tenant-config.ts`: `resolveTenantConfigAuth` intenta
`TenantApiKey` (falla, no aplica al panel), cae a `authenticate` (resuelve `businessId` vía
`Membership`) → `tenantConfigHandler` llama `readPublicSecrets` + `readBakeableSecrets` (mismo
`businessId`, filtro `FRONTEND_PUBLIC` en el WHERE de ambas queries) → responde
`{ flags, publicSecrets, publicEnvSecrets }` → front lee
`publicEnvSecrets.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` → `setOptions({ key, v: 'weekly' })` →
`google.maps.*` disponible, SIN que hiciera falta ningún build/deploy de Vercel entre el momento en
que el secreto se guardó en BD y el momento en que el panel lo usa.

## 6. Estrategia de test
- Back: ampliar `tenant-config.route.test.ts` con (a) fixtures de sesión Supabase + `Membership`
  ejercitando el fallback de `resolveTenantConfigAuth` cuando el Bearer no es un `TenantApiKey`
  válido; (b) `publicEnvSecrets` presente y correctamente indexado por `envVarName`, con un
  `FRONTEND_PUBLIC` sin `envVarName` ausente de ese campo (pero presente en `publicSecrets`, sin
  cambios); (c) `BACKEND_SECRET` nunca alcanzable por ninguno de los dos caminos de auth (repite el
  patrón de fuga cero ya cubierto, ahora con la superficie de auth ampliada).
- Front: `comercial-mapa-clientes.test.tsx` — mock de `loader.ts` pasa a devolver promesas;
  nuevo caso para el estado `loading` (mapa no se pinta hasta que resuelve) y caso de fetch
  fallido → mismo mensaje de error que hoy sin clave.
- No bloqueado: a diferencia de `crm-export-runtime-config`, este change NO depende de piezas de
  otro change para completarse — `/tenant-config` ya existe con el shape base, y ambas
  decisiones (auth dual, `publicEnvSecrets`) son extensiones locales sobre código ya presente en
  el repo.
