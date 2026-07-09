# crm-tenant-keys-self-service

## Intención
Que el propio tenant (`ADMIN`/`MANAGER` del negocio) gestione sus API keys de proveedores IA
(OpenAI, Gemini, Anthropic), su clave de Google Maps y su URL de conexión de BD **desde el panel de
Configuración**, sin depender del operador. Esta change NO construye backend nuevo: **reutiliza** los
endpoints, el catálogo, `testProviderConnection` y el componente `TenantKeysPanel` que define
`crm-onboarding-tenant-keys`. Su aporte propio es montar ese componente en una pestaña nueva de
`front/app/(crm)/configuracion/page.tsx`, con el `businessId` derivado de la sesión propia y la
pestaña gateada por el `MemberRole` crudo del usuario.

## Problema
Verificado en código: hoy la única forma de escribir los secretos de un negocio es el router de
operador (`back/src/routes/service-operator-tenant-keys.ts`, bajo `requireOperatorToken`, token
global service-to-service para el bot), o —tras `crm-onboarding-tenant-keys`— el paso de onboarding.
Un `ADMIN`/`MANAGER` autenticado por sesión normal (`authenticate`, `back/src/middleware/auth.ts`) no
tiene ninguna entrada en el panel de Configuración para leer el estado o dar de alta sus propios
`TenantSecret`. El propio `crm-tenant-api-keys` lo declara como fuera de alcance: *"UI de autoservicio
para que el propio tenant gestione sus claves (por ahora las emite el operador)"*.

`crm-onboarding-tenant-keys` resuelve el backend humano (endpoints por sesión + membership, catálogo
de 5 slots, `testProviderConnection`, componente `TenantKeysPanel`), pero solo lo monta en el flujo de
onboarding. Falta la superficie de autoservicio dentro del panel del día a día.

## Alcance
- **Reutilización (no duplicación) del backend compartido de `crm-onboarding-tenant-keys`:**
  - Endpoints `/tenant-keys/:businessId/secrets[...]` (`GET`/`PUT`/`DELETE`/`POST .../test`), por
    sesión + `Membership`, con `businessId` validado como `projects.ts:111` y gate `ADMIN`/`MANAGER`.
  - Catálogo fijo de 5 slots (`back/src/lib/tenant-secrets/catalog.ts`).
  - `testProviderConnection` (`back/src/lib/tenant-secrets/provider-test.ts`).
  - Componente `front/components/config/tenant-keys-panel.tsx`.
  - Esta change NO añade router, catálogo, módulo de test ni componente propios.
- **Aporte propio (front):**
  - Pestaña nueva `'claves-api'` en `front/app/(crm)/configuracion/page.tsx` (`Tab`/`TAB_LABEL`/
    `TABS`), que monta `<TenantKeysPanel businessId={businessId de sesión} />`.
  - El `businessId` a pasar al panel es el de la sesión activa del usuario (resuelto por
    `authenticate` desde su `Membership`); el mismo componente, con ese `businessId` en el path, habla
    con los endpoints compartidos.
  - **Gate de visibilidad de la pestaña por `MemberRole` crudo** (`ADMIN`/`MANAGER`), obtenido de
    `GET /auth/me` vía `getAuthProfile()` (`front/lib/api/profile.ts`), NO del `Role` colapsado de la
    demo (que funde `MANAGER` y `EMPLOYEE` en `'trabajador'`). El backend es la autoridad final (403
    para `EMPLOYEE`/`CLIENT`); el front solo evita la mala UX de mostrar una pestaña que daría 403.
- **Fuera de alcance:** todo el backend (lo aporta `crm-onboarding-tenant-keys`); el router de
  operador (`requireOperatorToken`, se mantiene para el bot); el reflejo runtime de Maps sin rebuild
  (`crm-tenant-secrets-runtime-maps`, consumido por el componente compartido).

