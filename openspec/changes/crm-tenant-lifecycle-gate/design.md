# Diseño técnico — crm-tenant-lifecycle-gate

## 1. Modelo de datos (Prisma, schema `crm`, aditivo)

### 1.1 Enum + campos en `Business`
```prisma
enum TenantLifecycle { ACTIVE GRACE SUSPENDED TERMINATED }

// dentro de model Business
lifecycle    TenantLifecycle @default(ACTIVE) @map("ciclo_vida")
graceUntil   DateTime?       @map("gracia_hasta")   // fin del periodo de gracia
suspendedAt  DateTime?       @map("suspendido_en")
stateEvents  TenantStateEvent[]
```
> `default(ACTIVE)` → los negocios existentes migran sin cortarse y **los nuevos nacen
> operativos** (auto-encendido al exportar, sin paso manual). `graceUntil` solo tiene
> sentido en estado `GRACE`. `suspendedAt` marca cuándo se cortó (auditoría rápida).
> Ningún campo aquí modela borrado: `TERMINATED` es acceso cortado, no destrucción.

### 1.2 TenantStateEvent (`tenant_state_event`) — auditoría, inmutable
```prisma
model TenantStateEvent {
  id         String          @id @default(cuid())
  businessId String          @map("negocio_id")
  business   Business        @relation(fields: [businessId], references: [id], onDelete: Cascade)
  fromState  TenantLifecycle @map("estado_origen")
  toState    TenantLifecycle @map("estado_destino")
  reason     String?         @map("motivo")
  actor      String          @map("actor")        // "operator" | "system:grace-expiry" | ...
  createdAt  DateTime        @default(now()) @map("creado_en")
  @@index([businessId, createdAt])
  @@map("tenant_state_event")
}
```
Sin `updatedAt`/`eliminadoEn`: histórico inmutable (mismo criterio que `CustomerNote`).

## 2. Estados y transiciones (server-authoritative, todas reversibles)
No hay máquina de estados con transiciones ilegales. El operador **fija el estado destino
directamente**; cualquiera de los 4 estados puede llevar a cualquier otro, incluido
`TERMINATED → ACTIVE`:
```
ACTIVE  ↔  GRACE  ↔  SUSPENDED  ↔  TERMINATED
(cualquier estado → cualquier estado; sin 409 por transición)
```
Efectos secundarios de fijar un estado (side-effects, no restricciones):
- **→ `GRACE`**: requiere `graceUntil` (fecha futura) en el payload. Si falta o es pasada →
  **400** (validación de payload, NO transición ilegal).
- **→ `SUSPENDED`**: fija `suspendedAt = now()`.
- **→ `TERMINATED`**: solo cambia el estado. **No toca datos.** No dispara ninguna purga.
- **→ `ACTIVE`** (desde cualquiera, incluido `TERMINATED`): limpia `graceUntil`/`suspendedAt`.
  El servicio se restaura al instante porque los datos nunca se fueron. Reactivar desde
  `TERMINATED` es un caso soportado de primera clase.

> No existe estado terminal. `TERMINATED` es reversible como cualquier otro. El único código
> de error de escritura es **400** por payload inválido (estado desconocido, `GRACE` sin
> `graceUntil` futuro). **No hay 409.**

## 3. Resolución de estado + caché
```
back/src/lib/tenant-lifecycle/resolver.ts
  → resolveTenantState(businessId): { effective, graceUntil? }
```
Lógica:
1. Cache in-process `Map<businessId, { state, graceUntil, expiresAt }>` con TTL 30–60s.
2. Miss → `findUnique(Business)`; guarda en caché.
3. **Evaluación perezosa de GRACE:** si `state===GRACE && now>graceUntil` → `effective =
   SUSPENDED` (sin escribir BD; el operador formaliza cuando quiera).
4. `invalidate(businessId)` → borra la entrada; lo llama `PUT lifecycle` en cada transición
   para que el corte/reactivación sea inmediato tras el TTL residual del proceso.

> El cache es por proceso. En multi-instancia cada proceso invalida el suyo; el TTL corto
> acota la ventana. (Coherente con la memoria "drainer lock multi-instancia": nada de estado
> global de seguridad dura fuera de BD.)

