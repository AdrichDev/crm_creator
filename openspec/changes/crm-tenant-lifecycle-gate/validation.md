# Validación — crm-tenant-lifecycle-gate

Historia: como **operador de la plataforma (3A)** quiero apagar/encender el CRM de un
negocio desde el servidor (switch verde/rojo + gracia/terminado) y que el corte sea
inmediato, auditable e ineludible desde el lado del cliente, para cubrirme ante impago del
alquiler de servicios; y quiero poder **reactivarlo sin pérdida de datos** cuando regularice,
porque apagar no es borrar.

## Criterios de aceptación (AC)
- **AC1 (ACTIVE pasa):** un negocio `ACTIVE` opera con normalidad.
- **AC2 (GRACE pasa con aviso):** un negocio `GRACE` con `graceUntil` futuro pasa y las
  respuestas llevan header `x-tenant-grace-until`.
- **AC3 (GRACE expirado):** si `now > graceUntil`, el gate lo trata como `SUSPENDED` (423)
  sin necesidad de escribir el estado (evaluación perezosa).
- **AC4 (SUSPENDED corta):** un negocio `SUSPENDED` recibe 423 `tenant_suspended` en rutas
  tenant/panel, incluido el login (no se entra "a mirar").
- **AC5 (TERMINATED):** un negocio `TERMINATED` recibe 410 `tenant_terminated` y **conserva
  todos sus datos**.
- **AC6 (exenciones):** `GET /tenant-status` y el asset de bloqueo responden siempre; las
  rutas `/service/operator` nunca las corta el gate (el operador puede reactivar).
- **AC7 (todas las transiciones reversibles):** el operador puede fijar cualquiera de los 4
  estados en cualquier momento, **incluido `TERMINATED → ACTIVE`**. No hay transiciones
  ilegales ni respuesta 409; solo 400 por payload inválido (`GRACE` sin `graceUntil` futuro,
  estado desconocido).
- **AC8 (reactivar sin pérdida):** volver a `ACTIVE` desde `SUSPENDED` o `TERMINATED`
  restaura el servicio con todos los datos intactos (limpia `graceUntil`/`suspendedAt`).
- **AC9 (switch nunca borra):** ningún cambio de `lifecycle` ejecuta borrado de datos; la
  purga es una acción separada con doble confirmación, no ligada al switch ni a `TERMINATED`.
- **AC10 (auditoría):** cada transición inserta una fila en `TenantStateEvent`
  (from, to, reason, actor).
- **AC11 (invalidación de caché):** tras `PUT lifecycle`, el corte/reactivación se refleja
  sin esperar al TTL completo (se invalida la entrada del negocio).
- **AC12 (front bloqueo):** ante un 423 global, el front muestra pantalla de bloqueo
  full-screen; ante 410, variante de cuenta cerrada.
- **AC13 (UI operador):** el switch verde/rojo fija `ACTIVE`/`SUSPENDED` y el selector fija
  `GRACE`/`TERMINATED`, llamando a `PUT lifecycle` con el estado destino.
- **AC14 (auto-encendido / no regresión):** al migrar y al crear negocios nuevos, todos
  quedan `ACTIVE` (default) y operan sin acción manual; exportar entrega una app operativa
  sin paso extra; back+front tests verde, `tsc` limpio, `prisma migrate status` sin drift.

## Por tarea (Given-When-Then + test)
- **WU1.2** Migración → Given migración aplicada, When `prisma migrate status`, Then sin
  drift, `negocio.ciclo_vida` default ACTIVE + `tenant_state_event` existe. Test: schema +
  migrate status.
- **WU1.3** Transiciones → Given estado X, When se fija estado destino Y (cualquiera de los
  4), Then aplica con sus side-effects; `→GRACE` sin `graceUntil` futuro → 400; estado
  desconocido → 400; nunca 409. Test: `tenant-lifecycle.transitions.test.ts`.
- **WU2.1/2.2** Gate estados → Given negocio en cada estado, When request, Then ACTIVE next /
  GRACE header / GRACE-expirado 423 / SUSPENDED 423 / TERMINATED 410. Test: `tenant-gate.test.ts`.
- **WU2.2** Exención operador → Given negocio suspendido, When request a `/service/operator`,
  Then pasa (no 423). Test: `tenant-gate.test.ts` (caso exención).
- **WU2.4** Caché → Given negocio ACTIVE cacheado, When `PUT lifecycle SUSPENDED`, Then la
  siguiente request corta. Test: `tenant-gate.cache.test.ts`.
- **WU3.1** Login gateado → Given usuario de negocio suspendido, When login, Then 423 y sin
  sesión. Test: `login-gate.test.ts`.
- **WU3.2** Endpoints operador → Given operador, When `PUT lifecycle` (cualquier estado,
  incluido `TERMINATED→ACTIVE`) + `GET state-events`, Then estado cambia + evento listado;
  payload inválido → 400 (nunca 409). Test: `lifecycle.operator.test.ts`.
- **WU3.3** Heartbeat → Given token/HMAC válido, When `POST /license/heartbeat`, Then
  responde estado firmado; firma inválida → 401. Test: `heartbeat.test.ts`.
- **WU3.4** TERMINATED sin purga → Given negocio con datos en `TERMINATED`, When se reactiva a
  `ACTIVE`, Then todos los datos siguen ahí. Test: `tenant-terminated-no-purge.test.ts`.
- **WU4** Front bloqueo → Given respuesta 423, When interceptor, Then blocked-screen
  full-screen; 410 → variante cerrada. Test: front unit interceptor.
- **WU5** UI operador → Given la consola de operador, When se acciona el switch (verde/rojo) o
  el selector, Then llama a `PUT lifecycle` con el estado destino correcto. Test: front unit
  UI operador.
- **WU6 (aislada, diferible)** Purga → Given operador, When `POST .../purge` sin doble
  confirmación, Then 400; con doble confirmación, Then hard-delete; ningún `PUT lifecycle`
  invoca la purga. Test: `purge.guard.test.ts`.

> Regla del repo: una tarea está DONE solo cuando su test está verde. Sin spec → no code.

## Estado
PROPUESTA — sin iniciar. Nivel 3 (mueve estado de negocio; migración + gate global + UI).
Migración pendiente de aplicar por el usuario. WU6 (purga) es aislada, opcional y diferible:
no bloquea el kill switch y puede moverse a otro change. La matriz de palanca del proposal
debe revisarse con el usuario antes de comprometer alcance de "apps alquiladas".
