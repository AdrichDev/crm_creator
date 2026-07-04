# Design: Integraciones de comunicación en el CRM

## Technical Approach

Portar el patrón OAuth ya probado en producción en `agents-agency` (AA) —
`back/src/lib/crypto.ts` (AES-256-GCM) + `back/src/lib/integrations/oauth.ts`
(cifrado `enc:v1:`, refresh perezoso con lock anti-carrera, revoke) — a CRM,
adaptado a multi-tenant (`businessId` en vez de `agentId`) sobre la tabla
`oauth_credential` ya fijada en `proposal.md`. Reutilizar `notify.ts` /
`automation/events.ts` para telemetría, sin infraestructura nueva de métricas.

Desviación deliberada del patrón AA: revoke es soft-delete (`revokedAt`), no
hard-delete. Sigue el precedente `CalendarToken` del propio CRM (secreto
backend-only, revocar marca `revokedAt`), más apropiado para auditoría
business-facing que el hard-delete de AA.

## Architecture Decisions

### Decisión 1 — Schema OAuthCredential + cifrado

**Elegido**: Reusar el schema ya fijado en `proposal.md` (`businessId?`,
`scope` tenant|admin, `servicio` gmail|whatsapp|calendar, `accessToken`,
`refreshToken?`, `expiresAt?`, `scopesOauth[]`, `@@unique([businessId, servicio])`).
Cifrado: portar literal `crypto.ts` de AA (AES-256-GCM, IV 12 bytes, authTag
16 bytes) + wrapper `enc:v1:<base64(json)>` de `oauth.ts`. Nuevo archivo
`back/src/lib/crypto.ts` en CRM, nueva env var `CRM_OAUTH_ENCRYPTION_KEY`
(NO reusar `CHANNEL_ENCRYPTION_KEY` de AA — apps y despliegues distintos,
blast radius de una fuga de clave debe quedar contenido a un solo sistema).

**Alternativas descartadas**: libsodium (dependencia nueva, sin beneficio
sobre `node:crypto` nativo ya validado en AA) · field-level encryption de
Prisma (no existe en este stack, añade capa de indirección sin necesidad) ·
renombrar campos a `tokenEncrypted`/`secretEncrypted` como sugería el
team-lead (rompe con el proposal ya aprobado sin ganancia — el nombre del
campo no es lo que lo hace seguro, el contenido cifrado sí).

**Razón**: código ya escrito, probado y en producción en el mismo monorepo.
No inventar un segundo mecanismo de cifrado para el mismo problema.

**Versionamiento**: NO hay múltiples credenciales activas por
`(businessId, servicio)`. El `@@unique` ya lo impide — reconectar hace
upsert y descarta el token anterior. Igual que AA (`Integration` tiene el
mismo unique). Rotación futura (si se necesitara) sería un cambio de schema
explícito, no se diseña ahora sin caso de uso real.

### Decisión 2 — Refresh strategy

**Elegido**: Refresh perezoso en `getValidToken(businessId, servicio)`,
igual que AA — se comprueba `expiresAt` con margen de 60 s, se refresca
bajo demanda con lock anti-carrera (`Map<string, Promise<string>>` por
`businessId:servicio`), NO vía drainer.

**Alternativas descartadas**: refresh automático vía drainer (sugerencia
del team-lead) — añade un job en background que refresca tokens que nadie
va a usar todavía; el CRM emite comunicaciones bajo demanda (al confirmar
una cita, al enviar factura), no en background, así que el momento natural
de refrescar es el momento de uso.

**Razón**: patrón ya validado en AA, evita job adicional, coincide con el
flujo real del CRM (evento de negocio → intento de envío → refresh si hace
falta).

**Excepción — Calendar (Fase 3)**: el *sync bidireccional* de eventos SÍ
necesita un poller periódico (ya decidido en `spec.md`, no es parte de esta
decisión). Ese poller reutiliza el mismo `getValidToken()` internamente —
el refresh sigue siendo perezoso, el poller es un consumidor más, no un
mecanismo de refresh nuevo.

**Fallback si el refresh falla**: `invalid_grant`/401 → marcar
`estado = 'reauth_required'`, lanzar `ReauthRequiredError`, el caller
atrapa el error y cae a `notify.ts` (email directo), igual que hace AA hoy.
Error de red transitorio (5xx) → NO marcar reauth, devolver el token viejo
y loguear (mismo comportamiento que AA `doRefresh`).

### Decisión 3 — Revoke handling

**Elegido**: Soft-delete. Añadir `estado String @default("connected")`
(`connected | reauth_required | revoked`) y `revokedAt DateTime?` al schema
de `proposal.md`. Al desconectar: intento best-effort de revocar en Google
(no bloquea si falla), luego `estado = 'revoked'` + `revokedAt = now()`. La
fila NO se borra.

