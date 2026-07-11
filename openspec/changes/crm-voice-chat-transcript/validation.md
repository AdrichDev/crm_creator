# Validación — crm-voice-chat-transcript

Historia: como **cliente final** quiero preguntar o pedir un resumen sobre un audio que ya se
transcribió, para no tener que releer todo el texto y sacarle ideas útiles rápido.

## Criterios de aceptación (AC)
- **AC1 (solo DONE):** iniciar un chat sobre una transcripción en `UPLOADING`, `QUEUED`,
  `TRANSCRIBING` o `ERROR` se bloquea con un error explícito; solo `DONE` permite chatear.
- **AC2 (misma cuenta, sin cobro paralelo):** cada mensaje se factura por tokens a la misma
  cuenta END_USER que pagó la transcripción, a través de `crm-ai-proxy` — no existe un mecanismo
  de cobro independiente en este módulo.
- **AC3 (historial persistido):** los mensajes de una conversación se guardan y se listan en
  orden cronológico al reabrir la vista.
- **AC4 (sin saldo, fallo explícito):** si `crm-ai-proxy`/`crm-metering-core` deniega el turno
  por saldo insuficiente, el mensaje del usuario no queda como "enviado sin respuesta"; se
  muestra un aviso claro y el turno no se persiste como respondido.
- **AC5 (contexto acotado):** el contexto enviado al LLM en cada turno no incluye el transcript
  completo sin límite; se aplica truncado/resumen por encima de un umbral de tamaño.

## Por tarea (Given-When-Then + test)
- **WU1.1** Modelo `TranscriptChatMessage` → Given migración aplicada, When `prisma migrate
  status`, Then sin drift. Test: schema/migration test.
- **WU2.1** Bloqueo por estado → Given transcripción en `QUEUED`, When se intenta enviar un
  mensaje, Then `409`/`422` explícito y no se crea `TranscriptChatMessage`. Test:
  `transcript-chat.status-guard.test.ts`.
- **WU2.2** Reenvío a ai-proxy → Given transcripción `DONE` (mock `POST /ai-proxy/chat`), When
  se envía un mensaje de usuario, Then se persiste el mensaje `user` y la respuesta
  `assistant`, en ese orden. Test: `transcript-chat.test.ts` (mock proxy).
- **WU2.3** Fallo de saldo → Given `ai-proxy` responde denegado por saldo (mock 402), When se
  envía un mensaje, Then no se persiste turno `assistant` y se devuelve el error al front. Test:
  `transcript-chat.insufficient-balance.test.ts`.
- **WU2.4** Contexto acotado → Given un transcript largo (fixture > umbral), When se arma el
  contexto para el LLM, Then el texto enviado respeta el límite configurado. Test:
  `context-truncation.test.ts`.
- **WU3.1** Historial cronológico → Given una conversación con varios turnos, When se listan los
  mensajes, Then aparecen en orden ascendente por `createdAt`. Test:
  `transcript-chat.history.test.ts`.
- **WU4** Front — vista de chat → Given transcripción `DONE`, When se abre la vista, Then se
  muestra el historial y un input habilitado; si no está `DONE`, el input está deshabilitado con
  aviso. Test: front unit.

> Regla del repo: una tarea está DONE solo cuando su test está verde. Sin spec → no code.

## Estado
PROPUESTA — sin iniciar. Depende de que `crm-ai-proxy` exista (o su contrato esté acordado) y de
que `crm-voice-whisper-async` produzca transcripciones `DONE`.
