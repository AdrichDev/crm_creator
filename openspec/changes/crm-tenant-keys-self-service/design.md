# Diseño técnico — crm-tenant-keys-self-service

Esta change es **front-only** salvo tests: reutiliza el backend, el catálogo, `testProviderConnection`
y el componente `TenantKeysPanel` de `crm-onboarding-tenant-keys`. No define router, endpoints,
catálogo ni componente propios. Su trabajo es montar el componente compartido en una pestaña de
Configuración, pasarle el `businessId` de la sesión propia y gatear la pestaña por el `MemberRole`
crudo.

## 1. Qué se reutiliza (de `crm-onboarding-tenant-keys`)

- **Endpoints** `/tenant-keys/:businessId/secrets[...]` (`GET`/`PUT`/`DELETE`/`POST .../test`),
  montados bajo `authenticate`, con `businessId` validado por `Membership` del `req.userId` (patrón
  `projects.ts:111`) y gate `ADMIN`/`MANAGER` sobre la membership del `:businessId` del path.
- **Catálogo** de 5 slots (`back/src/lib/tenant-secrets/catalog.ts`): `OPENAI_API_KEY`/
  `GEMINI_API_KEY`/`ANTHROPIC_API_KEY` (`BACKEND_SECRET`), `GOOGLE_MAPS_API_KEY`
  (`FRONTEND_PUBLIC`/`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`), `DATABASE_URL` (`BACKEND_SECRET`).
- **`testProviderConnection`** (`back/src/lib/tenant-secrets/provider-test.ts`).
- **Componente** `front/components/config/tenant-keys-panel.tsx` (prop `businessId`, tarjetas por slot,
  Guardar/Probar/Quitar, valor nunca mostrado).
- **Cliente REST** `front/lib/api/tenant-keys.ts` (funciones sobre `apiFetch` con `businessId` en el
  path). Si esta change necesita ajustar el cliente, coordina con la change dueña — no crea una copia.

## 2. `businessId` de la sesión propia + cross-tenant por membership del path

Verificado en `back/src/middleware/auth.ts` (`authenticate`): valida el Bearer de Supabase, carga los
`Membership` del usuario y resuelve la membership activa cruzando el header `x-business-id`; fija
`req.userId`, `req.businessId` y `req.role`. El front del CRM ya envía `x-business-id` en `apiFetch`.

En esta superficie, el `businessId` que el componente pone en el path del endpoint es el de la sesión
activa del usuario (el mismo que resuelve `req.businessId`). El backend compartido valida
`prisma.membership.findFirst({ where: { userId: req.userId, businessId: req.params.businessId } })`:

- **Cross-tenant imposible:** aunque el path lleve `:businessId`, el usuario solo puede operar sobre
  negocios de los que es miembro; un `:businessId` ajeno cae en el 404 del `membership.findFirst`.
  Esta garantía es equivalente a la del diseño previo ("sin parámetro que inyectar"): el parámetro
  existe, pero está gateado por la membership real, exactamente como `PATCH /projects/:id`
  (`back/src/routes/projects.ts:109-136`), que es el patrón canónico ya probado del repo.
- **Rol:** el gate `ADMIN`/`MANAGER` del backend se evalúa sobre la membership del `:businessId` del
  path. Para un usuario en su propio negocio, ese `:businessId` coincide con el activo, así que el
  resultado es el esperado (403 para `EMPLOYEE`/`CLIENT`).

Esta change no vuelve a implementar ninguno de esos chequeos; los hereda del backend compartido. Su
responsabilidad es pasar el `businessId` correcto (el de sesión) al componente.

## 3. Gate de la pestaña por `MemberRole` crudo — reutilizar lo que ya existe

`front/lib/config/roles.ts` + `front/lib/auth/session.ts` colapsan `MANAGER` y `EMPLOYEE` al perfil de
vista `'trabajador'` — correcto para el sidebar, insuficiente para una pestaña que el back solo
permite a `ADMIN`/`MANAGER`.

**Sin cambio de back.** `GET /auth/me` (`back/src/routes/auth.ts:56-69`) YA devuelve `role: req.role`
crudo (`'ADMIN' | 'MANAGER' | 'EMPLOYEE' | 'CLIENT'`), y `getAuthProfile()`
(`front/lib/api/profile.ts`) YA lo consume a nivel raíz.

