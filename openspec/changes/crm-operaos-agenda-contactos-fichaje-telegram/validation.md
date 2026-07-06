# Validaci?n ? crm-operaos-agenda-contactos-fichaje-telegram

Historia: como operador de OperaOS quiero una agenda visual ?nica, contactos completos, Telegram integrado y fichaje controlado, para operar el negocio en directo sin duplicar herramientas externas.

## Criterios de aceptaci?n (AC)
- **AC1:** la secci?n `Agenda/Citas/Reservas` usa exactamente la vista del widget principal, adaptada a pantalla de m?dulo.
- **AC2:** altas, ediciones y cancelaciones sincronizan en directo con Google Calendar del tenant conectado.
- **AC3:** cualquier mapa embebido o enlace de ubicaci?n usa Google Maps.
- **AC4:** existe m?dulo `Contactos` igual al de 3A Estudio/Agents Agency en visual y l?gica.
- **AC5:** Telegram UI muestra conversaci?n en directo y permite escribir desde OperaOS.
- **AC6:** fichaje no permite fichar varias veces sin orden; `Jornada intensiva` exige entrada/salida y `Jornada partida` exige entrada, salida comida, vuelta comida y salida final.

## Por tarea (Dado-Cuando-Entonces + test)
- **WU1 agenda visual** ? **DADO** el widget principal de agenda, **CUANDO** abro `/citas`, **ENTONCES** veo la misma UI a escala de p?gina. Test: snapshot visual.
- **WU2 calendar CRUD** ? **DADO** Google Calendar conectado, **CUANDO** creo/edito/cancelo cita, **ENTONCES** el evento externo se crea/actualiza/cancela. Test: contract mock.
- **WU3 mapas** ? **DADO** una direcci?n, **CUANDO** pulso ubicaci?n, **ENTONCES** abre Google Maps. Test: URL builder.
- **WU4 contactos** ? **DADO** el m?dulo activo, **CUANDO** entro en `Contactos`, **ENTONCES** visual y l?gica coinciden con 3A Estudio. Test: UI + API.
- **WU5 Telegram UI** ? **DADO** conversaci?n Telegram, **CUANDO** llegan y salen mensajes, **ENTONCES** se ven en directo y quedan persistidos. Test: webhook/UI.
- **WU6 fichaje** ? **DADO** modo intensivo o partido, **CUANDO** ficho durante el d?a, **ENTONCES** solo se permite el siguiente paso v?lido. Test: unit + UI.

## Sub-items Fase 11 (2026-07-06): horario de negocio + pin + horas disponibles

- **AC7:** el modal de detalle de cita muestra un pin de ubicación a la izquierda de "Guardar anotación" (misma fila) que abre la dirección en Google Maps; sin dirección el pin no aparece.
- **AC8:** el calendario del tenant demo "Comercial Demo IA" muestra chips de horas disponibles en días laborables (OpeningHour sembrado; domingo sin chips).
- **AC9:** el onboarding (paso Datos) permite definir el horario del negocio (continuo/partido, grupos de días L-D, día sin grupo = cerrado) y al guardar se persiste en TenantConfig.horario Y en OpeningHour vía PUT /config/horario; configs antiguas sin `horario` siguen cargando.

- **WU-11.1 pin cita** — **DADO** una cita con dirección, **CUANDO** abro su detalle, **ENTONCES** hay un pin junto a "Guardar anotación" que abre Google Maps. Test: `cita-detalle-modal.test.tsx` (pin con URL / oculto sin dirección).
- **WU-11.2 horas disponibles** — **DADO** el demo con OpeningHour sembrado, **CUANDO** pido los huecos de un miércoles, **ENTONCES** hay chips (y domingo vacío). Test: verificación in situ del seed con `daySlotsWithAvailability`.
- **WU-11.3 horario onboarding** — **DADO** grupos de días con tramos, **CUANDO** guardo el proyecto, **ENTONCES** los grupos se aplanan a tramos por día y se reemplazan atómicamente en OpeningHour de la sucursal del negocio. Tests: `schedule.test.ts`, `horario-negocio-form.test.tsx`, `config-horario.e2e.test.ts`.

> Regla del repo: una tarea est? DONE solo cuando su test est? verde. Sin spec, no hay implementaci?n v?lida.