## 4. Middleware `tenantGate`
```
back/src/middleware/tenant-gate.ts
  → export function tenantGate()
```
Requiere que la identidad del negocio ya esté resuelta (por `resolveTenantApiKey` en el
carril tenant-facing, o por la sesión en el panel). Flujo:
1. Obtiene `businessId` de `req` (`tenantBusinessId` o `businessId` de sesión).
2. `state = resolveTenantState(businessId)` (efectivo, con GRACE perezoso).
3. Decisión:
   - `ACTIVE` → `next()`.
   - `GRACE` → `next()` + header `x-tenant-grace-until: <ISO>`.
   - `SUSPENDED` (o GRACE expirado) → `423 { error: { code: 'tenant_suspended' } }`.
   - `TERMINATED` → `410 { error: { code: 'tenant_terminated' } }`.

**No se monta en** `/service/operator` (el operador debe poder reactivar) ni en las rutas
exentas de §5.

## 5. Login y exenciones
- El login pasa por `tenantGate` **después** de identificar el negocio del usuario: un
  usuario de un negocio suspendido recibe 423 y no obtiene sesión ("no entrar a mirar").
- Exentos del gate:
  - `GET /tenant-status` → devuelve `{ lifecycle, graceUntil? }` para que el front sepa por
    qué bloquea (no filtra datos del negocio, solo el estado).
  - Asset(s) de la pantalla de bloqueo (estáticos del front / branding público).

## 6. Endpoints de operador (auth `requireOperatorToken`)
| Ruta | Método | Notas |
|---|---|---|
| `/service/operator/businesses/:id/lifecycle` | PUT | `{ state, reason, graceUntil? }`. Fija el estado destino directamente (cualquiera de los 4, sin 409). Valida payload (estado desconocido / `GRACE` sin `graceUntil` futuro → 400), aplica side-effects (§2), escribe `Business`, inserta `TenantStateEvent`, `invalidate(id)`. **Nunca borra datos.** |
| `/service/operator/businesses/:id/state-events` | GET | Lista eventos (from,to,reason,actor,createdAt) desc. |
| `/license/heartbeat` | POST | Firmado (HMAC/token). Para formas binario/offline: el binario reporta y el back responde el estado firmado. Documentado como **disuasión**, no garantía (ver matriz de palanca). |

## 7. Purga de datos (acción SEPARADA — NO es parte del kill switch)
La destrucción de datos es una operación **distinta, explícita e irreversible**, deliberadamente
**desacoplada** del switch y del estado `TERMINATED`:
```
back/src/routes/service-operator.ts
  → POST /service/operator/businesses/:id/purge   // acción aislada, no ligada a lifecycle
```
Guard fuerte (obligatorio):
- **Doble confirmación:** el payload debe incluir un token de confirmación explícito (p. ej.
  el `id` o el nombre exacto del negocio repetido) + flag `confirm: true`. Sin esto → 400.
- **Irreversible y documentado como tal:** hace hard-delete real (cascade). No hay undo.
- **No lo dispara ningún cambio de `lifecycle`:** poner un negocio en `TERMINATED` (o
  cualquier estado) jamás llama a este endpoint. Un `TERMINATED` conserva datos indefinidamente.
- **Auditado aparte** (evento propio o log de operador), no como `TenantStateEvent`.

> **Decisión de alcance:** la purga se documenta aquí y se lista como **WU aislada opcional y
> diferible** (`tasks.md` §WU6), fuera del camino crítico del kill switch. Se mantiene como WU
> tracked —en vez de borrarla del change— precisamente para dejar la separación por escrito y
> evitar que alguien la recable a `TERMINATED` en el futuro. Puede implementarse después o en
> otro change sin bloquear el switch.

## 8. Front CRM (Next.js, `front/`)

### 8.1 Bloqueo del tenant (interceptor 423/410)
```
front/lib/api/fetcher.ts (o interceptor equivalente)
  → ante respuesta 423 global → set estado bloqueado → render pantalla de bloqueo
front/app/(bloqueo)/tenant-suspended/page.tsx  → pantalla full-screen
front/components/tenant/blocked-screen.tsx     → UI (marca, motivo desde /tenant-status)
```
- El interceptor detecta `status===423` en cualquier llamada y monta la pantalla de bloqueo
  full-screen (sin dejar operar el panel por debajo).
- La pantalla consulta `GET /tenant-status` (exento) para mostrar estado/gracia.
- 410 (`TERMINATED`) → variante "cuenta cerrada".

### 8.2 UI de operador en operaOS (palanca del kill switch)
```
front/app/(operador)/negocios/[id]/lifecycle-control.tsx  → switch + selector
front/lib/api/operator.ts                                 → llama a PUT lifecycle / GET state-events
```
- **Switch verde/rojo:** alterna `ACTIVE ↔ SUSPENDED` con un solo gesto (verde = `ACTIVE`,
  rojo = `SUSPENDED`). Efecto inmediato tras `PUT lifecycle` + invalidación de caché.
