# Tareas — crm-tenant-lifecycle-gate

Nivel 3 (mueve estado de negocio; migración + middleware global + endpoints + UI + pantalla
de bloqueo). Depende de `crm-tenant-api-keys` (identidad de negocio en el carril
tenant-facing). Orden = modelo → resolver/gate → operador → login → front (bloqueo + UI
operador). Todas las transiciones son reversibles (sin 409). El switch NUNCA borra datos.
Agentic Runtime gate + aprobación humana antes de cualquier push.

## WU1 — Modelo + transiciones (back/DB)
- [x] 1.1 Enum `TenantLifecycle` + campos `lifecycle/graceUntil/suspendedAt` en `Business` + modelo `TenantStateEvent` (`schema.prisma`).
- [x] 1.2 Migración `20260710150000_tenant_lifecycle/migration.sql` (default ACTIVE, sin DROP). ✅ APLICADA a prod Supabase 10/07 (`migrate deploy`; `migrate status` up-to-date, sin drift).
- [x] 1.3 Transiciones + side-effects en `lib/tenant-lifecycle/transitions.ts`: fijar cualquier estado destino (incluido `TERMINATED → ACTIVE`); `→GRACE` exige `graceUntil` futuro (400 si falta); `→SUSPENDED` fija `suspendedAt`; `→ACTIVE` limpia campos. Sin 409, sin purga.
- [x] 1.4 Test `tenant-lifecycle.transitions.test.ts` (cualquier→cualquier aplica; payload inválido → 400; nunca 409).

## WU2 — Resolver + gate (back)
- [x] 2.1 `back/src/lib/tenant-lifecycle/resolver.ts` (estado efectivo, caché 30-60s, GRACE perezoso, `invalidate`).
- [x] 2.2 `back/src/middleware/tenant-gate.ts` (`tenantGate`). ⚠️ MONTAJE en carriles tenant/panel diferido a WU3 (junto al login gate): montar antes de aplicar la migración rompería todas las rutas gateadas (columna `ciclo_vida` inexistente).
- [x] 2.3 `back/src/routes/tenant-status.ts` (`GET /tenant-status`, exento). Montaje también en WU3.
- [x] 2.4 Tests `tenant-gate.test.ts` (estados + no-op sin identidad) + `tenant-gate.cache.test.ts` (TTL + invalidate + GRACE perezoso). Unit con BD doble (DI) — pasan sin migración aplicada. Exención operador se testea al montar (WU3).

## WU2.5 — Carriles público + calendar gateados (hallazgo de sdd-verify)
> `/api/public` (leads/bookings/availability) y `/calendar` estaban montados ANTES del gate
> de panel: un negocio suspendido seguía aceptando reservas/leads y sirviendo ICS. Decisión
> del usuario: "cortar los dos". Ambos carriles son NO autenticados → cada uno resuelve el
> negocio a su manera ANTES del gate.
- [x] 2.5.1 `routes/public/index.ts`: `publicTenantResolver` (businessId del body en POST leads/bookings, de la query en GET availability; solo valores con forma cuid — malformado NO se fija y el handler conserva su 422) + `tenantGate()` montados tras el rate-limit y antes de los sub-routers. Cuid inexistente → fail-closed de WU2 (410).
- [x] 2.5.2 `routes/calendar.ts`: `feedTenantResolver` (token → dueño vía `resolveTokenOwner`, una sola búsqueda; dueño → negocio vía `Employee.userId` @unique con respaldo `Membership`) + `tenantGate()` en `GET /feed/:token.ics`; 404 opaco (AC2) intacto. Autoservicio (`/status`, `/token` POST/DELETE, `/preferences`) monta el gate tras `authenticate` (estaban fuera del gate global de panel).
- [x] 2.5.3 Tests `tenant-gate.public.test.ts` (9) + `tenant-gate.calendar.test.ts` (8): wiring + ACTIVE pasa / SUSPENDED 423 / TERMINATED 410 / resolución del businessId por forma real de request. Unit con dobles DI, sin migración. Regresión lifecycle+calendar 135/135 verde; `tsc` limpio.

