# Design — Editar vía onboarding + landing por ZIP + IA en consonancia

**Nivel Gru: 4 — Crítica.** Solo diseño. Implementación requiere APROBACIÓN HUMANA.
**Estado: PROPUESTA TÉCNICA.** No implementar hasta aprobación.

> Este documento es el diseño técnico del change `crm-onboarding-edit-landing-ia`.
> Se apoya en el código real del front (`creador_CRM/front`), no en suposiciones.
> Superficie de seguridad alta (ingesta de ZIP arbitrario + servir HTML/JS de cliente):
> la **revisión `cybersec:*` es OBLIGATORIA** antes de mezclar (ver §7).

---

## 0. Estado del repo (hechos verificados)

Rutas reales y mecanismos sobre los que se diseña:

- **Front en subcarpeta** `creador_CRM/front` (Next.js App Router). El proposal apuntaba a
  `app/...` sin prefijo; la ruta real lleva `front/`.
- **Onboarding**: `front/app/onboarding/page.tsx`. Wizard de 4 pasos
  (`Tipo de negocio`, `Módulos`, `Marca`, `Datos`). Mantiene un `draft: TenantConfig`
  en estado local; al terminar llama `createProject(cfg)` → `openProject(id)` →
  `router.replace('/panel')`. **No hay modo edición hoy** (siempre crea).
- **Consola de proyectos**: `front/app/(dashboard)/page.tsx`. El botón **Editar**
  hoy hace `editar(id) = openProject(id); router.push('/configuracion')` — NO va al
  onboarding. Cambiar este destino es el núcleo de UC-1.
- **Config del tenant**: `front/lib/tenant-config-context.tsx`. Persistencia en
  **localStorage** (`saas.projects.v1`, `saas.active-project.v1`) + provisión async a
  Postgres (`provisionTenant` → `POST /api/projects/provision`, un **schema por proyecto**).
  Expone `createProject`, `openProject`, `update`, `setConfig`, `toggleModule`,
  `applyVertical`, `markGenerated`, `deleteProject`.
- **Branding runtime**: `front/components/layout/branding-style.tsx` inyecta
  `--brand-*` (incluye `--brand-bg/text/accent/font-heading/font-body/radius/shadow`)
  leyendo `config.branding.tokens` (`DesignTokens`). **El tipo `DesignTokens` y
  `branding.tokens` YA EXISTEN** en `front/lib/config/tenant-config.ts`. El pipe de IA→branding
  ya está medio cableado: solo falta el productor (extractor + endpoint).
- **IA**: `front/app/api/ai/generate/route.ts` es un proxy fino que reenvía a
  **agents-agency** (`aaFetch`), que es quien ejecuta el modelo y aplica el
  **metering de tokens** (deductTokens). El front NO habla directo con el LLM.
  Hoy solo soporta `kind` ∈ {`market-study`, `marketing-plan`}.
- **ZIP**: `jszip` ya es dependencia (`front/lib/generate/build.ts` lo usa para
  *generar* paquetes). Aquí se usa para *leer* ZIP entrante — patrón nuevo.
- **Grupos de rutas existentes**: `(crm)` (con `AppShell`/sidebar), `(dashboard)`
  (consola). **No existe `(landing)`** — se crea.
- **Auth NO existe aún**. Es el change separado `crm-gestion-usuarios-auth` (pendiente,
  ver su `proposal.md`). El `/(landing)/login` de este change **depende** de él.
  En `tenant-schema`/`build.ts` el RLS está stubbeado: `app.user_tenant_ids()` devuelve
  vacío "hasta añadir auth". Sin auth real, el "login del CRM" será un **placeholder**.
- **Supabase opcional**: `front/lib/supabase/client.ts` → si no hay env, modo local.
  Storage de assets debe seguir ese patrón (local ahora, Supabase Storage futuro).

---

## 1. UC-1 — Editar lleva al onboarding pre-cargado

### 1.1 Decisión de routing
- El botón **Editar** de la consola pasa a navegar a `/onboarding?projectId=<id>`
  en vez de `/configuracion`. (`/configuracion` se mantiene operativo; no se borra:
  evita regresión para quien edite campo a campo desde el panel.)
- El onboarding lee `useSearchParams().get('projectId')`. Si existe → **modo edición**;
  si no → **modo alta** (comportamiento actual intacto).

