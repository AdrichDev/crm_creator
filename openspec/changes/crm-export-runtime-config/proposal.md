# crm-export-runtime-config

## Intención
Que las apps que salen de los 4 exportadores (`web-zip`, `apk`, `exe`, `ipa`) salgan **ya
cableadas** al runtime de plataforma que se está construyendo en paralelo: config de tenant
servida en caliente (`/tenant-config`), acceso a IA medido/facturado vía proxy
(`/ai-proxy`) y un interceptor que reacciona al **kill switch** de plataforma (HTTP 423). Hoy el
exportador solo hornea un `TenantConfig` estático en build time (`NEXT_PUBLIC_TENANT_JSON`,
`front/lib/config/tenant-config.ts:BAKED_TENANT_CONFIG`) y una `NEXT_PUBLIC_API_URL` suelta; no
hay noción de tenant autenticado ante la plataforma ni de límite operativo runtime.

## Problema
Verificado en código (`back/src/lib/export-temp-copy.ts`, `back/src/lib/export-builders/*.ts`,
`front/lib/config/tenant-config.ts`): el `.env.local` que reciben las apps exportadas hoy solo
lleva `NEXT_PUBLIC_TENANT_JSON` (config horneada en build time, no actualizable sin recompilar y
redistribuir) y, si el tenant tiene `config.api.url`, una `NEXT_PUBLIC_API_URL` para su propio
backend. No existe:
- Un endpoint de configuración runtime (`/tenant-config`) que la app exportada pueda consultar en
  caliente sin recompilar (hoy búsqueda: cero coincidencias de `tenant-config` como ruta HTTP en
  `back/src`, solo el nombre del archivo front que decodifica el JSON horneado).
- Un proxy de IA medido (`/ai-proxy`) — hoy no existe ninguna coincidencia de `ai-proxy` en
  `back/src`.
- Un interceptor de kill switch (respuesta 423) — cero coincidencias de `423`/`killSwitch` en
  `back/src`.

Sin este cableado, cuando `crm-tenant-api-keys` y `crm-ai-proxy` entreguen esos endpoints en el
backend de plataforma, las apps YA exportadas y entregadas a clientes no sabrán hablar con ellos
(seguirían con el `TenantConfig` estático y sin proxy de IA), obligando a re-exportar y
re-entregar manualmente cada app existente.

## Alcance
- El exportador (`exports.ts` + los 4 builders) inyecta en el `.env.local` de cada ZIP las
  variables runtime que el front necesita para hablar con la plataforma:
  `PLATFORM_API_URL` (o `NEXT_PUBLIC_PLATFORM_API_URL` si debe ser público en el bundle — a
  decidir en `crm-tenant-api-keys`), `TENANT_ID`, `TENANT_API_KEY`. La inyección se hace
  aportando las variables al punto de extensión `buildEnvContent` de
  `crm-export-clean-manifest` (escritor único de `.env.local`); los builders no escriben ni
  appendean el archivo directamente.
- El `.env.example` que viaja en el ZIP lo emite en exclusiva `crm-export-clean-manifest`
  (dueña de su emisión); este change solo especifica QUÉ líneas placeholder deben existir:
  `PLATFORM_API_URL=`, `TENANT_ID=`, `TENANT_API_KEY=` — nunca valores reales, ni siquiera los
  del tenant que se está exportando en ese momento.
- El `.env.local` real (el que sí baja con el cliente, no `.env.example`) sí lleva los valores
  reales horneados para ESE tenant (igual que hoy hace con `NEXT_PUBLIC_TENANT_JSON`).
- Fuera de alcance (pertenece a `crm-tenant-api-keys` / `crm-ai-proxy`, no se detalla aquí): la
  implementación del endpoint `/tenant-config` en el backend de plataforma, la implementación del
  proxy `/ai-proxy` y su medición/facturación, la emisión y rotación de `TENANT_API_KEY`, y el
  propio mecanismo de kill switch (qué lo activa, quién lo gestiona). Este change asume que esos
  tres existen como contrato HTTP y se limita a que el exportador entregue el front YA apuntando
  a ellos.
- Fuera de alcance: cambios de modelo de datos / migraciones (ninguna en este change; las tablas
  de tenant/API key, si existen, las define `crm-tenant-api-keys`).

