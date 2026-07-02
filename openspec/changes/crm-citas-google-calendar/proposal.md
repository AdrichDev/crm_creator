# crm-citas-google-calendar

## Intención
Conectar la agenda del CRM (citas `Booking` + recordatorios del módulo `comercial`) con el
calendario del usuario (Google Calendar u otro), cumpliendo RF-21 (P2): "un recordatorio o cita
puede crearse en calendario externo **cuando el usuario lo confirme**".

## Problema
El comercial vive en Google Calendar. Hoy las citas y recordatorios del CRM solo existen dentro
del CRM: doble apunte manual o compromisos que no se ven donde el usuario mira su día.

## Alcance (unidireccional CRM → calendario, en dos escalones)
- **A. Feed ICS suscribible (escalón 1, sin OAuth):** endpoint `GET /calendar/feed/:token.ics`
  que publica citas y recordatorios del usuario como iCalendar. El usuario se suscribe una vez
  desde Google Calendar / Outlook / Apple Calendar (los tres soportan URL ICS). Token opaco por
  usuario, revocable y regenerable desde Mi Cuenta.
- **B. Push de eventos vía n8n (escalón 2, opt-in):** al confirmar una cita o crear un
  recordatorio con fecha, si el usuario tiene activado "enviar a mi calendario", el back emite un
  evento a n8n (patrón emisor soft-fail ya existente); el workflow n8n crea el evento en Google
  Calendar con las credenciales gestionadas en n8n. Con confirmación explícita por ítem o por
  preferencia global del usuario (regla de negocio 10).
- **C. UI:** sección "Calendario" en Mi Cuenta: URL ICS (copiar/regenerar/revocar) + toggle
  "enviar citas confirmadas a mi calendario".

## Fuera de alcance
Sincronización **bidireccional** (leer el calendario del usuario, detectar conflictos de agenda —
fase posterior explícita en el doc §5.2 y riesgo §15.1), OAuth de Google dentro del CRM,
recordatorios push nativos, calendarios por equipo.

## Decisiones
- **ICS primero:** cubre el 80% del valor (ver la agenda del CRM en Google Calendar) con cero
  credenciales externas, cero coste de API y compatibilidad universal. Gotcha asumido: Google
  refresca feeds ICS cada ~6-24 h (no tiempo real) → por eso existe el escalón B para lo urgente.
- **OAuth fuera del CRM (RNF-10, superficie de seguridad):** las credenciales de Google viven en
  n8n (patrón ya usado por el emisor de emails); el CRM solo emite eventos soft-fail. Si Google
  o n8n caen, el CRM sigue funcionando (caso de error §11 "integración externa caída").
- **Token ICS = secreto:** opaco (32+ bytes aleatorios), hasheado en DB como los AuthToken
  existentes, revocable; el feed expone solo datos del usuario dueño del token y limita el rango
  (p. ej. -30/+90 días).
- **Confirmación del usuario (regla 10):** nada se envía al calendario sin opt-in; el toggle es
  por usuario, no por negocio.

## Riesgos
- Feed ICS filtrado por token en URL → mitigado: hash en DB, revocación, rate-limit, HTTPS, y el
  feed no incluye notas comerciales (solo título, cliente, hora, dirección).
- Latencia de refresco ICS en Google → comunicarlo en la UI ("puede tardar horas en reflejarse").
- Duplicados si el usuario usa ICS + push a la vez → UID iCal estable por entidad
  (`booking-{id}@crm`) y el evento push usa el mismo identificador externo cuando sea posible;
  si no, la UI recomienda un solo mecanismo.
- Workflow n8n caído → soft-fail con log, sin bloquear la operación de cita (patrón existente).

## Rollback
Aditivo: quitar sección UI + desactivar endpoints. Migración solo añade tabla/columnas de token
de calendario y preferencia de usuario (reversible con DROP aislado).

## Dependencias
`crm-comercial-campo` aplicado (recordatorios). Infra n8n existente (escalón B). Nivel 4 →
**aprobación humana antes de Apply** (toca seguridad/tokens e integración externa).

## Criterios de éxito
El usuario ve sus citas y recordatorios del CRM en Google Calendar vía suscripción ICS; con el
toggle activo, una cita confirmada aparece en su calendario vía n8n sin doble apunte; revocar el
token deja el feed muerto al instante. back+front tests + tsc verdes.
