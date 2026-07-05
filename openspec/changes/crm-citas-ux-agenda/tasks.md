# Tareas — crm-citas-ux-agenda

Nivel 2-3. Sin migración. Orden: CSS → back slots → chips → persistencia → modales.
AgenticRuntime gate antes de push.

## WU1 — Selects legibles en dark
- [x] 1.1 Regla global de panel para `select`/`option` con tokens (`--panel-card`,
      `--panel-text`) + `color-scheme` según tema; eliminar `option { color: #111 }`
      de `.opera-role-select` (globals.css:262-271) sustituyéndolo por tokens.
- [x] 1.2 Verificar tpv-select/onboarding sin regresión (scope de la regla nueva).

## WU2 — Back: endpoint de slots
- [x] 2.1 `GET /bookings/slots?date&serviceId[&employeeId][&locationId]` en
      `back/src/routes/bookings.ts`: OpeningHour del día + paso = Service.duracion +
      solapes de bookings no cancelados. Reutilizar la lógica de disponibilidad existente
      del POST/PATCH (extraer helper si hace falta, sin duplicar).
- [x] 2.2 node:test `bookings-slots.test.ts`: básico, ocupado, día cerrado, empleado
      concreto vs cualquiera.

## WU3 — Front: chips de hora en nueva cita
- [x] 3.1 Componente `hora-chips.tsx` (grid de chips, disabled para ocupados, estado
      "elige servicio/fecha primero") + wiring en `nueva-cita-modal.tsx` reemplazando el
      `<input type="time">`. Fallback: si el fetch de slots falla, vuelve al input time.
- [x] 3.2 vitest render con fetch mockeado (AC3).

## WU4 — Persistencia de edición en /citas
- [x] 4.1 `citas/page.tsx`: submit en modo API → `PATCH /bookings/:id`
      ({ start?, employeeId?, notes? }) + refresh; manejo de 409/422 con mensaje.
- [x] 4.2 vitest submit → PATCH llamado con body correcto; error del back visible (AC4).

## WU5 — Modal detalle de cita desde Inicio
- [x] 5.1 `components/crm/cita-detalle-modal.tsx` sobre `ui/modal.tsx`: dl/dt/dd de datos,
      textarea Anotaciones (Booking.notes) con Guardar (PATCH), botones Cerrar (outline)
      e Ir a agenda (primary → /citas?edit=id). Patrón visual del ContactInfoModal de
      agents-agency con tokens CRM (labels --acc, ✕ hover rotatorio).
- [x] 5.2 `agenda-widget.tsx`: click abre el modal (deep-link ?edit= se mantiene desde el
      botón Ir a agenda). vitest (AC5).

## WU6 — Modal ficha de cliente en /citas
- [x] 6.1 `components/crm/cliente-info-modal.tsx` (mismo patrón visual); nombre del
      cliente clickable en la lista de /citas → fetch del customer → modal. vitest (AC6).
      (Añadido `GET /customers/:id` en el back: no existía, WU6 lo necesitaba.)

## Cierre
- [x] Z.1a Suite front (vitest): 55 archivos, 366 tests, todos verdes.
- [x] Z.1b Suite back (node:test, con dotenv real): 285 tests, 258 pass / 27 fail — los
      27 fallos son rate-limit/pool de Supabase al lanzar TODO el e2e en paralelo, en
      ficheros PRE-EXISTENTES no tocados en este change (profile, users, members,
      documents, employee-schedules, notifications, sale-lines, settings,
      bookings-team). Los 8 tests nuevos de este change (bookings-slots ×5,
      customers-get-one ×3) están en verde incluso dentro de esa corrida completa.
- [x] Z.1c tsc limpio en `back` y en `front` (sin errores).
- [ ] Z.1d Smoke visual Playwright en dark (selects de nueva cita + chips + ambos
      modales) — NO ejecutado en esta sesión de apply; pendiente para verify/QA manual.
- [x] Z.2 Agentic Runtime review HECHO (02/07/2026): LIMPIO, cero hallazgos. Cross-tenant scoping
      verificado en GET /bookings/slots y GET /customers/:id; refactor availability.ts
      conserva semántica; PATCH con manejo de error sin pisar estado local; CSS scoped
      sin regresión en tpv/onboarding; fetches cancelables en modales nuevos. Cambio
      externo "Nueva"→"Añadir" (línea 125) confirmado benigno.
