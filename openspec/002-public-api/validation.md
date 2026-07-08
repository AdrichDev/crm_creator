# Criterios de Aceptación (Fase 2)

## Historia de Usuario
Como agente externo (ej. Landing, Bot de IA), quiero poder consultar horarios, agendar citas y enviar leads sin tener sesión iniciada, para automatizar la captación comercial del negocio.

## Acceptance Criteria
- El endpoint /public/leads crea un registro en la tabla Contacto.
- El endpoint /public/availability retorna huecos libres correctos según las horas y reservas previas.
- El endpoint /public/bookings crea un nuevo Booking en estado PENDING.
- Se requiere pasar explícitamente un usinessId válido.
- Peticiones repetidas son bloqueadas por rate limit (HTTP 429).

## Given-When-Then
- **Given** Un visitante rellena un formulario de lead
- **When** La landing hace un POST a /public/leads con los datos y el usinessId
- **Then** Se inserta un Contacto en la BD y el backend devuelve HTTP 201.

