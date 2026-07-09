# crm-env-contract-tiers

## Intención
Formalizar el **contrato de variables de entorno del CRM por nivel de cliente** (tres
tiers de despliegue) y construir el puente que hoy falta entre el almacén de secretos
por negocio (`TenantSecret`, definido en `crm-tenant-api-keys`) y los dos consumidores
reales de esos secretos:

1. **Build time (front exportado):** los secretos `scope=FRONTEND_PUBLIC` de un negocio
   se hornean como variables `NEXT_PUBLIC_*` en el `.env.local` generado por los
   exportadores (extensión de `buildEnvContent`, propiedad de
   `crm-export-clean-manifest`).
2. **Runtime (back de plataforma):** los servicios del back resuelven secretos
   `scope=BACKEND_SECRET` **por negocio** mediante un helper único
   (`getTenantSecret(businessId, name)`) con fallback a la clave del operador (base del
   modelo medido de `crm-ai-proxy`).

Además, `.env.example` del front pasa de placeholder parcial a **contrato completo y
documentado**: toda variable que la app puede consumir, con placeholder y comentario,
nunca valores reales — que es exactamente lo que necesita el cliente tier 3 que aloja
todo por su cuenta.

## Problema
Verificado en código y en las changes pendientes:

- **Clave de mapas rota para cualquier cliente que aloje el front.**
  `front/lib/maps/loader.ts:10` lee `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` y **lanza en la
  línea 16 si falta**. Esa variable NO está en `front/.env.example` y ningún exportador
  la inyecta (`back/src/lib/export-builders/*.ts` solo hornean
  `NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_TENANT_JSON` hoy; `crm-export-runtime-config` añade
  `PLATFORM_API_URL`/`TENANT_ID`/`TENANT_API_KEY`, tampoco la clave de mapas). Resultado:
  toda app exportada con mapas casca en runtime y el cliente tier 3 ni siquiera sabe que
  la variable existe.