## WU3 — Login + endpoints de operador
- [x] 3.1 Login gateado tras identificar negocio (423 sin sesión si no ACTIVE/GRACE). Test `login-gate.test.ts`. Nota: el login de credenciales vive en el SDK Supabase (POST /auth/login es stub 410); el punto server-authoritative gateado es `GET /auth/me` (bootstrap de sesión) → `authenticate` → `loginTenantGate` → handler. Montaje del gate incluido aquí: carril panel (`routes/index.ts`, tras `authenticate`, con `/tenant-status` exento ANTES del gate) + carril tenant-facing (`tenant-config.ts`, tras `resolveTenantConfigAuth`). ⚠️ Migración sigue PENDIENTE (Z.3): no arrancar el back contra la BD hasta aplicarla.
- [x] 3.2 `PUT /service/operator/businesses/:id/lifecycle` (fija estado destino + evento + invalidate; sin 409; jamás purga) + `GET .../state-events`. Test `lifecycle.operator.test.ts`. (`service-operator-lifecycle.ts`, montado en `service-operator.ts` bajo `requireOperatorToken`, exento del gate.)
- [x] 3.3 `POST /license/heartbeat` firmado (HMAC/token). Test `heartbeat.test.ts`. (`routes/license.ts`, montado en `server.ts` fuera de `/api`; secreto `LICENSE_HEARTBEAT_SECRET` opcional fail-closed → 503 si no está; documentado como disuasión, no garantía.)
- [x] 3.4 Test `tenant-terminated-no-purge.test.ts`: `TERMINATED` conserva datos; volver a `ACTIVE` restaura sin pérdida.

## WU4 — Front bloqueo (Next.js)
- [x] 4.1 Interceptor global 423/410 en `front/lib/api/client.ts` (wrapper central real; no existe `fetcher.ts`). Discrimina por `error.code` del body: 423 `tenant_suspended` / 410 `tenant_terminated` fijan estado global; 410 `login_moved`/`use_sdk` NO bloquean. Store de módulo `lib/tenant/blocked-state.ts` + puente React `components/tenant/tenant-block-overlay.tsx` montado en root layout (espejo de DialogProvider).
- [x] 4.2 Pantalla de bloqueo full-screen (`app/(bloqueo)/tenant-suspended/page.tsx` + `components/tenant/blocked-screen.tsx`), consulta `GET /api/tenant-status` vía `lib/api/tenant-status.ts` (Bearer + x-business-id, exento); 410 → variante "cuenta cerrada". Overlay `fixed inset-0 z-[9999]` → panel de debajo no operable.
- [x] 4.3 Test front unit del interceptor `tests/tenant-blocked-interceptor.test.ts` (423 → suspended; 410 tenant_terminated → terminated; 410 login_moved → NO bloquea). 3/3 verde.

## WU5 — UI de operador en operaOS (palanca del switch)
- [x] 5.1 `front/lib/api/operator.ts`: cliente que llama a `PUT .../lifecycle` y `GET .../state-events` (auth operador). Llama al proxy same-origin de Next (`/api/operator/**`), NO al back directo: el service token nunca llega al browser. Proxies: `front/app/api/operator/businesses/[id]/lifecycle/route.ts` (PUT) + `.../state-events/route.ts` (GET), ambos `force-dynamic`/`nodejs`, validan operador (`isAuthedOperator`, Bearer Supabase) e inyectan `x-service-token` vía `front/lib/server/crm-back.ts` (`OPERATOR_SERVICE_TOKEN`).
- [x] 5.2 `front/app/(operador)/negocios/[id]/lifecycle-control.tsx`: switch verde/rojo (`ACTIVE ↔ SUSPENDED`) + selector para `GRACE` (pide `graceUntil`) / `TERMINATED` / `ACTIVE`; refleja estado actual (derivado del último evento) + histórico. Página `page.tsx` (client, `useParams`) que monta el control.
- [x] 5.3 Test front unit `tests/lifecycle-control.test.tsx`: switch verde→`ACTIVE`, rojo→`SUSPENDED`; selector fija `GRACE`(+`graceUntil`)/`TERMINATED` llamando a `setBusinessLifecycle` con el estado destino. 4/4 verde (vitest).

