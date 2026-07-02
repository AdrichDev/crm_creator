# Automatizaciones n8n — CRM

Integración CRM ↔ n8n. El back emite **eventos de dominio** firmados (HMAC) hacia un
único webhook de n8n; n8n verifica la firma, deduplica y envía el email correspondiente.

> Principio rector: **el CRM nunca depende de n8n.** Si n8n cae, `emit()` hace fallo suave
> y el flujo de negocio sigue. n8n es un consumidor best-effort.

## Arquitectura (Fases 1–2)

```
back/src/lib/automation/emit()  --POST firmado-->  n8n Webhook (/webhook/crm-automation)
                                                      └─ Verify & Route (Code): HMAC + replay + idempotencia
                                                          ├─ auth_failed                 → 401
                                                          ├─ user.invited                → Email: alta usuario     → 200
                                                          ├─ password.reset_requested    → Email: reset            → 200
                                                          ├─ email.verification_requested→ Email: verificación     → 200
                                                          ├─ booking.confirmed           → Email: cita confirmada  → 200
                                                          ├─ booking.reminder.24h        → Email: recordatorio 24h → 200
                                                          ├─ booking.reminder.2h         → Email: recordatorio 2h  → 200
                                                          ├─ booking.no_show             → Email: no-show          → 200
                                                          ├─ invoice.pending_digest      → Email: facturas pendientes    → 200
                                                          ├─ cash.daily_summary          → Email: resumen de caja        → 200
                                                          ├─ stock.low_digest            → Email: stock bajo             → 200
                                                          ├─ customer.birthday           → Email: cumpleaños             → 200
                                                          ├─ customer.reactivation_digest→ Email: reactivación clientes  → 200
                                                          ├─ package.renewal_due         → Email: renovación bono        → 200
                                                          ├─ fichaje.weekly_summary      → Email: resumen fichajes       → 200
                                                          ├─ review.request              → Email: reseña                 → 200
                                                          ├─ timeoff.requested           → Email: solicitud vacaciones   → 200
                                                          ├─ timeoff.resolved            → Email: resolución vacaciones  → 200
                                                          └─ fallback (duplicate/skip/desconocido) → 200
```

## Ramas Fases 3–5 (digests + eventos de marketing/equipo)

Añadidas 10 ramas nuevas (18 reglas Switch = 8 + 10). Todas renderizan el cuerpo HTML
**exclusivamente** con `$json.data.safe.*` (espejo XSS-safe del payload); el `toEmail` usa
`$json.data.email` en crudo (es el destinatario, no va al HTML). Los eventos *digest* traen un
campo `detalle` = texto plano multilínea, renderizado en bloque con `white-space:pre-line`
(también vía `data.safe.detalle`, cero HTML desde datos).

| Evento | Destinatario | Payload (`data`) |
|--------|--------------|------------------|
| `invoice.pending_digest` | admin | businessName, email, detalle, totalPendientes |
| `cash.daily_summary` | admin | businessName, email, fecha, total, detalle |
| `stock.low_digest` | admin | businessName, email, detalle, numProductos |
| `customer.birthday` | cliente | businessName, customerName, email |
| `customer.reactivation_digest` | admin | businessName, email, detalle, numClientes |
| `package.renewal_due` | cliente | businessName, customerName, email, packageName, sesionesRestantes |
| `fichaje.weekly_summary` | admin | businessName, email, detalle |
| `review.request` | cliente | businessName, customerName, email, serviceName, fecha, hora |
| `timeoff.requested` | admin | businessName, email, employeeName, tipo, inicio, fin, dias |
| `timeoff.resolved` | empleado | businessName, employeeName, email, estado, inicio, fin |

Plantillas versionadas en `templates/` (fuente de verdad, sincronizadas con el HTML incrustado
en el JSON): `invoice-pending-digest.html`, `cash-daily-summary.html`, `stock-low-digest.html`,
`customer-birthday.html`, `customer-reactivation-digest.html`, `package-renewal-due.html`,
`fichaje-weekly-summary.html`, `review-request.html`, `timeoff-requested.html`,
`timeoff-resolved.html`. Sin enlaces con token, PII mínima. Cada rama → `Respond 200`; el
fallback del Switch sigue siendo la última salida.

Un solo webhook porque el back usa una sola `AUTOMATION_WEBHOOK_URL`. El enrutado por
tipo de evento ocurre dentro de n8n (campo `name` del envelope → `route` en el Code node →
Switch `Route by event`). El Switch usa `fallbackOutput: extra` (última salida), así que
al añadir ramas el fallback se desplaza siempre al índice final.

Las ramas `booking.*` usan el payload `data` = `{bookingId, businessName, customerName,
email, serviceName, employeeName?, fecha, hora}`. PII mínima: solo nombre del cliente y
datos de la cita, sin enlaces con token. `employeeName` se renderiza condicionalmente.

