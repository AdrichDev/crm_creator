# Proposal: Editar cita guarda TODOS los campos (persistencia real)

## Intent

Bug reportado (02/07/2026): "cuando das a guardar cita no persiste". Diagnóstico:
- El POST de creación SÍ persiste (verificado en Supabase: reservas creadas hoy).
- El modal de EDICIÓN (`front/app/(crm)/citas/page.tsx` `onSubmit`) solo envía
  `{ start }` al `PATCH /bookings/:id`. Cualquier otro campo editado (estado,
  empleado, notas, servicio…) se descarta silenciosamente → el usuario percibe
  que "no guarda".
- El PATCH del back (`back/src/routes/bookings.ts:345`) solo acepta `start`,
  `employeeId` y `notes`. No acepta `status` ni `serviceId`.

## Aclaración del usuario (02/07/2026)

El síntoma principal es al CREAR: "yo pongo una hora y automáticamente pone otra".
Causa raíz: bug de zona horaria con convención mixta en el back:
- `checkAvailability` hace `new Date(p.start)` con un string sin TZ
  (`2026-07-03T09:30:00`) → se interpreta en hora LOCAL del servidor (Madrid UTC+2)
  y Prisma persiste el instante UTC → `inicia_en = 07:30`.
- El GET lista con `startAt.toISOString().slice(11,16)` → muestra 07:30 (UTC).
- Los slots (`availability.ts`) usan `setHours/getHours` (local) — tercera convención.
Resultado: el usuario pone 09:30 y la cita aparece a las 07:30. Verificado en DB
(reservas creadas hoy a las 07:00/07:30 "wall clock" imposibles).

## Scope

### In Scope
0. **Back — convención única de hora "wall clock" (fix principal)**:
   - Todo el pipeline de reservas trata las horas como hora de pared del negocio,
     sin conversión de TZ: parsear `start` sin TZ como UTC (p. ej. sufijo `Z` o
     `Date.UTC(...)`), generar slots con `setUTCHours/getUTCHours`, y mostrar con
     `toISOString().slice(11,16)` (ya UTC). Una sola convención en
     `routes/bookings.ts` y `lib/availability.ts` (incluye `minutesOfDay`,
     comparaciones con horarios de apertura y `hora:` de los slots).
   - La hora que el usuario escribe es EXACTAMENTE la que se guarda y se muestra,
     independientemente de la TZ del servidor.
1. **Back** `PATCH /bookings/:id`:
   - Aceptar además `status` (validado contra el enum BookingStatus, registrando
     historial de estado como hacen los endpoints de transición si existen) y
     `serviceId` (revalidando disponibilidad si cambia junto con/sin `start`).
   - Mantener la revalidación de disponibilidad existente para reprogramación.
2. **Front** editor de citas (`app/(crm)/citas/page.tsx` `onSubmit`):
   - Enviar el payload completo de campos editados: `start`, `employeeId`,
     `serviceId`, `status`, `notes` (mapeo etiqueta española ↔ enum).
   - Tras guardar: `paged.refresh()` y el listado refleja los cambios.
   - Errores 409/422 siguen mostrando aviso sin cerrar el modal (comportamiento actual).

### Out of Scope
- Modo demo/localStorage (ya persiste vía `useCollection`, intencional y protegido).
- Cambio de cliente de una reserva existente.

## Level

Nivel 2 (Medium): 2 dominios (front+back), reversible, toca datos persistentes vía API
ya autenticada. SDD Light.
