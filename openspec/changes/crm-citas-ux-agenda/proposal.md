# crm-citas-ux-agenda

## Intención
Arreglar y pulir el flujo de citas/agenda del CRM: dropdowns legibles en modo oscuro,
selección de hora por chips de disponibilidad, persistencia real al editar una cita,
modal de detalle de cita con anotaciones desde Inicio, y modal de información del
cliente al estilo del modal "info" de agents-agency — acercando la línea visual de
ambos productos.

## Problema (verificado por filesystem scan 02/07/2026)
1. **Dropdowns blancos en oscuro:** `globals.css:262-271` fija `option { color: #111 }`
   y los selects de `nueva-cita-modal.tsx` (`inputCls`) no definen `color-scheme` ni
   estilo de `option` → el desplegable nativo sale con fondo blanco/ilegible en dark.
2. **Hora por `<input type="time">`:** permite teclear cualquier hora, sin ver
   disponibilidad; el usuario quiere chips de horas (disponibles activas, ocupadas
   deshabilitadas). La duración ya la resuelve el back desde `Service.duracion` al crear
   (`POST /bookings` calcula `endAt`) — el selector debe apoyarse en eso, no duplicarlo.
3. **Editar cita no persiste:** `citas/page.tsx:94-98` — en modo API el submit solo hace
   `paged.refresh()`, nunca llama al `PATCH /bookings/:id` que YA existe
   (`back/src/routes/bookings.ts:326-338`, soporta start/notes/employeeId con
   revalidación de disponibilidad).
4. **Cita del widget Inicio sin detalle:** `agenda-widget.tsx:163` hace
   `router.push('/citas?edit=id')`; el usuario quiere modal de detalle con datos +
   anotaciones + botones "Cerrar" e "Ir a agenda".
5. **Nombre del cliente no clickable en Agenda:** `citas/page.tsx:123` texto plano; se
   quiere modal de ficha completa como el `ContactInfoModal` de agents-agency
   (`agents-agency/front/components/contactos/ContactInfoModal.tsx`).

## Alcance
- **A. Fix selects dark (global):** regla CSS de panel para `select` y `option` usando
  tokens (`--panel-card`/`--panel-text`) + `color-scheme` acorde al tema; eliminar el
  `option { color: #111 }` hardcoded. Aplica a todos los selects del panel (nueva cita,
  filtros, etc.) sin tocar componente a componente.
- **B. Chips de hora en nueva cita:** back expone `GET /bookings/slots?date&serviceId&employeeId&locationId`
  → lista de slots `{ hora, disponible }` computada con horario de apertura
  (`OpeningHour`), citas existentes no canceladas y `Service.duracion` (paso = duración
  del servicio). Front: grid de chips en `nueva-cita-modal` (disponible = seleccionable,
  ocupado = disabled con estilo atenuado); sustituye al `<input type="time">`. La cita
  se guarda como hoy (`POST /bookings` con `start`; el back fija `endAt` por duración
  del servicio — RF ya cubierto, se mantiene).
- **C. Persistir edición de agenda:** `citas/page.tsx` submit en modo API →
  `PATCH /bookings/:id` con `{ start?, employeeId?, notes? }` y refresh después; errores
  del back (conflicto de disponibilidad) mostrados al usuario.
- **D. Modal detalle de cita (Inicio):** click en cita del `agenda-widget` abre
  `CitaDetalleModal` (nuevo, sobre `ui/modal.tsx`): datos de la cita (dl/dt/dd), sección
  "Anotaciones" con textarea editable persistida a `Booking.notes` vía PATCH
  (guardar/editar), botón "Cerrar" (`Button variant="outline"`) y botón "Ir a agenda"
  (`Button` primary → `/citas?edit=id`). Sustituye al `router.push` directo.
- **E. Modal info de cliente (Agenda):** nombre del cliente en la lista de `/citas`
  pasa a ser clickable → `ClienteInfoModal` (nuevo) con la ficha completa del cliente,
  siguiendo la ESTRUCTURA del `ContactInfoModal` de agents-agency (dl con divisores,
  labels uppercase pequeñas, botón ✕ con hover rotatorio) pero con los tokens del CRM
  (`--acc` en labels, no el neon-cyan de agents-agency).
- **F. Coherencia visual:** los dos modales nuevos usan `ui/modal.tsx` + `Button`
  existentes; el patrón dl/dt/dd y el ✕ rotatorio quedan como convención compartida
  entre productos.

## Fuera de alcance
Modelo `BookingNote` separado (las anotaciones viven en `Booking.notes`, texto libre —
sin migración); drag&drop de citas; vista calendario nueva; cambios en agents-agency
(solo se copia su patrón, no se toca su código); recordatorios/email.

## Decisiones
- **Anotaciones = `Booking.notes` editable, sin migración.** El PATCH existente ya
  acepta `notes`. Trade-off asumido: el canal se guarda hoy como prefijo "Canal: X" en
  notes; el modal muestra el texto completo y el usuario puede editarlo — aceptable
  hasta que canal tenga columna propia.
- **Slots calculados en el back** (no en el front): el back ya tiene la lógica de
  disponibilidad para revalidar en POST/PATCH; el endpoint de slots la reutiliza — una
  sola fuente de verdad.
- **Fix de selects por CSS global con tokens**, no clase a clase: una regla en el scope
  del panel cubre todos los selects presentes y futuros, y respeta tema claro/oscuro
  (`color-scheme` desde el tema activo).
- **Paso de slot = duración del servicio** (peluquería 30' → chips cada 30'); si no hay
  servicio elegido aún, chips deshabilitados con hint "elige servicio primero".

## Riesgos
- Cálculo de slots con citas solapadas/empleado opcional → cubierto por tests del
  endpoint (empleado concreto vs cualquiera).
- Regresión visual en selects de otras pages (tpv-select, onboarding tienen estilos
  propios) → la regla nueva es de scope panel y no pisa clases específicas existentes.
- `?edit=` deep-link del widget se mantiene como fallback (el modal añade, no rompe).

## Rollback
Front-only + 1 endpoint read-only nuevo. Sin migración. Revertible por commit.

## Criterios de éxito
Dropdowns legibles en oscuro y claro; chips de disponibilidad reales; editar cita
persiste en Supabase y sobrevive un F5; modal de detalle con anotaciones guardables;
ficha de cliente al click en el nombre; tests front+back verdes, tsc limpio.