## Decisiones
- **El exportador no implementa el cliente runtime, lo consume.** Se asume que
  `crm-tenant-api-keys`/`crm-ai-proxy` entregan en `front/` (código fuente compartido, no
  generado por el exportador) un cliente de config runtime, un cliente de `/ai-proxy` y el
  interceptor 423. El trabajo de este change es puramente de **cableado del exportador**: qué
  variables de entorno recibe cada ZIP y de dónde salen esos valores.
- **`.env.example` siempre con placeholders, `.env.local` siempre con valores reales.** Mismo
  principio que `crm-export-clean-manifest` aplica a la fuga de `.env.local` de desarrollo:
  aquí se aplica al par `.env.example`/`.env.local` para las credenciales de plataforma —
  `.env.example` nunca lleva secretos, ni siquiera los del tenant en curso.
- **Sin escritura directa de `.env.local`/`.env.example` en este change.** El único escritor de
  `.env.local` y el único emisor de `.env.example` es el módulo de `crm-export-clean-manifest`
  (`buildEnvContent`/`writeFreshEnvLocal`); este change contribuye sus 3 variables y sus 3
  placeholders extendiendo `buildEnvContent` (hook documentado en el `design.md` de esa change),
  evitando que un append posterior pise —o sea pisado por— la escritura fresca de esa change.
- **Reutilizar `TenantConfig.business.clienteId` como candidato a `TENANT_ID`** si
  `crm-tenant-api-keys` no define un identificador propio distinto (a confirmar en esa change; se
  deja como opción, no como decisión cerrada, para no invadir su alcance).
- **Aplica a los 4 formatos por igual.** Web, Android, iOS y Desktop reciben el mismo cableado
  runtime (mismas 3 variables), porque los 4 comparten el mismo código fuente de `front/`.

## Riesgos
- **Dependencia bloqueante real.** Sin `/tenant-config` y `/ai-proxy` implementados en el backend
  de plataforma (`crm-tenant-api-keys`, `crm-ai-proxy`), este change solo puede completarse hasta
  el punto de "el exportador escribe las variables correctas"; el comportamiento runtime completo
  (kill switch, medición IA) no es verificable end-to-end hasta que esas dos changes existan.
  Mitigación: los tests de este change verifican el cableado del exportador (variables correctas
  en el ZIP), no el comportamiento del backend de plataforma.
- **Compatibilidad con `NEXT_PUBLIC_API_URL` existente.** El tenant puede seguir teniendo su
  propio backend (`config.api.url`, modelo SaaS-puro histórico) independiente del backend de
  plataforma (`PLATFORM_API_URL`). Ambas variables pueden coexistir; no se decide en este change
  si una reemplaza a la otra (a definir junto con `crm-tenant-api-keys`, que es quien sabe si el
  modelo SaaS-puro sigue vivo o migra completo a plataforma).
- **Exponer `TENANT_API_KEY` en el bundle.** Si el front la necesita como variable `NEXT_PUBLIC_*`
  (visible en el bundle cliente), es una clave de larga vida expuesta públicamente; si
  `crm-tenant-api-keys` decide que debe rotar o tener alcance limitado, ese diseño le corresponde
  a esa change. Aquí solo se documenta el riesgo para que no se dé por sentado que
  `NEXT_PUBLIC_TENANT_API_KEY` es management-safe.

## Dependencias
- `crm-tenant-api-keys` (no detallada aquí): define el modelo de `TENANT_ID`/`TENANT_API_KEY`, su
  emisión/rotación y el endpoint `/tenant-config`.
- `crm-ai-proxy` (no detallada aquí): define el endpoint `/ai-proxy` y su medición/facturación.
- `crm-export-clean-manifest` (dependencia de mecanismo): aporta el punto de extensión
  `buildEnvContent` (escritor único de `.env.local`) y la emisión única de `.env.example`, que
  este change consume para contribuir sus 3 variables y sus 3 placeholders. Las WU de cableado
  de builders (WU2/WU3) requieren que ese mecanismo haya aterrizado; este change NO escribe
  `.env.local` ni emite `.env.example` por su cuenta como fallback.
