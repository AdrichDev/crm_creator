# Propuesta ? Agenda OperaOS, Contactos, Telegram UI y Fichaje

**Nivel Gru: 4 ? Cr?tica.** Cruza agenda CRUD, calendario externo, mapas, nuevo m?dulo, bot Telegram y reglas de fichaje.
**Estado: SPEC (pendiente implementaci?n).**

## Contexto
OperaOS (`creador_CRM`) ya tiene widget principal de agenda, p?gina `/citas`, integraci?n Google Calendar/ICS y m?dulo `fichaje` b?sico. El usuario pide convertir la agenda/citas/reservas a la vista exacta del widget principal, usar Google Maps, a?adir Contactos como en 3A Estudio, integrar Telegram como UI y corregir fichaje para evitar m?ltiples entradas inv?lidas.

## Intenci?n
1. Convertir `Agenda/Citas/Reservas` en una vista igual al widget principal.
2. Mantener CRUD en directo con Google Calendar del tenant conectado.
3. Sustituir el mapa actual por Google Maps.
4. Crear m?dulo `Contactos` igual visual y l?gicamente al de 3A Estudio/Agents Agency.
5. Implantar UI Telegram en vivo para leer/escribir desde OperaOS.
6. Corregir fichaje con modos `Jornada intensiva` y `Jornada partida`.

## Decisiones
- La agenda OperaOS es fuente visual can?nica para clonarla despu?s en Agents Agency.
- Google Calendar es proveedor inicial; Outlook u otros deben entrar por puerto com?n.
- Contactos debe replicar el patr?n de `agents-agency/front/app/contactos` y componentes asociados.
- Fichaje debe impedir registros arbitrarios: el siguiente bot?n depende del modo y estado del d?a.

## Alcance
- P?gina `/citas` y widget agenda compartiendo gram?tica visual.
- CRUD calendario externo tenant-aware.
- Google Maps en vistas con ubicaci?n.
- Nuevo m?dulo `contactos` en configuraci?n, navegaci?n, front y API/modelo si falta.
- Telegram UI operativa.
- Fichaje con jornada intensiva/partida y validaci?n por d?a.

## Fuera de alcance
- Rehacer todas las integraciones de comunicaci?n.
- Geocoding avanzado o optimizaci?n de rutas.
- App m?vil nativa.

## Riesgos
- Romper terminolog?a sectorial `citas/reservas/clases`.
- Duplicar calendario local/remoto si no hay idempotencia.
- Fichaje legal incompleto si no se guardan eventos at?micos.

## Dependencias
- Reutilizar `creador_CRM/front/components/panel/widgets/agenda-widget.tsx` como referencia visual.
- Reutilizar l?gica Google Calendar existente en `back/src/lib/calendar*` y `back/src/lib/integrations/calendar.ts`.

