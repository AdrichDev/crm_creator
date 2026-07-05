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

## Phase 7: Refinamiento Clientes/Contactos tras feedback (2026-07-05, 2ª pasada)
- [x] 7.1 Confirmar/afinar filtros código, nombre, email, sector, contactado, fecha en Contactos (los 6, ya existen) y en Cartera de Clientes (solo nombre/email/fecha tienen campo real en `Customer` — código/sector/contactado no existen en ese modelo, dejar documentado de nuevo). Ambas páginas ya estaban correctas; sin cambios.
- [x] 7.2 Columnas Cartera de Clientes: Id Cliente, Nombre, Teléfono, Email, botón de información (Visitas total + Gasto total/pendiente de cobro), Acciones — quitar columna Segmento. Hecho en `front/app/(crm)/clientes/page.tsx`; `gastoPendiente` agregado server-side en `back/src/routes/customers.ts` (invoice.groupBy por nombre, estado != 'Pagada').
- [x] 7.3 Columna "Facturas" separada de Acciones (propia, no botón mezclado). Hecho.
- [x] 7.4 Ícono de Facturas = mismo que agents-agency (documento genérico, `FileText` en vez de `ReceiptText`). Hecho en `front/lib/config/modules.ts` y `shared/generate/tenant-types.ts`.
- [x] 7.5 En el modal de información del cliente, junto a la dirección: pin 📍 clicable que abra Google Maps. Hecho, reutilizando `lib/comercial/maps-link.ts` (coords) con fallback a `lib/citas/google-maps-url.ts` (texto de dirección).
- [x] 7.6 Confirmar colores de acciones (`tone` de `IconButton`) aplicados de forma consistente en Clientes y Contactos, iguales a agents-agency. Ya estaban correctos en ambas páginas; sin cambios.
- [x] 7.7 Badge en el ítem "Contactos" del sidebar de creador_CRM con el conteo de leads con `contactado != 'si'` (no existía). Backend `GET /contactos/pending-count` YA existía (scoped por `req.businessId`); solo faltaba el consumo en `front/components/layout/sidebar.tsx` — hecho.
- [x] 7.8 Investigado y corregido el badge equivalente en `agents-agency` (paralelo, otro agente): el query server-side ya filtraba bien (`contactado: {not:'si'}`, confirmado contra datos reales: 20 "no" + 4 "si"). Causa real: el badge de `Sidebar.tsx` solo refrescaba en cambio de ruta (`[pathname]`) — si el usuario marcaba contactos como "si" sin salir de `/contactos`, quedaba con el número previo. Fix: evento global `CONTACTS_UPDATED_EVENT`/`notifyContactsUpdated()` disparado tras alta/edición/borrado/cambio de estado, escuchado además del refetch por pathname.

## Phase 8: Refinamiento Clientes 3ª pasada (2026-07-05)
- [ ] 8.1 Columna "Empresa"/razón social (campo nuevo en `Customer`, no existe hoy) + columna "Contacto" = persona de contacto (el nombre actual). Decidir naming exacto de columnas y del campo nuevo (nullable, sin romper mocks/generador).
- [ ] 8.2 Reordenar: columna Facturas ANTES de Acciones (hoy el `head` de la tabla tiene `[...'Acciones','Facturas']`, invertir a `[...'Facturas','Acciones']`), igual que agents-agency.
- [ ] 8.3 En Acciones: los 3 íconos (ver/editar/borrar) juntos en línea, no separados/en menú.
- [ ] 8.4 Símbolo € DESPUÉS de la cifra en "Gasto total" y "Gasto pendiente de cobro" del modal de ficha/documentos (falta en gasto total, falta en pendiente de cobro).
- [ ] 8.5 Bug real: el pin de Google Maps del modal usa `buildRouteUrl` (`/maps/dir/?api=1&destination=...`, ruta de navegación desde la ubicación actual del usuario) en vez de centrar un pin simple en la dirección — por eso "no marca la dirección real". Cambiar a URL de punto/marcador (`/maps/search/?api=1&query=lat,lng`) para este uso puntual; NO tocar `buildRouteUrl` en su uso original de "Ir" en el módulo comercial.
- [ ] 8.6 Bug real: click en columna Facturas vuelve a /panel en vez de mostrar facturas — sospecha: módulo `facturas` no está activo por defecto para el vertical `comerciales` (no está en `defaultModules`), y `ModuleGuard`/el guard de ruta rebota. Investigar y decidir si se activa el módulo para el tenant "Comercial Demo IA" (y/o se agrega a `defaultModules` de `comerciales`) ya que la columna Facturas ahora es parte fija de la tabla de Clientes.
- [ ] 8.7 Crear alguna factura mockeada (SQL directo, mismo patrón que clientes/contactos) en "Comercial Demo IA" para poder probar el flujo.