## WU6 — Purga de datos (AISLADA, opcional, diferible — NO parte del kill switch)
> Acción separada, irreversible, desacoplada del switch y de `TERMINATED`. Puede diferirse a
> otro change sin bloquear el kill switch. Se lista para dejar la separación por escrito.
- [x] 6.1 `POST /service/operator/businesses/:id/purge` con doble confirmación (echo id/nombre exacto + `confirm:true`; falta/mismatch → 400 sin tocar BD; 404 si no existe) → hard-delete en UNA `$transaction` con borrado explícito hijos→padres (41 deleteMany + delete negocio): 3 FKs internas son ON DELETE RESTRICT (reserva→sucursal/servicio, paquete_cliente→paquete) y hacen inseguro el cascade único. `service-operator-purge.ts` con interfaz DI propia `PurgeDb` (la ÚNICA del carril operador con deletes; lifecycle sigue sin ellos). Auditado aparte (log de operador, no TenantStateEvent). Responde 200 con conteos por tabla. NO se borran usuario/token_calendario/AuthToken (nivel usuario) ni aa.* (nivel cliente). ⚠️ Implementado pero DESTRUCTIVO: cada ejecución real requiere decisión humana explícita (doble confirmación por diseño); sin UI front en esta WU.
- [x] 6.2 Test `purge.guard.test.ts` (12): sin/mala doble confirmación → 400 y CERO borrados; con ella → borra en orden hijos→padres (negocio último, RESTRICT verificados); router de purga solo registra POST .../purge; router lifecycle sin rutas purge; PUT lifecycle→TERMINATED con trampas delete armadas no invoca ningún borrado. DI-mock, sin BD real.

## Cierre
- [x] Z.1 back + front suite verde + `tsc` limpio. (back 822/822, front 7/7 tests del change, tsc back+front exit 0.)
- [x] Z.2 Agentic Runtime review + aprobación humana (mueve estado de negocio). (sdd-verify PASS-WITH-NOTES; hallazgos resueltos; usuario aprobó merge+push+deploy.)
- [x] Z.3 Migración APLICADA a Supabase + `prisma migrate status` sin drift. (10/07, up-to-date.)
- [ ] Z.4 Engram persistido + ESTRUCTURA.md actualizado. (Engram ✅ obs #852–854 + session summary; ESTRUCTURA.md PENDIENTE.)

## Verificaciones finales
- [x] Apagar un negocio (switch rojo → `SUSPENDED`) corta login y rutas tenant en ≤ TTL; el operador nunca se auto-bloquea. (tenant-gate.test.ts + exención `/service/operator` estructural; smoke live confirmado por usuario.)
- [x] Reactivar desde `TERMINATED` restaura el servicio con todos los datos intactos. (tenant-terminated-no-purge.test.ts verde.)
- [x] El operador puede fijar cualquiera de los 4 estados sin transiciones ilegales (sin 409). (transitions.test.ts: any→any, nunca 409.)
- [x] Ningún cambio de `lifecycle` ejecuta borrado de datos (verificado por test). (interfaz DB sin métodos delete + test.)
- [x] Toda transición deja `TenantStateEvent`. (PUT lifecycle inserta evento en `$transaction`; lifecycle.operator.test.ts.)
- [x] Matriz de palanca revisada con el usuario (alquiler solo formas hosteado/self-host; T3 self-host completo solo disuasión). (Revisada; decisión "cortar public+calendar" tomada → WU2.5.)
