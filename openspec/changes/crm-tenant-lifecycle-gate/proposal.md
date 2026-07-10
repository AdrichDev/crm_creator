# crm-tenant-lifecycle-gate

## Intención
Dar a la plataforma un **kill switch server-authoritative** por negocio: un ciclo de vida
(`ACTIVE` / `GRACE` / `SUSPENDED` / `TERMINATED`) que el operador (3A) controla y que el
back aplica en cada request. Si un negocio deja de pagar el alquiler de servicios o hay que
cortarlo, el operador lo apaga y el CRM de ese tenant deja de funcionar de forma inmediata y
auditable, sin que el cliente pueda evitarlo desde su lado. Cuando el cliente regulariza, el
operador lo reactiva y **todo vuelve tal cual estaba** (el corte nunca borra datos).

## Problema
Hoy no hay forma de **apagar** un negocio. `Business` tiene `eliminadoEn` (soft-delete,
pensado para hard-delete en prod), pero:
- No hay estado intermedio (impago con periodo de gracia) ni distinción entre "suspendido
  temporal" y "terminado".
- No hay un punto único donde el back deniegue servicio a un negocio cortado.
- No hay traza de quién cortó qué y por qué.
- El login deja entrar "a mirar" aunque el negocio no deba operar.

Sin kill switch, la única palanca es borrar datos (irreversible) o confiar en que el
cliente pare — inaceptable para apps alquiladas.

## Alcance
- **A. Estado en `Business`:** `lifecycle` (enum, default `ACTIVE`), `graceUntil?`,
  `suspendedAt?`.
- **B. Auditoría `TenantStateEvent`:** una fila por transición (from→to, motivo, actor).
- **C. Middleware `tenantGate` server-authoritative:** evalúa el estado (con caché
  in-process corta que se invalida en cada transición) y decide pasar/cortar. Nada que
  venga del cliente influye en la decisión.
- **D. Login también gateado:** un negocio no `ACTIVE`/`GRACE` no deja entrar; exentos
  solo `GET /tenant-status` y el asset de la pantalla de bloqueo.
- **E. Front CRM (Next.js, `front/`) — bloqueo:** interceptor global que ante 423 muestra
  una **pantalla de bloqueo full-screen**; 410 → variante "cuenta cerrada".
- **F. Endpoints de operador:** fijar estado (`PUT .../lifecycle`), listar eventos
  (`GET .../state-events`), y `POST /license/heartbeat` firmado para formas de
  distribución binario/offline.
- **G. UI de operador en operaOS (`front/`):** un **switch verde/rojo** que alterna
  `ACTIVE ↔ SUSPENDED` al instante, más un selector para fijar `GRACE`/`TERMINATED`. Llama
  a los endpoints de operador (§F). Es la palanca visual del kill switch.

## Estados y mapeo a UI
| Estado | Semántica | UI operador | Efecto en el tenant |
|---|---|---|---|
| `ACTIVE` | Operativo | Switch **verde** | Servicio normal. |
| `GRACE` | Impago con periodo de gracia (`graceUntil`) | Selector | Pasa, pero avisa (header `x-tenant-grace-until`). |
| `SUSPENDED` | Apagado temporal | Switch **rojo** | **423 Locked** en todo (incluido login). |
| `TERMINATED` | Cerrado | Selector | **410 Gone**. Datos intactos; reactivable. |

## Auto-encendido al exportar
Los negocios nacen `ACTIVE` (la migración fija `lifecycle` con default `ACTIVE`). Por tanto
**exportar/entregar una app = queda operativa sin ninguna acción manual**: no hace falta un
paso extra en el exportador ni en la entrega. El switch solo sirve para **apagar** y
**reactivar** después; el estado por defecto ya cubre "activo en producción con
independencia de la plataforma de entrega".

## Apagar/terminar vs. borrar datos (separación dura)
Este change modela **solo estado y acceso**. Se distinguen dos operaciones que NUNCA se
mezclan:
- **Apagar / terminar (este change):** cambia `lifecycle` (`SUSPENDED`/`TERMINATED`).
  **Reversible**, **solo estado**, **jamás purga datos**. Reactivar es instantáneo porque
  los datos siguen ahí.
- **Borrar datos (hard delete):** acción **separada, explícita, irreversible**, con doble
  confirmación, **no ligada al switch ni a `TERMINATED`**. Un negocio `TERMINATED` conserva
  todos sus datos indefinidamente hasta que alguien ejecute la purga como acción aparte.

`TERMINATED` es un estado de **acceso cortado**, no de destrucción. Reactivar desde
`TERMINATED` es un caso soportado de primera clase. La purga queda como acción manual con
guard fuerte (ver `design.md` §7 y WU aislada en `tasks.md`), fuera del camino crítico del
kill switch.

## Matriz de palanca (honestidad de alcance)
El kill switch es tan efectivo como el control que la plataforma tenga sobre dónde corre el
código. **HOY todos los tenants dependen del back del operador** (el back está acoplado a la
Supabase Auth del operador), así que el gate es total. Se documenta explícitamente el límite:

| Forma de entrega | Efectividad del kill switch |
|---|---|
| **Hosteado por el operador** (back y datos en nuestra infra) | **Control total.** El gate corre en nuestro servidor; el cliente no puede eludirlo. |
| **Self-host contra nuestro back** (front del cliente, API nuestra) | **Efectivo.** Todo pasa por `tenantGate`; apagar el negocio corta el servicio. |
| **T3 self-host completo / binario offline** (back y datos en infra del cliente) | **Solo disuasión.** El día que un cliente tenga su propio back, el gate correría en SU infra y el switch ya no puede apagarlo. El `POST /license/heartbeat` firmado permite detectar/expirar, pero el cliente puede borrar el check. No es una garantía técnica. |

**Regla de producto:** las apps **ALQUILADAS** se entregan solo en las formas *hosteado* o
*self-host contra el back*. El T3 self-host completo / binario offline queda como escenario
documentado, no como modo de alquiler con kill switch garantizado. No se vende un switch
"infalible" sobre código que ya no controlamos.

## Fuera de alcance
- Facturación/cobros que disparen las transiciones (lo dispara el operador o un job
  externo; aquí solo se modela el estado y la palanca).
- **Borrado de datos:** la purga (hard delete) es acción separada con su propio guard; este
  change solo garantiza que el switch NUNCA la ejecuta. Se deja como WU aislada opcional,
  diferible, fuera del kill switch.
- Firma criptográfica avanzada del heartbeat más allá de un HMAC/token (iteración).

## Decisiones
- **Server-authoritative absoluto:** el estado vive en BD; el cliente nunca envía su
  estado. La decisión del gate no lee nada del request salvo la identidad del negocio.
- **Todas las transiciones son reversibles.** El operador puede fijar **cualquiera de los 4
  estados en cualquier momento**, incluido `TERMINATED → ACTIVE`. No hay máquina de estados
  con transiciones ilegales; **no existe 409 por transición**. La única validación de
  entrada es de payload (p. ej. `GRACE` exige `graceUntil` futuro → 400 si falta; estado
  desconocido → 400).
- **`TERMINATED` no borra datos.** El cambio de estado nunca purga: reactivar es instantáneo
  porque los datos permanecen. La destrucción es una acción separada (ver §separación dura).
- **Caché in-process 30–60s** para no consultar BD en cada request, **invalidada en cada
  transición** (el `PUT lifecycle` limpia la entrada). Evaluación perezosa de `GRACE`: si
  `now > graceUntil`, se trata como `SUSPENDED` sin escribir (lazy), y el operador puede
  formalizar la transición cuando quiera.
- **Códigos HTTP con semántica:** `SUSPENDED` → **423 Locked**
  `{error:{code:'tenant_suspended'}}`; `TERMINATED` → **410 Gone**. `GRACE` pasa pero añade
  header `x-tenant-grace-until`.
- **Login gateado (423):** no se entra "a mirar" a un negocio suspendido. Exentos solo
  `GET /tenant-status` (para que el front sepa por qué está bloqueado) y el asset de la
  pantalla de bloqueo.
- **Toda transición se audita** en `TenantStateEvent` (from, to, motivo, actor).
- **La UI del operador es la palanca directa:** switch verde/rojo = `ACTIVE`/`SUSPENDED`;
  selector = `GRACE`/`TERMINATED`. No hay lógica de negocio en el front; solo dispara el
  `PUT lifecycle` con el estado destino.

## Riesgos
- **Caché stale** deja operar unos segundos tras apagar. Mitigación: invalidación en la
  transición + TTL corto (30–60s); aceptable para cortes no de seguridad inmediata.
- **Auto-bloqueo del operador**: el gate NO debe aplicar a las rutas `/service/operator`
  (el operador tiene que poder reactivar). Mitigación: `tenantGate` solo cuelga de rutas
  tenant-facing / panel, nunca del router de operador.
- **Confundir apagar con borrar**: si la purga se colgara del switch o de `TERMINATED`, un
  apagado rutinario destruiría datos. Mitigación: separación dura por diseño (switch nunca
  purga) + purga como acción aparte con doble confirmación.
- **Falsa sensación de control** con T3 self-host / binario offline. Mitigación: matriz de
  palanca explícita; producto limita alquiler a formas controladas.

## Rollback
Migración aditiva (`lifecycle` con default `ACTIVE`, columnas nullable + tabla de eventos).
Revertible: desmontar `tenantGate` de las rutas y DROP de columnas/tabla. Con default
`ACTIVE`, ningún negocio existente queda cortado al migrar.

## Dependencias
- `crm-tenant-api-keys` (resuelve `businessId` en el carril tenant-facing; el gate corre
  después de resolver identidad).
- `requireOperatorToken` para los endpoints y la UI de operador.
- Front Next.js del CRM (`front/`) para el interceptor 423 y la UI de operador (operaOS).

## Criterios de éxito
- Apagar un negocio (switch rojo → `SUSPENDED`) corta su servicio (423) en ≤ TTL de caché,
  incluido el login.
- `TERMINATED` responde 410 y **conserva los datos**; reactivar a `ACTIVE` (incluso desde
  `TERMINATED`) restaura el servicio sin pérdida.
- El operador puede fijar cualquiera de los 4 estados sin transiciones ilegales (sin 409).
- El operador nunca se auto-bloquea (rutas `/service/operator` exentas).
- Ningún cambio de estado ejecuta borrado de datos.
- La UI de operador (switch verde/rojo + selector) fija el estado vía los endpoints.
- Front muestra pantalla de bloqueo full-screen ante 423 global.
- back + front tests verde, `tsc` limpio, `prisma migrate status` sin drift.