- **No hay modelo formal de "qué variable vive dónde según quién aloja qué".** El back en
  producción (Render) lee todo de env de host (`DATABASE_URL`, `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, opcionales `ANTHROPIC_API_KEY`, `AUTOMATION_WEBHOOK_*`,
  `GOOGLE_OAUTH_*`). Funciona para un operador con un solo entorno, pero no responde:
  ¿dónde vive la clave OpenAI propia de un cliente concreto? ¿Y su credencial de
  WhatsApp? ¿Qué pasa cuando el cliente aporta su propia base de datos? Hoy la única
  respuesta implícita es "todo en el env global del operador", que ni escala ni aísla.
- **Los secretos por negocio no tienen consumidor.** `crm-tenant-api-keys` define
  `TenantSecret` con scopes `FRONTEND_PUBLIC`/`BACKEND_SECRET`, pero: (a) ningún
  call-site del back lee un `BACKEND_SECRET` por negocio — p. ej.
  `back/src/routes/branding.ts:88` responde "IA no configurada" si falta el
  `ANTHROPIC_API_KEY` **global** (`back/src/env.ts:21`), sin mirar si ESE negocio tiene
  clave propia; y (b) ningún exportador convierte un `FRONTEND_PUBLIC` en variable de
  build. El almacén existe (como spec) pero está desconectado de ambos extremos.
- **`.env.example` no es un contrato.** `crm-export-runtime-config` decide que viaje solo
  con placeholders de las 3 variables de plataforma; nadie define su contenido completo.
  Un cliente tier 3 que reciba el export limpio no tiene documento de referencia de qué
  variables puede/debe configurar.

## Alcance
- **A. Modelo formal de tres tiers (contrato documentado, no código):**
  - **Tier 1 — operador aloja back + DB:** todos los secretos de runtime de plataforma en
    env de host del operador. Las claves de terceros propias del cliente (su OpenAI, su
    WhatsApp, su Google Maps) viven en `TenantSecret`: las server-side como
    `BACKEND_SECRET` (las lee el back por negocio en runtime), las públicas de build como
    `FRONTEND_PUBLIC` (las hornea el exportador). Sin clave propia → fallback a la clave
    del operador + medición (ref. `crm-ai-proxy`).
  - **Tier 2 — operador aloja back, DB del cliente:** igual que tier 1 pero
    `DATABASE_URL` apunta a la base del cliente. Recomendación vinculante del contrato:
    **una instancia de back aislada por cliente tier 2** — nunca mezclar credenciales de
    DB ajenas en un env compartido. Es contrato de despliegue, no código.
  - **Tier 3 — el cliente aloja todo:** la entrega es el export de fuente limpia
    (`crm-export-clean-manifest`); `.env.example` es el contrato COMPLETO documentado
    (toda variable consumible por la app, incluida `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`,
    variables Supabase, URL de API), solo placeholders, jamás valores reales.
- **B. Puente build-time (entregable principal de código):** los builders de export
  hornean los secretos `FRONTEND_PUBLIC` del negocio en el `.env.local` generado como
  variables `NEXT_PUBLIC_*`. El mapeo secreto→variable viaja con el propio secreto
  (campo `envVarName` en `TenantSecret`, p. ej. clave de mapas →
  `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`). Se implementa como **extensión de
  `buildEnvContent`** (propiedad de `crm-export-clean-manifest`) — este change **NO
  introduce un segundo escritor de `.env.local`**.
- **C. Resolución de `BACKEND_SECRET` por negocio en el back:** helper
  `getTenantSecret(businessId, name)` con fallback a env del operador, y **una adopción
  de referencia** (el call-site de IA de branding, `back/src/routes/branding.ts`). El
  alcance aquí es el helper + una adopción, no migrar todas las integraciones.
- **D. `.env.example` regenerado como contrato documentado** (tier 3). La propiedad se
  coordina con `crm-export-clean-manifest`: esa change lo mete en el allowlist del
  manifiesto; esta define su contenido.

## Fuera de alcance
- Migrar todas las integraciones del back a `getTenantSecret` (solo la adopción de
  referencia; el resto, adopción incremental posterior).
- El proxy de IA, la medición y la facturación del fallback (→ `crm-ai-proxy`,
  `crm-metering-core`). Aquí solo se garantiza que el helper distingue `source:
  'tenant' | 'operator'` para que el metering pueda colgarse de esa señal.
- El almacén `TenantSecret`/`TenantApiKey` en sí, su cifrado y sus endpoints de operador
  (→ `crm-tenant-api-keys`).
- Tooling de provisioning de instancias tier 2 (el contrato lo documenta; automatizarlo
  es una change futura si el volumen lo justifica).
- Restricción por referrer de las claves públicas horneadas (responsabilidad del emisor
  de la clave en su consola de terceros; el contrato lo exige documentalmente, el código
  no puede imponerlo).

## Decisiones
- **Un solo escritor de `.env.local`.** `crm-export-clean-manifest` establece que cada
  builder escribe SIEMPRE un `.env.local` fresco vía `buildEnvContent(config)`. Este
  change extiende esa función (nuevas líneas `NEXT_PUBLIC_*` desde `FRONTEND_PUBLIC`);
  prohibido añadir un segundo punto de escritura o un `appendFileSync` posterior.
- **El mapeo secreto→variable viaja con el secreto.** Campo aditivo `envVarName`
  (nullable) en `TenantSecret`, solo con sentido para `scope=FRONTEND_PUBLIC`. Evita una
  tabla de mapeo paralela y hace autodescriptivo el alta del secreto: el operador declara
  a qué variable de build se traduce.
- **Validación estricta del nombre y del valor horneado.** `envVarName` debe cumplir
  `^NEXT_PUBLIC_[A-Z0-9_]+$` (se rechaza en el alta cualquier otro nombre: un
  `FRONTEND_PUBLIC` jamás se hornea como variable no pública). El valor se rechaza si
  contiene saltos de línea (inyección de variables adyacentes en el `.env.local`
  generado).
- **`BACKEND_SECRET` nunca se hornea.** El puente build-time lee exclusivamente
  `scope=FRONTEND_PUBLIC`. La frontera es la misma que impone `GET /tenant-config` en
  `crm-tenant-api-keys`, aplicada al segundo consumidor (exportador).
- **Fallback explícito y trazable.** `getTenantSecret` devuelve `{ value, source }` con
  `source: 'tenant' | 'operator'`; el call-site decide qué hacer (branding: usar la que
  haya; ai-proxy futuro: medir solo cuando `source='operator'`). Sin clave en ningún lado
  → mismo comportamiento actual (feature degradada, no crash).
- **Tier 2 = instancia aislada, por contrato.** No se escribe código multi-DB: el env de
  cada instancia tier 2 es idéntico al de tier 1 salvo `DATABASE_URL`. Documentarlo como
  contrato evita la tentación futura de un back compartido con N `DATABASE_URL_*`.
- **`.env.example` documenta TODO, con placeholder y comentario por variable**, agrupado
  por bloque (plataforma / mapas / Supabase / opcionales). Nunca valores reales, ni
  siquiera los del tenant en curso (mismo principio que `crm-export-runtime-config`).

## Riesgos
- **Claves públicas horneadas en el bundle.** Toda `NEXT_PUBLIC_*` queda visible en el
  JS del cliente (es la naturaleza de Next). El contrato exige que solo se marquen
  `FRONTEND_PUBLIC` claves diseñadas para exposición pública y restringidas por referrer
  (caso Google Maps). Mitigación: validación de nombre (`NEXT_PUBLIC_` obligatorio) hace
  imposible hornear algo sin que su nombre grite que es público, y la documentación del
  alta de secreto lo advierte.
- **Confusión de scope en el alta** (marcar como `FRONTEND_PUBLIC` + `envVarName` algo
  sensible). Mitigación parcial: la decisión es del operador (única superficie de alta,
  `crm-tenant-api-keys`); el puente no puede distinguir una clave "legítimamente pública"
  de una filtrada. Se documenta como criterio del operador en el contrato.
- **Colisión de propiedad con `crm-export-clean-manifest`.** Dos changes tocan
  `buildEnvContent` y `.env.example`. Mitigación: orden explícito — clean-manifest
  aterriza primero (crea la función y el allowlist); este change solo extiende. Si se
  implementan juntas, un solo builder-owner por archivo (regla de guardarraíl del repo).
- **Dependencia bloqueante real.** Sin `crm-tenant-api-keys` no hay `TenantSecret` que
  leer ni hornear. El WU de contrato documentado (`.env.example` + tiers) no depende de
  nada y puede aterrizar solo; los WUs de código quedan bloqueados hasta que el almacén
  exista.

## Rollback
- Migración aditiva (una columna nullable): revertible con `DROP COLUMN` sin pérdida de
  datos ajenos.
- La extensión de `buildEnvContent` es puro build-time: revertirla devuelve los exports
  al estado anterior (sin `NEXT_PUBLIC_*` de tenant), sin afectar apps ya entregadas.
- `getTenantSecret` con fallback es backward-compatible: si no hay secreto de tenant, el
  comportamiento es idéntico al actual (env del operador). Revertir la adopción de
  referencia = volver a leer `env.anthropicApiKey` directo.

## Dependencias
- **Dura — `crm-tenant-api-keys`:** modelo `TenantSecret` (scopes, cifrado,
  `readTenantSecret`/`readPublicSecrets` en `back/src/lib/tenant-secrets/store.ts`).
- **Dura — `crm-export-clean-manifest`:** `buildEnvContent(config)` como escritor único
  del `.env.local` generado + `.env.example` en el allowlist del manifiesto.
- **Blanda — `crm-ai-proxy` / `crm-metering-core`:** consumidores futuros de
  `source='operator'` para medir el fallback. Este change no los necesita para
  completarse.
- **Relacionada — `crm-export-runtime-config`:** define las 3 variables de plataforma
  (`PLATFORM_API_URL`/`TENANT_ID`/`TENANT_API_KEY`) del mismo `.env.local`; este change
  añade el bloque `NEXT_PUBLIC_*` de tenant al mismo archivo por la misma vía
  (`buildEnvContent`), sin pisar esas variables.

## Criterios de éxito
- Existe un documento de contrato (tiers 1/2/3) que responde, para cada variable que la
  app o el back consumen, dónde vive según quién aloja qué.
- Un export de un negocio con clave de mapas `FRONTEND_PUBLIC` produce un `.env.local`
  con `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=<valor>`; el mismo export sin esa clave no rompe
  y `.env.example` documenta la variable.
- Ningún `BACKEND_SECRET` aparece jamás en un `.env.local` generado ni en
  `.env.example` con valor real.
- `getTenantSecret` resuelve por negocio con fallback a operador y `source` correcto;
  branding usa la clave del negocio cuando existe.
- back tests verde, `tsc` limpio, `prisma migrate status` sin drift.