## Seguridad del webhook (V.2)

- **Firma**: `X-Automation-Signature = HMAC-SHA256(secret, "${timestamp}.${rawBody}")` en hex.
  El nodo *Verify & Route* recomputa el HMAC reconstruyendo el envelope en el **mismo orden de
  claves** que firma el back (`eventId,name,businessId,occurredAt,data`). Comparación en tiempo
  constante (`timingSafeEqual`).
- **Anti-replay**: ventana de 5 min sobre `X-Automation-Timestamp`.
- **Idempotencia**: `eventId` guardado en *workflow static data*; un reenvío → ruta `duplicate` → 200 sin reenviar email.
- **PII mínima**: las plantillas solo usan `firstName` + enlace con token de un solo uso. Sin contraseñas en claro, sin logs de `data`.
- **Secreto**: `AUTOMATION_WEBHOOK_SECRET` debe ser idéntico en el back y en el contenedor n8n.

## Puesta en marcha (Fase 0.1)

1. **Variables** (`.env` en la raíz del repo / entorno del back):
   ```env
   AUTOMATION_WEBHOOK_URL=http://localhost:5678/webhook/crm-automation
   AUTOMATION_WEBHOOK_SECRET=<secreto-largo-aleatorio>   # mismo valor en back y n8n
   N8N_ENCRYPTION_KEY=<clave-cifrado-credenciales-n8n>
   # opcionales (defaults en env.ts): AUTOMATION_MAX_ATTEMPTS=3  AUTOMATION_TIMEOUT_MS=5000
   ```
   El contenedor n8n **debe** llevar además estas dos variables (la imagen `n8nio/n8n:latest`
   las exige para el verify del dispatcher):
   ```env
   NODE_FUNCTION_ALLOW_BUILTIN=crypto      # permite require('crypto') en el Code node
   N8N_BLOCK_ENV_ACCESS_IN_NODE=false      # permite leer $env.AUTOMATION_WEBHOOK_SECRET en el Code node
   ```
2. **Arrancar n8n**:
   ```bash
   docker compose --profile n8n up -d
   ```
   Abre http://localhost:5678 y crea el usuario owner.
3. **Credencial SMTP**: en n8n → *Credentials* → *SMTP* → crea "SMTP CRM" con tu proveedor de correo.
4. **Importar el workflow**: *Workflows* → *Import from File* → `n8n/workflows/crm/crm-automation-dispatcher.json`.
   - Reasigna la credencial SMTP en los dos nodos *Email* (el JSON trae el placeholder `REPLACE_WITH_SMTP_CREDENTIAL_ID`).
   - Ajusta el `fromEmail` (`no-reply@tudominio.com`) al dominio real.
   - **Activa** el workflow (toggle *Active*) para que el webhook quede productivo en `/webhook/...`
     (en modo test la URL es `/webhook-test/...`).

## API key de n8n (para el MCP / despliegue automatizado)

El MCP `n8n-mcp` (gestión de workflows desde Claude) necesita:
- `N8N_API_URL=http://localhost:5678` y `N8N_API_KEY` (n8n → *Settings* → *n8n API* → *Create API Key*).
- **Nota**: el MCP bloquea `localhost` por *SSRF protection (strict mode)*. Para desplegar workflows
  vía MCP, expón n8n por un host/alias no-localhost o desactiva el modo estricto del MCP. Mientras tanto,
  el despliegue es manual (Import from File, arriba).

## Verificación (V.1 — VERIFICADO end-to-end 2026-06-17)

Probado contra el n8n real (workflow id `iJsa8iZjrjV20abQ`) firmando con el secreto compartido:

- ✅ **Firma válida** `user.invited` → 200 + email enviado (SMTP Gmail). Ejecución n8n `success`.
- ✅ **Firma válida** `password.reset_requested` → 200 + email enviado.
- ✅ **Idempotencia**: mismo `eventId` → ruta `duplicate`, 200, sin reenvío.
- ✅ **Firma manipulada** → 401, sin email.
- ✅ **Secreto incorrecto** → 401, sin email.

> Gotcha clave de la firma: el back firma `JSON.stringify(envelope)` (compacto, sin espacios).
> Cualquier cliente de prueba debe serializar igual (p.ej. en Python: `json.dumps(..., separators=(',',':'))`).

## Despliegue automatizado (REST API)

Aunque el MCP `n8n-mcp` bloquea `localhost` (SSRF strict), el despliegue automatizado SÍ es posible
vía la API pública de n8n con `X-N8N-API-KEY`:
- `POST /api/v1/workflows` (crear), `PUT /api/v1/workflows/{id}` (actualizar), `POST /api/v1/workflows/{id}/activate`.
- `POST /api/v1/credentials` (crear credencial SMTP, type `smtp`).

## Estado

