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

## Phase 6: Fixes reales tras QA (2026-07-05) — las fases 1-5 quedaron marcadas [x] pero no funcionaban en la práctica
- [x] 6.1 Padding lateral en todas las vistas del panel (`.opera-main`/`.opera-content`, `app-shell.tsx`) — antes el contenido ocupaba el 100% del ancho.
- [x] 6.2 Dashboard sobrecargado de widgets de agenda (4 de 5 widgets por defecto eran variantes de citas/agenda para el vertical `comerciales`) — nuevos widgets `contactos-nuevos` y `visitas-comercial`, regla anti-repetición (`MAX_AGENDA_GROUP_DEFAULTS=2`) en `defaultDashboardWidgets`.
- [x] 6.3 Widget de Agenda del dashboard agrandado a tamaño `xl` con card lateral (mismo layout que `/citas`), antes era una versión mini.
- [x] 6.4 Fix Google Maps `InvalidKeyMapError`: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` en `front/.env.local` tenía un `:` sobrante al inicio (40 chars en vez de 39) — corregido.
- [x] 6.5 Rebrand Telegram → Minion: ícono SVG propio (`MinionIcon`), texto "Minion" en vez de "Telegram" en toda la UI.
- [x] 6.6 Bug real de tiempo real: el polling de 5s pisaba el mensaje optimista recién enviado con datos viejos del servidor — fix con merge por id en `use-telegram-inbox.ts` en vez de reemplazo total del estado.
- [x] 6.7 Widget de Minion pasa de estar montado solo dentro de `(crm)/layout.tsx` (por proyecto) a `app/layout.tsx` (root) — ahora aparece en `/dashboard` y persiste al entrar/salir de cualquier proyecto.
- [x] 6.8 Terminología "Cuenta"→"Cliente" en columna de Citas/Reuniones para el vertical `comerciales`.
- [x] 6.9 20 clientes + 10 contactos (mix lead/prospecto) mock creados en el tenant "Comercial Demo IA" vía SQL directo, todos los campos rellenos, geo real de Madrid.
- [x] 6.10 Empleado de prueba "Laura Fichaje Test" creado en el tenant "AiAs" para poder probar fichaje — SIN login todavía (crear vía Configuración → invitar usuario, no se hizo por SQL directo al no tener credenciales de admin para pasar por el flujo real).