**Alternativas descartadas**: hard-delete (patrón AA) — pierde el historial
de qué negocio tuvo qué integración y cuándo se cortó, dato relevante para
soporte/facturación de un CRM comercial.

**Razón**: sigue el precedente ya existente en el propio CRM —
`CalendarToken.revokedAt` (mismo problema: secreto backend-only, revocar
sin destruir el registro).

**Evento en vuelo durante revoke**: si un envío está usando el token justo
cuando se revoca, Google responde 401/`invalid_grant` en esa llamada → cae
en el mismo camino de la Decisión 2 (`ReauthRequiredError` → fallback a
`notify.ts`). No hay retry contra la misma credencial: ya está muerta.

### Decisión 4 — Admin vs tenant

**Elegido**: Misma tabla `oauth_credential` (ya decidido en `proposal.md`
vía `businessId?` + `scope` tenant|admin). Gate de acceso: reusar el
role-gate de operador ya existente en el CRM (mismo mecanismo que cerró el
hallazgo CRITICAL de rol de operador). Solo un request autenticado como
operador puede leer/crear/editar/borrar filas con `businessId = null`. Un
usuario tenant normal solo ve/gestiona filas de su propio `businessId`
(mismo scoping que `BusinessSetting`).

**Alternativas descartadas**: tabla separada `AdminOAuthCredential` — misma
forma de dato duplicada sin motivo, dos migraciones para un solo concepto.

**Razón**: menos superficie de schema, el aislamiento real ocurre en la
capa de autorización (middleware), no en tener tablas separadas.

**Secreto de cifrado**: el MISMO `CRM_OAUTH_ENCRYPTION_KEY` para admin y
tenant. Separar claves por scope no aporta aislamiento real — el backend
(service role) puede descifrar ambas filas igual; el aislamiento lo da el
gate de autorización, no la clave de cifrado.

### Decisión 5 — Scopes + validación

**Elegido**:
- Gmail: scope único `gmail.modify` (lectura+envío+modify, sin scopes
  extra de Gmail API).
- Calendar: scope único `calendar.events` (crear/editar/borrar eventos).
  NO `calendar.settings` — el CRM no necesita leer configuración de
  huso horario del usuario, solo escribir/leer eventos.
- WhatsApp: el CRM NO almacena secreto real de Twilio. La fila
  `servicio='whatsapp'` es un marcador de estado de conexión
  (`accessToken=""`, sin OAuth real) — el secreto de Twilio vive
  solo en variables de entorno de n8n, nunca en la DB del CRM. Evita
  duplicar el mismo secreto en dos sistemas.

**Validación**: en el CRUD (`POST /api/integrations/:servicio/connect` →
callback), NO en primer uso. Se decodifica el scope concedido vía
`GET https://oauth2.googleapis.com/tokeninfo?access_token=...` y se
compara contra el requerido; si falta scope → HTTP 422, no se persiste
la credencial.

**Razón**: fallar rápido en el momento de conexión es mejor experiencia
que descubrir un scope insuficiente al intentar enviar una factura tres
semanas después. Coincide con la propia recomendación del team-lead.

### Decisión 6 — Error codes + telemetría

**Elegido**: reusar `automation/events.ts` (infra Fase 0, ya en
producción) — 3 eventos tipados nuevos: `integracion.reauth_requerido`
(401/refresh fallido), `integracion.scope_insuficiente` (422 en connect),
`integracion.fallo_proveedor` (5xx de Google/Meta). Se emiten vía `emit()`
existente (mismo soft-fail, misma idempotencia por `eventId`). Log
estructurado con campos `businessId`, `servicio`, `scope`, `codigo` vía
logger ya existente.

**Alternativas descartadas**: métricas nuevas (Prometheus/counters
dedicados) — no existe infra de métricas en el proyecto hoy; añadirla
para 3 eventos es sobre-ingeniería. Si en el futuro se necesita un
dashboard de fallos de integración, se puede agregar sobre estos mismos
eventos ya emitidos.

**Razón**: Fase 0 (`notify.ts`/`events.ts`) ya resuelve "emitir un evento
de dominio de forma segura" — no inventar un segundo canal de telemetría
para el mismo problema.