- Fase 0.1 (infra docker) + Fase 1 (alta usuario, reset contraseña): **DESPLEGADO Y VERIFICADO**.
- Fase 2 (citas): **ramas añadidas al JSON** (`booking.confirmed`, `booking.reminder.24h`,
  `booking.reminder.2h`, `booking.no_show`) + plantillas `templates/booking-*.html` versionadas.
  **PENDIENTE DEPLOY (tarea 2.5)**: importar/actualizar el workflow vía REST y verificación e2e
  real (bloqueado por `N8N_API_KEY`, la aporta el usuario). Verify/idempotencia/401 sin cambios.
- Fase 2 (citas): **DESPLEGADO Y VERIFICADO** (tarea 2.5, 2026-07-02).
- Fases 3–5 (facturación, marketing, equipo): **ramas añadidas al JSON** (10 eventos nuevos) +
  10 plantillas `templates/*.html` versionadas + README. JSON validado (22 nodos, 18 reglas
  Switch, router 19 salidas, cada rama nueva → Email → Respond 200, cero `data.X` crudo en los
  HTML nuevos, `new Function(jsCode)` OK). Verify/idempotencia/401 sin cambios. **PENDIENTE
  DEPLOY (tarea 6.2)**: PUT REST del dispatcher + verificación e2e real por rama y idempotencia
  (patrón 2.5); la ejecuta el orquestador.

## Organización en el repo

- `n8n/workflows/crm/` → workflows propios del CRM (este proyecto).
- `n8n/workflows/agents-agency/` → reservado para workflows del proyecto agents-agency (mismo workspace n8n).
- `n8n/templates/` → plantillas de email (fuente de verdad, versionadas).

## Workflow `crm-calendar-push` (crm-citas-google-calendar, WU3.2)

Push opt-in de citas/recordatorios confirmados a Google Calendar. **Workflow separado**
del dispatcher de emails (`crm-automation-dispatcher.json`), con su **propio webhook y
su propia credencial OAuth de Google** — así las credenciales de Calendar no se mezclan
con las de SMTP y una caída de Calendar no afecta al dispatcher de emails.

```
back/src/lib/calendarEmitter.ts --POST firmado--> n8n Webhook (/webhook/crm-calendar-push)
                                                     └─ Verify (Code): HMAC + replay + idempotencia
                                                         ├─ firma inválida/caducada/duplicada → 401
                                                         └─ válida → Google Calendar: crear evento → Respond 200
```

- **Mismo HMAC que el dispatcher**: reutiliza `AUTOMATION_WEBHOOK_SECRET` (un solo
  secreto que gestionar); la URL es DISTINTA (`CALENDAR_WEBHOOK_URL` en el back, apunta
  al path `/webhook/crm-calendar-push` de este workflow).
- **Payload** (`data`): `{ uid, titulo, inicio, fin, direccion }`. `uid` es el mismo
  identificador estable del feed ICS (`booking-{id}@crm` / `reminder-{id}@crm`) — si el
  usuario usa ICS + push a la vez, ambos mecanismos referencian el mismo evento lógico
  (mitigación de duplicados documentada en `proposal.md`).
- **Idempotencia**: igual que el dispatcher, `eventId` (= `uid`) se guarda en *workflow
  static data*; un reenvío con el mismo `eventId` no vuelve a crear el evento.
- **Fail-open desde el back**: `CALENDAR_WEBHOOK_URL` vacía → `emit()` responde
  `disabled`, el CRM sigue funcionando (regla de negocio: nada bloquea la confirmación
  de una cita ni la creación de un recordatorio).

### Puesta en marcha

1. **Variable adicional** (junto a las de `AUTOMATION_WEBHOOK_*`, arriba):
   ```env
   CALENDAR_WEBHOOK_URL=http://localhost:5678/webhook/crm-calendar-push
   ```
2. **Credencial Google Calendar OAuth2**: en n8n → *Credentials* → *Google Calendar
   OAuth2 API* → autoriza con la cuenta que va a recibir los eventos (o una cuenta de
   servicio delegada, según el proyecto). Reasigna la credencial en el nodo
   *Google Calendar: crear evento* (el JSON trae el placeholder
   `REPLACE_WITH_GOOGLE_CALENDAR_CREDENTIAL_ID`).
3. **Importar**: *Workflows* → *Import from File* → `n8n/workflows/crm/crm-calendar-push.json`.
   Verifica el mapeo de campos `start`/`end` del nodo Google Calendar contra la versión
   instalada del nodo (puede variar de nombre/forma entre versiones de n8n) antes de activar.
4. **Activa** el workflow (toggle *Active*) para que quede productivo en `/webhook/...`.

### Estado

- **JSON creado, PENDIENTE DEPLOY**: falta credencial OAuth de Google real (la aporta
  el usuario/operador) y verificación e2e contra el n8n real, igual que el resto de
  fases nuevas de este directorio.