## Decisiones
- **Se reutiliza la MISMA ruta con `:businessId` validado por membership; no hay router self-service
  separado.** El `ADMIN`/`MANAGER` es miembro de su propio negocio, así que pasa el
  `membership.findFirst` igual que el operador de onboarding. El `businessId` que el front pone en el
  path es el de su propia sesión; el backend valida la membership del `req.userId` sobre ese
  `businessId` (patrón `projects.ts:111`), de modo que un usuario solo puede operar sobre negocios de
  los que es miembro. Esto sustituye al diseño previo de "router sin parámetro `:businessId`": con el
  gate de membership del path, la garantía cross-tenant es equivalente (un `:businessId` ajeno cae en
  el 404 del `membership.findFirst`), y evita duplicar handlers, catálogo, `testProviderConnection` y
  componente. Ver `design.md` §2.
- **Gate de la pestaña con el `MemberRole` crudo, no con el `Role` colapsado.** No hace falta cambiar
  el back: `GET /auth/me` (`back/src/routes/auth.ts:56-69`) YA expone `role` crudo y
  `getAuthProfile()` (`front/lib/api/profile.ts`) YA lo consume. La pestaña se incluye en `TABS` solo
  si `memberRole === 'ADMIN' || memberRole === 'MANAGER'`; fail-closed si el rol no se resuelve. No se
  toca `front/lib/config/roles.ts` ni `front/lib/auth/session.ts` (colapso `Role` intacto para el
  sidebar). Ver `design.md` §3.
- **El valor del secreto nunca se devuelve al front** — ni al propio dueño — mismo principio
  write-only garantizado por los endpoints compartidos.

## Riesgos
- **Primera superficie de escritura self-service de secretos sensibles del tenant sobre sí mismo.**
  Hasta ahora todo endpoint tenant-facing (`/me/*`) es de solo lectura de datos propios o escritura de
  datos operativos; esta pestaña abre escritura de credenciales de terceros. La mitigación vive en el
  backend compartido (gate de membership + rol `ADMIN`/`MANAGER`, rate-limit del `/test`, valor nunca
  devuelto); esta change añade una revisión de seguridad dedicada de la superficie front antes de push
  (ver `tasks.md`).
- **Confusión de scope si crece el catálogo.** El catálogo es propiedad de `crm-onboarding-tenant-keys`
  (única fuente de verdad); esta change lo importa, no lo copia — evita que un 5º/6º slot con `scope`
  equivocado diverja entre superficies.
- **Rate-limit heredado del `/test` compartido.** El endpoint `/test` que esta change reutiliza ya
  incorpora rate-limit por `businessId:name` (definido por `crm-onboarding-tenant-keys`); esta change
  no lo re-implementa. Si en el futuro se separa el rate-limit por superficie, se señala aquí.

## Dependencias
- **`crm-onboarding-tenant-keys`** (dependencia dura, DUEÑA del backend y del componente compartidos):
  endpoints `/tenant-keys/:businessId/secrets[...]`, catálogo de 5 slots
  (`back/src/lib/tenant-secrets/catalog.ts`), `testProviderConnection`
  (`back/src/lib/tenant-secrets/provider-test.ts`) y componente
  `front/components/config/tenant-keys-panel.tsx`. Esta change NO implementa nada de eso; lo monta y
  lo gatea. Si esa change no ha aterrizado, TODA esta change queda BLOQUEADA (no solo una WU): sin el
  componente y los endpoints no hay nada que montar.
- **`crm-tenant-api-keys`** (aterrizada): modelo `TenantSecret`/`TenantApiKey`, store
  (`back/src/lib/tenant-secrets/store.ts`), cifrado (`back/src/lib/tenant-secrets/crypto.ts`).
- **`crm-tenant-secrets-runtime-maps`** (escrita): el reflejo runtime de `GOOGLE_MAPS_API_KEY` sin
  rebuild lo consume el componente compartido a través de `GET /tenant-config`; esta change lo hereda.
- Auth/rol existentes: `authenticate` (`back/src/middleware/auth.ts`), `requireRole`
  (`back/src/middleware/rbac.ts:6`, ejemplo `back/src/routes/customers.ts:271`), `GET /auth/me` con
  `role` crudo (`back/src/routes/auth.ts:56-69`), `getAuthProfile()` (`front/lib/api/profile.ts`).
- Anfitrión de la pestaña: `front/app/(crm)/configuracion/page.tsx`; patrón visual de referencia:
  `front/components/config/integraciones-panel.tsx`.