- **Selector de estado:** para fijar `GRACE` (pide `graceUntil`) o `TERMINATED`.
- Sin lógica de negocio en el front: solo dispara `PUT .../lifecycle` con el estado destino y
  refleja el estado actual (y el histórico vía `GET .../state-events`).
- Autenticado como operador (`requireOperatorToken` / sesión de operador). Estas vistas viven
  bajo el carril de operador y NO las gatea `tenantGate`.

## 9. Data flow
```
Request tenant ─▶ resolveTenantApiKey / sesión ─▶ tenantGate
   resolveTenantState(businessId) [cache 30-60s, GRACE perezoso]
     ACTIVE      → next()
     GRACE       → next() + x-tenant-grace-until
     SUSPENDED   → 423 tenant_suspended
     TERMINATED  → 410 tenant_terminated

Operador (operaOS switch/selector) ─x-service-token─▶ PUT lifecycle {state,reason,graceUntil?}
   valida payload → update Business (side-effects) → insert TenantStateEvent → invalidate(cache)
   (jamás purga datos)

Purga (acción aparte) ─x-service-token─▶ POST .../purge {confirm, echo}
   valida doble confirmación → hard-delete cascade (irreversible)   // NO ligada a lifecycle
```

## 10. Archivos afectados (rutas reales)
- `back/prisma/schema.prisma` — enum `TenantLifecycle`, campos en `Business`, modelo
  `TenantStateEvent`.
- `back/prisma/migrations/<ts>_tenant_lifecycle/migration.sql` — Migración aditiva.
- `back/src/lib/tenant-lifecycle/resolver.ts` — estado efectivo + caché.
- `back/src/lib/tenant-lifecycle/transitions.ts` — side-effects + validación de payload (sin 409).
- `back/src/middleware/tenant-gate.ts` — `tenantGate`.
- `back/src/routes/index.ts` — monta `tenantGate` en carriles tenant/panel, NO en
  `/service/operator` ni rutas exentas.
- `back/src/routes/tenant-status.ts` — `GET /tenant-status` (exento).
- `back/src/routes/service-operator.ts` — `PUT lifecycle`, `GET state-events`,
  `POST /license/heartbeat`, y (WU aislada) `POST .../purge`.
- `front/lib/api/fetcher.ts` — interceptor 423/410.
- `front/app/(bloqueo)/tenant-suspended/page.tsx` + `front/components/tenant/blocked-screen.tsx`.
- `front/app/(operador)/negocios/[id]/lifecycle-control.tsx` + `front/lib/api/operator.ts` —
  switch verde/rojo + selector.

## 11. Test strategy
- Back node:test:
  - `tenant-lifecycle.transitions.test.ts`: cualquier estado → cualquier estado aplica
    (incluido `TERMINATED → ACTIVE`); side-effects correctos; `GRACE` sin `graceUntil` → 400;
    estado desconocido → 400. **No 409.**
  - `tenant-terminated-no-purge.test.ts`: pasar a `TERMINATED` y volver a `ACTIVE` conserva
    todos los datos del negocio (reactivación sin pérdida).
  - `tenant-gate.test.ts`: ACTIVE pasa; GRACE pasa + header; GRACE expirado → 423;
    SUSPENDED → 423; TERMINATED → 410; `/service/operator` exento.
  - `tenant-gate.cache.test.ts`: `PUT lifecycle` invalida caché (siguiente request corta/reactiva).
  - `login-gate.test.ts`: usuario de negocio suspendido → 423, sin sesión.
  - (WU aislada) `purge.guard.test.ts`: sin doble confirmación → 400; con ella → hard-delete;
    ningún `PUT lifecycle` invoca la purga.
- Front:
  - unit interceptor: 423 monta blocked-screen; 410 variante cerrada.
  - unit UI operador: switch verde→`ACTIVE`, rojo→`SUSPENDED`; selector fija `GRACE`/`TERMINATED`
    llamando a `PUT lifecycle` con el estado destino.

## 12. Migración
`back/prisma/migrations/<ts>_tenant_lifecycle/migration.sql`: `CREATE TYPE tenant_lifecycle`,
`ALTER TABLE negocio ADD COLUMN ciclo_vida DEFAULT 'ACTIVE'`, `gracia_hasta`, `suspendido_en`
(nullable), `CREATE TABLE tenant_state_event` + índice + FK. **Sin DROP.** La aplica el usuario
(`--no-engine` si EPERM; `prisma migrate status` sin drift).
