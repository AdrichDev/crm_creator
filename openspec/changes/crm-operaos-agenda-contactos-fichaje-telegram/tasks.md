# Tasks ? Agenda OperaOS, Contactos, Telegram UI y Fichaje

## Review Workload Forecast
| Field | Value |
|-------|-------|
| Estimated changed lines | 1400-2400 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 agenda visual ? PR2 calendar/maps ? PR3 contactos ? PR4 Telegram UI ? PR5 fichaje |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

## Phase 1: Agenda visual
- [x] 1.1 Extraer gramática reusable desde `front/components/panel/widgets/agenda-widget.tsx`.
- [x] 1.2 Reemplazar `front/app/(crm)/citas/page.tsx` por vista full-screen equivalente.
- [x] 1.3 Tests de vista y terminología sectorial.

## Phase 2: Calendar CRUD y Google Maps
- [x] 2.1 Unificar create/update/delete contra Google Calendar en `back/src/lib/integrations/calendar.ts`.
- [x] 2.2 Asegurar idempotencia por `bookingId` en `back/src/routes/bookings.ts`.
- [x] 2.3 Sustituir mapa actual por URL/embed Google Maps y test de builder. (commit b795eba)

## Phase 3: Contactos
- [x] 3.1 Añadir `contactos` a módulos, tenant config y navegación. (commit 1ed67ca)
- [x] 3.2 Replicar UI/lógica desde `agents-agency/front/app/contactos` y `components/contactos`. (commit 1ed67ca)
- [x] 3.3 Crear/ajustar API y persistencia si el modelo no existe. (commit 1ed67ca)

## Phase 4: Telegram UI
- [x] 4.1 Modelar conversaciones/mensajes Telegram por tenant si falta persistencia.
- [x] 4.2 Crear vista UI de conversación en vivo.
- [x] 4.3 Añadir respuesta manual por Telegram con idempotencia.

## Phase 5: Fichaje
- [x] 5.1 Rediseñar `front/app/(crm)/fichaje/page.tsx` con selector intensiva/partida.
- [x] 5.2 Ajustar back/modelo para eventos ordenados de jornada si el CRUD actual no alcanza.
- [x] 5.3 Tests de secuencia válida y bloqueo de fichajes extra.

