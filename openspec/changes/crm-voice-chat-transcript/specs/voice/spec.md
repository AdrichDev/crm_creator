# Spec delta — Capacidad: Voz (módulo)

## ADDED Requirements

### Requirement: Chat sobre un transcript existente
El sistema DEBE permitir enviar mensajes de chat sobre una transcripción y recibir respuesta de
un asistente basado en LLM, reutilizando el proxy de IA existente del CRM.

#### Scenario: Mensaje sobre transcript listo
- **Given** una transcripción en estado `DONE`
- **When** el cliente final envía un mensaje
- **Then** se persiste el turno del usuario y la respuesta del asistente, en ese orden

### Requirement: Bloqueo de chat si el transcript no está listo
El sistema DEBE rechazar explícitamente cualquier intento de chatear sobre una transcripción que
no esté en estado `DONE`.

#### Scenario: Transcripción en curso
- **Given** una transcripción en `TRANSCRIBING`
- **When** se intenta enviar un mensaje
- **Then** la API responde con error explícito y no se crea ningún mensaje

### Requirement: Historial de conversación persistido
El sistema DEBE conservar los mensajes de cada conversación asociada a una transcripción y
mostrarlos en orden cronológico.

### Requirement: Cobro unificado por tokens
El sistema DEBE facturar el consumo de tokens del chat a la misma cuenta END_USER que pagó la
transcripción, a través del mecanismo de cobro del proxy de IA existente, sin introducir un
cobro paralelo.