**Solución:** `front/app/(crm)/configuracion/page.tsx` llama `getAuthProfile()` en un `useEffect`
(mismo patrón ya usado ahí para precargar el horario) y guarda el `MemberRole` crudo en un estado
local `memberRole`, independiente del `Role` colapsado de `useRole()`. La pestaña `'claves-api'` se
incluye en `TABS` solo si `memberRole === 'ADMIN' || memberRole === 'MANAGER'`; si `getAuthProfile()`
falla, `memberRole` queda `null` y la pestaña no se muestra (fail-closed). No se toca
`front/lib/config/roles.ts` ni `front/lib/auth/session.ts`.

## 4. Montaje del componente compartido

```tsx
// front/app/(crm)/configuracion/page.tsx (extracto conceptual)
{tab === 'claves-api'
  && apiEnabled
  && (memberRole === 'ADMIN' || memberRole === 'MANAGER')
  && (
    <Card><CardBody>
      <TenantKeysPanel businessId={activeBusinessId} />
    </CardBody></Card>
  )}
```
- `activeBusinessId` es el `businessId` de la sesión (el mismo que `apiFetch` manda como
  `x-business-id`), disponible en la página (o vía `getAuthProfile()`/`useTenantConfig`).
- La condición se repite en el render además de en `TABS` (defensa en profundidad, mismo patrón que
  `usuarios`/`notificaciones`/`integraciones` en este archivo).
- El componente `TenantKeysPanel` (de `crm-onboarding-tenant-keys`) hace todo lo demás: listar estado,
  guardar, probar (AI/DB vía `.../test`; Maps vía `/tenant-config`), quitar — sin exponer valores.

## 5. Archivos afectados

| Archivo | Cambio |
|---|---|
| `front/app/(crm)/configuracion/page.tsx` | Nueva pestaña `claves-api`; `memberRole` vía `getAuthProfile()` en `useEffect`; monta `<TenantKeysPanel businessId={activeBusinessId} />`. |
| `front/app/(crm)/configuracion/__tests__/configuracion-page.test.tsx` | NUEVO/ampliar — visibilidad de la pestaña por `MemberRole` crudo. |
| `back/src/routes/__tests__/tenant-keys.route.test.ts` | (Propiedad de `crm-onboarding-tenant-keys`) — esta change puede añadir un caso de aislamiento cross-tenant desde la perspectiva self-service si aporta valor, sin duplicar la suite. |

Ningún archivo de backend, catálogo, `provider-test` ni `tenant-keys-panel` se crea aquí: son
propiedad de `crm-onboarding-tenant-keys`.

## 6. Data flow

Panel logueado (`ADMIN`/`MANAGER`) → pestaña "Claves API" → `<TenantKeysPanel businessId={activeBusinessId} />`
monta → `GET /tenant-keys/:businessId/secrets` (Bearer sesión + `x-business-id`, `apiFetch`) →
`authenticate` fija `req.userId`/`req.businessId`/`req.role` → el handler compartido valida
`membership.findFirst(userId, params.businessId)` (404 si no) y el rol (403 si no `ADMIN`/`MANAGER`) →
devuelve estado sin valores → usuario pega una clave → `PUT /tenant-keys/:businessId/secrets/:name` →
`encryptSecret` + upsert con `scope`/`envVarName` del catálogo → el resto del backend
(`getTenantSecret`/`readPublicSecrets`/`readBakeableSecrets`) ya sabe leer esa fila sin cambios.

## 7. Estrategia de test

- `configuracion-page.test.tsx`: con `getAuthProfile()` mockeado devolviendo `role: 'EMPLOYEE'` →
  `TABS` no incluye `'claves-api'` y el contenido no se renderiza aunque se fuerce `tab='claves-api'`;
  con `role: 'MANAGER'` o `'ADMIN'` → la pestaña sí aparece; con `role` no resuelto (`null`) →
  fail-closed (oculta).
- El comportamiento del panel (guardar/probar/quitar, valor nunca en el DOM, Maps vía `/tenant-config`)
  ya lo cubren los tests de `TenantKeysPanel` en `crm-onboarding-tenant-keys`; esta change no los
  duplica, solo verifica el montaje y el gate de la pestaña.
- Aislamiento cross-tenant y fuga cero de valor están garantizados por el backend compartido y
  cubiertos en su suite (`tenant-keys.route.test.ts` de `crm-onboarding-tenant-keys`).
- **Bloqueo:** esta change entera depende de que `crm-onboarding-tenant-keys` haya aterrizado (sin el
  componente y los endpoints no hay nada que montar). Ver `tasks.md`.
