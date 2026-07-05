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

> Regla del repo: una tarea est? DONE solo cuando su test est? verde. Sin spec, no hay implementaci?n v?lida.