## Data Flow

    Acción de negocio (confirmar cita / enviar factura)
              │
              ▼
      getValidToken(businessId, servicio)
              │
      ┌───────┴────────┐
      │ expiresAt > now+60s?
      └───────┬────────┘
       sí │         │ no
          │         ▼
          │   refresh (lock anti-carrera)
          │         │
          │   ┌─────┴─────┐
          │   │ invalid_grant/401?
          │   └─────┬─────┘
          │     sí  │  no (red transitoria)
          │         │         │
          │         ▼         ▼
          │   estado=reauth   devuelve token viejo
          │   requerido       + log
          │         │
          │         ▼
          │   ReauthRequiredError
          │         │
          └─────────┼──────────────┐
                     ▼              ▼
              token válido    fallback a notify.ts
                     │         (email directo, soft-fail)
                     ▼
          llamada a Gmail/Calendar API
                     │
              ┌──────┴──────┐
              │ éxito │ 5xx proveedor
              └──────┬──────┘
                      ▼
            emit('integracion.fallo_proveedor')

## File Changes

| File | Action | Description |
|------|--------|--------------|
| `creador_CRM/back/src/lib/crypto.ts` | Create | Port literal de AA: AES-256-GCM, `encrypt`/`decrypt` sobre `CRM_OAUTH_ENCRYPTION_KEY` |
| `creador_CRM/back/src/lib/integrations/oauth.ts` | Create | Port adaptado de AA: `encryptToken`/`decryptToken` (`enc:v1:`), `getValidToken`, refresh con lock, `disconnectIntegration` (soft-delete) |
| `creador_CRM/back/src/lib/integrations/providers/google.ts` | Create | Config OAuth Google: `authUrl`/`tokenUrl`, scopes separados `gmail.modify` y `calendar.events` (dos providers, no unificado como AA) |
| `creador_CRM/back/prisma/schema.prisma` | Modify | Añadir `model OAuthCredential` (proposal.md) + `estado`/`revokedAt` (Decisión 3) |
| `creador_CRM/back/src/routes/integrations.ts` | Create | `POST /:servicio/connect`, `GET /:servicio/callback`, `POST /:servicio/revoke`, validación de scope (422) |
| `creador_CRM/back/src/lib/automation/events.ts` | Modify | 3 eventos nuevos (Decisión 6) |
| `creador_CRM/back/src/middleware/operatorGate.ts` (o equivalente existente) | Modify | Gate `businessId = null` solo operador (Decisión 4) |

## Interfaces / Contracts

```typescript
// oauth.ts
export async function getValidToken(businessId: string | null, servicio: Servicio): Promise<string>;
export async function handleCallback(servicio: Servicio, code: string, businessId: string | null): Promise<void>;
export async function disconnectIntegration(businessId: string | null, servicio: Servicio): Promise<void>;

type Servicio = 'gmail' | 'whatsapp' | 'calendar';
type EstadoCredencial = 'connected' | 'reauth_required' | 'revoked';

class ReauthRequiredError extends Error {}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|--------------|----------|
| Unit | `encrypt`/`decrypt` round-trip, `authTag` inválido lanza | Puerto directo de los tests existentes de AA (`crypto.test.ts`) |
| Unit | `getValidToken`: no-refresh si no expiró, refresh si expiró, lock anti-carrera (2 llamadas concurrentes = 1 sola llamada HTTP) | Mock `fetch`, dos promesas simultáneas |
| Integration | Aislamiento multi-tenant: T1 conecta Gmail, T2 no ve ni usa esa credencial (Gherkin de `proposal.md`) | e2e con `businessId` distinto |
| Integration | Revoke: `estado=revoked` + `revokedAt` seteado, fila persiste | e2e, `prisma.oAuthCredential.findUnique` post-revoke |
| Integration | Scope insuficiente → 422, no persiste credencial | Mock Google tokeninfo con scope incompleto |
| Integration | Refresh falla con `invalid_grant` → fallback a `notify.ts` (email enviado) | Mock refresh 400, assert `sendEmail` llamado |

## Migration / Rollout

Migración Prisma aditiva: nueva tabla `oauth_credential`, sin tocar tablas
existentes. Sin backfill (integraciones nuevas, no hay datos previos que
migrar). Rollout por fases ya fijado en `proposal.md` (Fase 1 Gmail → Fase
2 WhatsApp → Fase 3 Calendar+admin); cada fase es un PR independiente.

## Open Questions

- [ ] `tasks.md`/`validation.md` existentes mencionan `tenant_integrations`
      y una numeración de fases distinta a la ya fijada en `proposal.md`/
      `spec.md` — pendiente de que `sdd-tasks` los realinee (no se tocan
      en esta fase de diseño).
- [ ] Confirmar con el usuario si WhatsApp como "marcador sin secreto real"
      (Decisión 5) es aceptable, o si se prefiere que el CRM sí guarde el
      Account SID de Twilio (no el secreto) para mostrarlo en la UI.