### 1.2 Pre-carga del draft (sin pérdida de datos)
- En modo edición, el `draft` inicial NO se construye con `configFromVertical(...)`
  (que resetea módulos/branding al preset). Se inicializa con una **copia profunda**
  del `config` del proyecto: `structuredClone(project.config)`.
- Riesgo de pérdida: `configFromVertical` en `pickVertical` **machaca** módulos,
  terminología y branding. En modo edición, cambiar de vertical debe **avisar**
  ("esto reemplaza módulos y marca por el preset") y requerir confirmación. Por defecto
  el vertical viene fijado y el paso 0 muestra los datos ya cargados.
- El draft debe **fusionar el catálogo de módulos** por si la config es antigua:
  reusar el patrón `deserialize()` (`{ ...emptyModules(), ...parsed.modules }`) para que
  módulos nuevos aparezcan en el grid sin romper.

### 1.3 Persistencia al terminar (modo edición)
- `finish()` se bifurca:
  - **alta** (sin `projectId`): igual que hoy → `createProject(cfg)`.
  - **edición**: `openProject(projectId)` (si no es el activo) + `setConfig(cfg)`
    (sobrescribe la config del proyecto activo en localStorage) y, si cambiaron módulos,
    **re-provisionar** el schema → `provisionTenant(projectId, cfg)`.
    `provision` es **idempotente** (`create table if not exists`, `on conflict do update`),
    así que re-llamarlo es seguro para *añadir* tablas.
- **AC-1.1** (cambios de módulos persisten): cubierto por `setConfig` + re-provisión.
- **AC-1.2** (obligatorios no se quitan): ya garantizado — `toggle()` y `toggleModule()`
  hacen `if (MODULE_MAP[id]?.mandatory) return;` y el `Toggle` va `disabled`.
- **AC-1.3** (terminar sin perder datos): al volver, `router.replace('/panel')` o a la
  consola. Los datos del proyecto en localStorage no se tocan salvo la config editada.
  **Atención a quitar módulos**: hoy quitar un módulo NO borra su tabla en Postgres
  (provision solo añade). Decisión: **quitar módulo = ocultar en UI, conservar datos**
  (no destructivo). Borrado físico de tablas queda **fuera de alcance** y, de hacerse,
  sería acción destructiva con human-in-the-loop.

### 1.4 Riesgo de Suspense
`useSearchParams` exige límite `<Suspense>` en App Router build. Envolver el contenido
del onboarding o marcar la página adecuadamente para no romper el build estático.

---

## 2. UC-2 — Landing por ZIP

### 2.1 Modelo de datos
Extender `TenantConfig` con un bloque opcional `landing` (no rompe configs viejas):
```ts
landing?: {
  enabled: boolean;          // true solo tras subir un ZIP válido
  source: string;            // nombre del zip original (auditoría)
  entry: string;             // ruta del index dentro del bundle (normalmente index.html)
  assetsRef: string;         // id/clave del almacenamiento de assets del proyecto
  uploadedAt: string;
  sha256?: string;           // hash del zip para integridad/dedupe
};
```
Sin este bloque → **no hay landing** → CRM como hoy (**AC-2.4**, no regresión).

### 2.2 Ingesta y validación (servidor, NO en cliente)
**Decisión clave de seguridad**: la validación y extracción del ZIP se hace en un
**route handler server-side** (`runtime = 'nodejs'`), NO en el navegador. El cliente solo
sube el archivo. Nuevo endpoint `POST /api/projects/[id]/landing` (multipart).

Validaciones (todas obligatorias, fallo = rechazo 4xx):
1. **Tamaño total del ZIP** ≤ límite (p. ej. 10 MB) — antes de descomprimir.
2. **Nº de entradas** ≤ límite (p. ej. 500) y **tamaño descomprimido acumulado** ≤ límite
   (p. ej. 50 MB) → defensa **anti zip-bomb** (ratio de compresión vigilado).
3. **Anti path-traversal**: por cada entry, normalizar la ruta y rechazar si:
   - contiene `..`, empieza por `/` o `\`, o es ruta absoluta (Windows `C:\`),
   - tras `path.posix.normalize`, escapa del directorio raíz del bundle.
   jszip da nombres de entry "tal cual" del ZIP — **no confiar**; re-derivar destino con
   `path.join(base, normalized)` y verificar `startsWith(base)`.
4. **Allowlist de extensiones** (AC-2.1): `.html .htm .css .js .mjs .json .svg .png .jpg
   .jpeg .gif .webp .ico .woff .woff2 .ttf .otf .txt .map`. Cualquier otra (`.php .exe
   .sh .bat .dll`, sin extensión, etc.) → **rechazo del ZIP completo** (no silencioso).
5. **Debe existir un `index.html`** en raíz o en una única subcarpeta → define `entry`.
6. Validar que los nombres no contengan bytes nulos ni control chars.

### 2.3 Almacenamiento de assets (abstracción)
Interfaz `LandingStore` (patrón espejo de `supabase/client.ts`: local ahora, Supabase
Storage futuro, sin tocar callers):
```ts
interface LandingStore {
  put(projectId: string, files: {path: string; bytes: Buffer}[]): Promise<{ref: string}>;
  get(projectId: string, path: string): Promise<{bytes: Buffer; mime: string} | null>;
  remove(projectId: string): Promise<void>;
}
```
- **Implementación local (ahora)**: escribir bajo un directorio **fuera de `public/`** y
  fuera del árbol servible directamente — p. ej. `creador_CRM/.landing-store/<projectId>/`.
  Servir SIEMPRE a través del route handler (§2.4), nunca como archivo estático directo.
  Esto permite aplicar cabeceras de seguridad e impide ejecución no controlada.
- **Futuro Supabase Storage**: misma interfaz, bucket por proyecto. Decisión registrable
  en Engram (`arquitectura:landing-store`).
- El `assetsRef` que se guarda en `config.landing` apunta al directorio/bucket, no a rutas
  absolutas del FS (portabilidad).

### 2.4 Servir la landing (`app/(landing)/`)
- Nuevo grupo `front/app/(landing)/` con su **propio `layout.tsx`** que **NO** monta
  `AppShell` ni el chrome del CRM (la landing es del cliente, no nuestra UI).
- Ruta pública `front/app/(landing)/page.tsx` (o `[[...slug]]`) que, para el **proyecto
  activo**, sirve su `index.html` y sus assets vía un route handler
  `GET /api/landing/[projectId]/[...path]` que lee del `LandingStore`.
- **Sanitización del HTML/JS servido (XSS)** — defensa en capas:
  - Cabeceras en TODA respuesta de landing: `Content-Security-Policy` restrictiva
    (sin `unsafe-inline` salvo lo imprescindible; idealmente nonce), `X-Content-Type-Options:
    nosniff`, `X-Frame-Options: DENY`/`frame-ancestors 'none'`,
    `Referrer-Policy: no-referrer`. **Aislar la landing** del origen del CRM tanto como
    se pueda (considerar subruta/cookie-scope; sandbox si se embebe).
  - `Content-Type` correcto y forzado por extensión (no por sniffing).
  - La landing del cliente es **contenido no confiable**: NO debe compartir cookies de
    sesión del CRM ni acceder a su `localStorage`. El "login" (§2.5) es el único puente.
  - Opción reforzada (recomendada para cybersec): sanear el HTML en ingesta
    (strip de `<script>` externos no permitidos / handlers inline) — **decisión a validar
    con `cybersec:*`**, porque puede romper landings legítimas. Default propuesto:
    **no reescribir el HTML del cliente**, aislarlo por CSP + sandbox.
- **AC-2.2**: `index.html` servido + enlace "Acceder" → `/(landing)/login`.

### 2.5 Login → CRM (dependencia)
- `/(landing)/login` **depende de `crm-gestion-usuarios-auth`** (no implementado).
- Diseño desacoplado: la landing enlaza a una ruta `/(landing)/login` que, **si auth existe**,
  delega en el flujo real; **si no existe aún**, muestra un placeholder que redirige a
  `/panel` (modo local actual, sin sesión). Marcar con TODO explícito el punto de unión.
- **AC-2.3** (tras login → panel del proyecto): se completa cuando auth aterrice; este
  change deja el "hueco" y el enrutado, no inventa autenticación.

---

## 3. UC-3 — IA en consonancia (landing → branding)

### 3.1 Extractor (determinista, sin IA, primer pase)
- Parsear el HTML/CSS del bundle ya extraído (server-side) para reunir **señales**:
  colores (`color`, `background`, variables CSS, hex/rgb más frecuentes), `font-family`,
  `border-radius`, sombras, y texto visible (h1/h2/copys) para el **tono**.
- Esto reduce coste IA: se envía un **resumen estructurado**, no el HTML crudo entero.

### 3.2 Propuesta IA (vía agents-agency, con metering)
- **Reusar el pipe existente**: añadir `kind: 'landing-branding'` al map `ENDPOINT` de
  `app/api/ai/generate/route.ts` y un endpoint correspondiente en agents-agency, para que
  el **metering de tokens siga centralizado** (AC-3.4 — coste informado/controlado).
  NO introducir una segunda vía de LLM en el front.
- Prompt (en `lib/ai`): recibe el resumen de §3.1 → devuelve un `DesignTokens` + propuesta
  de terminología/tono, en **JSON estructurado y validado** (rechazar respuesta no conforme).
- Control de coste: límite de tamaño del resumen de entrada, `effort` bajo por defecto,
  y el 402 de agents-agency (sin cupo) se propaga tal cual (ya soportado).

### 3.3 Preview → Aplicar → Deshacer (reversible)
- **AC-3.1** (previsualizar antes de aplicar): UI que muestra la propuesta (`DesignTokens`)
  aplicada en un preview (puede ser el propio CRM con los `--brand-*` en un scope temporal)
  SIN persistir.
- **AC-3.2** (aplicar): persistir en `config.branding` (`primary`, `secondary`, `tokens`,
  `designSource = landing.source`) vía `update({ branding })`. `BrandingStyle` ya consume
  `tokens` → el look se propaga solo.
- **AC-3.3** (deshacer): antes de aplicar, **snapshot** del `branding` previo en estado
  (o en un campo `branding.previous` efímero). "Deshacer" = `update({ branding: snapshot })`.
  Reversible y local; no toca Postgres (branding vive en config).

---

## 4. Plan por fases (con puntos de APROBACIÓN HUMANA)

> Cada fase es un work-unit revisable. No avanzar de fase sin checkpoint.

- **Fase 0 — Aprobación del diseño (HUMAN).** Este documento + revisión `cybersec:*` del
  modelo de amenazas de §7. **Gate obligatorio.**
- **Fase 1 — UC-1 (Editar→onboarding).** Riesgo bajo, sin superficie nueva. Reversible.
  Entrega: routing + modo edición + pre-carga + persistencia. Reviewer + tester.
- **Fase 2 — UC-2 ingesta+almacenamiento (sin servir).** Endpoint de subida, validación,
  `LandingStore` local. **Aquí entra la mayor superficie de seguridad** → revisión
  `cybersec:redteam` (path-traversal, zip-bomb) ANTES de Fase 3. **HUMAN approval.**
- **Fase 3 — UC-2 servir landing `(landing)`.** Solo tras hardening de Fase 2 validado.
  CSP/headers/aislamiento. `cybersec:blueteam` define detecciones/tests. **HUMAN approval.**
- **Fase 4 — UC-2 login hook.** Stub desacoplado; se completa cuando
  `crm-gestion-usuarios-auth` exista. No bloquea Fases 1-3.
- **Fase 5 — UC-3 IA.** Extractor + `kind` nuevo en el proxy + preview/aplicar/deshacer.
  Gasto IA → verificar metering. **HUMAN approval** (gasto económico).

Orden recomendado: 0 → 1 → 2 → 3 → 5 (4 cuando auth aterrice). Fase 1 es independiente y
puede entregarse sola con valor.

---

## 5. Cambios por archivo (mapa de impacto, READ-ONLY hoy)

| Área | Archivo | Cambio |
|---|---|---|
| UC-1 routing | `front/app/(dashboard)/page.tsx` | `editar()` → `/onboarding?projectId=` |
| UC-1 wizard | `front/app/onboarding/page.tsx` | modo edición, pre-carga, finish bifurcado, `<Suspense>` |
| Modelo | `front/lib/config/tenant-config.ts` | añadir `landing?` a `TenantConfig` (+ deserialize tolerante) |
| UC-2 ingesta | `front/app/api/projects/[id]/landing/route.ts` (nuevo) | validación+extracción server-side |
| UC-2 store | `front/lib/landing/store.ts` (nuevo) | interfaz `LandingStore` + impl local |
| UC-2 servir | `front/app/(landing)/{layout,page}.tsx` (nuevo) | grupo de rutas público |
| UC-2 servir | `front/app/api/landing/[projectId]/[...path]/route.ts` (nuevo) | servir assets con headers |
| UC-2 login | `front/app/(landing)/login/page.tsx` (nuevo) | stub acoplado a auth futuro |
| UC-3 extractor | `front/lib/landing/extract-design.ts` (nuevo) | señales paleta/tipo/tono |
| UC-3 IA | `front/app/api/ai/generate/route.ts` | añadir `kind: 'landing-branding'` |
| UC-3 IA | `front/lib/ai/*` + agents-agency | prompt + endpoint con metering |
| UC-3 UI | onboarding (paso Marca) o panel config | preview/aplicar/deshacer |

Toca **2+ dominios** (onboarding, almacenamiento, servir público, IA) y **datos
persistentes** (config + assets) → confirma Nivel 4. Un builder por unidad funcional.

---

## 6. Riesgos y mitigaciones

| Riesgo | Sev | Mitigación |
|---|---|---|
| Path traversal en ZIP | Alta | Normalizar+verificar `startsWith(base)`; rechazar `..`/abs; §2.2 |
| Zip-bomb (DoS descompresión) | Alta | Límite tamaño zip, nº entries, tamaño descomprimido, ratio; §2.2 |
| XSS en landing servida | Alta | CSP estricta, nosniff, aislamiento de origen/cookies; §2.4 |
| Ejecutables/scripts en bundle | Alta | Allowlist de extensiones; rechazo de ZIP completo |
| Pérdida de datos al editar | Media | `structuredClone`, merge de módulos, quitar módulo = no destructivo |
| Quitar módulo borraría tablas | Media | NO borrar tablas (provision solo añade); borrado físico fuera de alcance |
| Coste IA descontrolado | Media | Metering centralizado (agents-agency), resumen acotado, effort bajo, 402 |
| Login sin auth real | Media | Stub desacoplado; depende de `crm-gestion-usuarios-auth` |
| Romper build por `useSearchParams` | Baja | `<Suspense>` boundary |
| Storage local no portable | Baja | Interfaz `LandingStore`; Supabase Storage futuro |

---

## 7. SUPERFICIE DE SEGURIDAD — revisión `cybersec:*` OBLIGATORIA

Dos vectores nuevos de **contenido no confiable controlado por el cliente**:

1. **Ingesta de ZIP arbitrario** → path-traversal, zip-bomb, archivos ejecutables,
   nombres con control chars. Mitigación en §2.2. **`cybersec:redteam-exploit` debe
   intentar romperlo en lab** (PoC reversible) antes de aprobar Fase 2.
2. **Servir HTML/JS del cliente** → XSS, robo de sesión del CRM, clickjacking,
   contaminación de origen. Mitigación en §2.4. **`cybersec:blueteam-hardening`** define
   CSP/headers/aislamiento canónicos y **`cybersec:blueteam-detect`** añade tests de
   regresión (gate CI) que se mantengan verdes.

**Regla**: no se declara ninguna fase de UC-2 como hecha mientras haya un hallazgo OPEN.
Cargar `.claude/skills/cybersec-audit/SKILL.md` y delegar según el contrato
(`cybersec-minion-contract.md`, solo alcance autorizado / lab). Persistir aprendizajes
en Engram (`project:gru-orchestrator:cybersec:*`).

---

## 8. Decisiones arquitectónicas (registrables en Engram tras aprobación)

- `arquitectura:landing-ingesta` — validación+extracción **server-side**, nunca en cliente.
- `arquitectura:landing-store` — interfaz `LandingStore`, impl local fuera de `public/`,
  Supabase Storage como futuro tras la misma interfaz.
- `arquitectura:landing-servido` — grupo `(landing)` sin `AppShell`, assets vía route
  handler con CSP/headers; landing = origen no confiable aislado del CRM.
- `arquitectura:ia-branding` — reusar proxy `api/ai/generate` (+`kind`) para mantener el
  metering centralizado; extractor determinista reduce coste; flujo preview→aplicar→deshacer.
- `arquitectura:onboarding-edicion` — `?projectId=` activa modo edición; quitar módulo es
  no destructivo (conserva tablas).

---

## 9. STATUS

```
STATUS: DONE (diseño)
OUTPUT: design.md del change crm-onboarding-edit-landing-ia
NOTAS:
 - Nivel 4 confirmado por mapa de impacto (multi-dominio + datos persistentes + ZIP/IA).
 - Rutas reales bajo front/ (el proposal omitía el prefijo).
 - DesignTokens/branding.tokens YA existen → el pipe IA→branding está medio cableado.
 - Auth NO existe (change separado); /(landing)/login queda como stub desacoplado.
 - Revisión cybersec:* OBLIGATORIA antes de implementar UC-2 (§7).
 - NO implementar sin aprobación humana (Fase 0).
```
